-- A pending deletion keeps only the identity needed to block re-registration and
-- the provider identifiers needed to finish cleanup. The final Auth hard delete
-- also removes this record. Personal product records are erased on acceptance.
create table public.user_deletions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  connected_account_ids text[] not null default '{}',
  trigger_ids text[] not null default '{}',
  whatsapp_purged boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  next_attempt_at timestamptz not null default statement_timestamp(),
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0
);

alter table public.user_deletions enable row level security;
alter table public.user_deletions force row level security;
revoke all on public.user_deletions from public, anon, authenticated;
grant select, update on public.user_deletions to service_role;

create index user_deletions_due_idx on public.user_deletions (next_attempt_at);

-- Service callers and direct REST access must reject a deleted/deleting User,
-- even when the caller holds a signed JWT that has not yet expired.
create function public.monara_user_is_active(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from auth.users where id = p_user_id)
    and not exists (select 1 from public.user_deletions where user_id = p_user_id)
$$;
revoke all on function public.monara_user_is_active(uuid) from public, anon, authenticated;
grant execute on function public.monara_user_is_active(uuid) to service_role;

create function public.monara_session_is_active()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.monara_user_is_active(auth.uid())
$$;
revoke all on function public.monara_session_is_active() from public, anon;
grant execute on function public.monara_session_is_active() to authenticated, service_role;

-- Every product write (including service-role writes already in flight) shares
-- the same per-User lock with deletion acceptance. No write may resurrect data.
create function private.require_live_monara_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  v_user_id := (to_jsonb(new) ->> case when tg_table_name = 'profiles' then 'id' else 'user_id' end)::uuid;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 190026));
  if not public.monara_user_is_active(v_user_id) then
    raise exception using errcode = '23514', message = 'This Monara identity is unavailable.';
  end if;
  return new;
end;
$$;
revoke all on function private.require_live_monara_user() from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  for v_table in
    select distinct table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'user_id'
      and table_name <> 'user_deletions'
    union select 'profiles'
  loop
    execute format(
      'create trigger aa_require_live_user before insert or update on public.%I
       for each row execute function private.require_live_monara_user()', v_table);
    execute format(
      'create policy live_session_only on public.%I as restrictive for all to authenticated
       using ((select public.monara_session_is_active()))
       with check ((select public.monara_session_is_active()))', v_table);
  end loop;
end;
$$;

create function public.begin_user_deletion(p_confirmation text, p_acknowledged boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_table text;
begin
  if p_confirmation is distinct from 'DELETE MY ACCOUNT' or p_acknowledged is distinct from true then
    raise exception using errcode = '22023', message = 'Deletion confirmation is required.';
  end if;
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Sign in to continue.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 190026));
  -- A signed old token may recover the receipt after a lost acceptance response,
  -- but may never start another deletion after its session has been revoked.
  if exists (select 1 from public.user_deletions where user_id = v_user_id) then return; end if;
  if not public.monara_session_is_active() or not exists (
    select 1 from auth.sessions
    where user_id = v_user_id and id::text = auth.jwt() ->> 'session_id'
  ) then
    raise exception using errcode = '42501', message = 'Sign in to continue.';
  end if;

  insert into public.user_deletions (user_id, connected_account_ids, trigger_ids)
  select v_user_id,
    coalesce(array_agg(distinct composio_connected_account_id), '{}'),
    coalesce(array_agg(distinct composio_trigger_id) filter (where composio_trigger_id is not null), '{}')
  from public.gmail_connections where user_id = v_user_id;

  -- Keep Google sign-in from creating a replacement while cleanup is unfinished.
  update auth.users set banned_until = clock_timestamp() + interval '100 years' where id = v_user_id;
  delete from auth.sessions where user_id = v_user_id;

  -- Deferred ownership references allow the whole owned graph to disappear in
  -- one transaction. Accounts go first to avoid SET NULL updates after the fence.
  delete from public.financial_accounts where user_id = v_user_id;
  for v_table in
    select distinct table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'user_id'
      and table_name not in ('user_deletions', 'financial_accounts')
    order by table_name
  loop
    execute format('delete from public.%I where user_id = $1', v_table) using v_user_id;
  end loop;
  delete from public.profiles where id = v_user_id;
end;
$$;
revoke all on function public.begin_user_deletion(text, boolean) from public, anon;
grant execute on function public.begin_user_deletion(text, boolean) to authenticated;

-- Lease one step, rather than trusting a browser or an in-memory retry loop.
create function public.claim_user_deletion(p_user_id uuid default null)
returns setof public.user_deletions
language sql security definer set search_path = ''
as $$
  update public.user_deletions as deletion
  set lease_token = gen_random_uuid(), lease_until = clock_timestamp() + interval '90 seconds',
      attempts = deletion.attempts + 1
  where deletion.user_id = (
    select candidate.user_id from public.user_deletions as candidate
    where (p_user_id is null or candidate.user_id = p_user_id)
      and candidate.next_attempt_at <= clock_timestamp()
      and (candidate.lease_until is null or candidate.lease_until < clock_timestamp())
      -- Let bounded consent/trigger requests issued before acceptance settle
      -- before the final provider inventory. This is never a recovery period.
      and (not candidate.whatsapp_purged
        or cardinality(candidate.connected_account_ids) > 0
        or cardinality(candidate.trigger_ids) > 0
        or candidate.created_at <= clock_timestamp() - interval '2 minutes')
    order by candidate.next_attempt_at, candidate.created_at
    for update skip locked limit 1
  )
  returning deletion.*
$$;
revoke all on function public.claim_user_deletion(uuid) from public, anon, authenticated;
grant execute on function public.claim_user_deletion(uuid) to service_role;
