-- The daily rescan tells the User about banks, cards, and wallets that started emailing
-- after the first scan. A finding keeps when it was first seen and whether the User
-- dismissed it across rescans; the first completed scan marks what was already known.
alter table public.gmail_institution_discoveries
  add column first_seen_at timestamptz not null default statement_timestamp(),
  add column dismissed_at timestamptz;

update public.gmail_institution_discoveries set first_seen_at = discovered_at;

alter table public.gmail_connections
  add column discovery_first_completed_at timestamptz;

update public.gmail_connections
  set discovery_first_completed_at = discovery_updated_at
  where discovery_state = 'completed';

-- Updates the connection's discoveries to what the latest scan found. Findings the
-- scan no longer sees are removed; the rest keep first_seen_at and dismissed_at.
create or replace function public.record_gmail_discovery(p_connection_id uuid, p_found jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if jsonb_typeof(p_found) <> 'array' then
    raise exception using errcode = '22023', message = 'Discoveries must be an array.';
  end if;
  select connection.user_id
    into v_user_id
    from public.gmail_connections as connection
    where connection.id = p_connection_id
      and connection.status = 'active'
    for update of connection;
  if v_user_id is null then
    raise exception using errcode = 'P0002', message = 'Gmail connection is not active.';
  end if;

  delete from public.gmail_institution_discoveries as discovery
    where discovery.gmail_connection_id = p_connection_id
      and not exists (
        select 1 from jsonb_array_elements(p_found) as entry
        where entry ->> 'institutionKey' = discovery.institution_key
      );
  insert into public.gmail_institution_discoveries (
    gmail_connection_id, user_id, institution_key, email_count, last_fours, last_seen_at
  )
  select
    p_connection_id,
    v_user_id,
    entry ->> 'institutionKey',
    (entry ->> 'emailCount')::integer,
    coalesce(
      array(select jsonb_array_elements_text(entry -> 'lastFours')),
      '{}'
    ),
    (entry ->> 'lastSeenAt')::timestamptz
  from jsonb_array_elements(p_found) as entry
  on conflict (gmail_connection_id, institution_key) do update
    set email_count = excluded.email_count,
        last_fours = excluded.last_fours,
        last_seen_at = excluded.last_seen_at,
        discovered_at = statement_timestamp();

  update public.gmail_connections
    set discovery_state = 'completed',
        discovery_updated_at = statement_timestamp(),
        discovery_first_completed_at = coalesce(discovery_first_completed_at, statement_timestamp())
    where id = p_connection_id;
end;
$$;
