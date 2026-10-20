-- Private reusable institutions. Built-in institution keys and historical account IDs stay intact.
create table public.custom_banks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution_key text generated always as ('custom_' || replace(id::text, '-', '')) stored,
  client_request_id text not null check (char_length(client_request_id) between 1 and 200),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  platform text not null check (platform in ('BANKING_APP', 'CREDIT_CARD', 'E_WALLET')),
  logo text check (logo is null or logo ~ '^(brand:[a-z0-9-]{1,60}|si:[a-z0-9]{1,60})$'),
  creation_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, user_id),
  unique (id, user_id, institution_key),
  unique (user_id, institution_key),
  unique (user_id, client_request_id)
);

create table public.custom_bank_senders (
  custom_bank_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_email text not null check (
    char_length(sender_email) <= 320 and sender_email = lower(btrim(sender_email))
    and sender_email ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$'
  ),
  primary key (user_id, sender_email),
  foreign key (custom_bank_id, user_id) references public.custom_banks(id, user_id) on delete cascade
);
create index custom_bank_senders_bank_idx on public.custom_bank_senders(custom_bank_id, user_id);

alter table public.financial_accounts add column custom_bank_id uuid;
alter table public.financial_accounts add constraint financial_accounts_custom_bank_owner_fkey
  foreign key (custom_bank_id, user_id, institution_key)
  references public.custom_banks(id, user_id, institution_key)
  on delete no action deferrable initially deferred;
alter table public.financial_accounts add constraint financial_accounts_custom_bank_identity_check check (
  (custom_bank_id is null and (institution_key is null or institution_key !~ '^custom_'))
  or (custom_bank_id is not null and institution_key is not null
      and institution_key = 'custom_' || replace(custom_bank_id::text, '-', ''))
);
create index financial_accounts_custom_bank_idx on public.financial_accounts(custom_bank_id, user_id)
  where custom_bank_id is not null;

-- Derive the reference from the stable key, but resolve it only inside the account owner's scope.
create function private.assign_custom_bank_account() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_bank public.custom_banks%rowtype;
begin
  if new.institution_key like 'custom\_%' escape '\' then
    select * into v_bank from public.custom_banks
      where user_id = new.user_id and institution_key = new.institution_key;
    if not found then
      raise exception using errcode = '23503', message = 'That Custom Bank is unavailable.';
    end if;
    if new.account_type <> (case when v_bank.platform = 'E_WALLET' then 'wallet' else 'bank' end) then
      raise exception using errcode = '23514', message = 'The account type must match its Custom Bank.';
    end if;
    new.custom_bank_id := v_bank.id;
    new.institution := v_bank.name;
  else
    new.custom_bank_id := null;
  end if;
  return new;
end;
$$;
revoke all on function private.assign_custom_bank_account() from public, anon, authenticated;
create trigger financial_accounts_custom_bank before insert or update on public.financial_accounts
  for each row execute function private.assign_custom_bank_account();

alter table public.custom_banks enable row level security;
alter table public.custom_banks force row level security;
alter table public.custom_bank_senders enable row level security;
alter table public.custom_bank_senders force row level security;
revoke all on public.custom_banks, public.custom_bank_senders from public, anon, authenticated;
grant select on public.custom_banks, public.custom_bank_senders to authenticated;
grant select, insert, update, delete on public.custom_banks, public.custom_bank_senders to service_role;
create policy custom_banks_owner_select on public.custom_banks for select to authenticated
  using (user_id = (select auth.uid()));
create policy custom_bank_senders_owner_select on public.custom_bank_senders for select to authenticated
  using (user_id = (select auth.uid()));
create policy live_session_only on public.custom_banks as restrictive for all to authenticated
  using ((select public.monara_session_is_active())) with check ((select public.monara_session_is_active()));
create policy live_session_only on public.custom_bank_senders as restrictive for all to authenticated
  using ((select public.monara_session_is_active())) with check ((select public.monara_session_is_active()));
create trigger aa_require_live_user before insert or update on public.custom_banks
  for each row execute function private.require_live_monara_user();
create trigger aa_require_live_user before insert or update on public.custom_bank_senders
  for each row execute function private.require_live_monara_user();
create trigger custom_banks_set_updated_at before update on public.custom_banks
  for each row execute function private.set_updated_at();

create function private.replace_custom_bank_senders(p_bank_id uuid, p_user_id uuid, p_senders jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_senders is null or jsonb_typeof(p_senders) <> 'array'
    or jsonb_array_length(p_senders) not between 1 and 20 then
    raise exception using errcode = '23514', message = 'Provide one to twenty sender addresses.';
  end if;
  delete from public.custom_bank_senders where custom_bank_id = p_bank_id and user_id = p_user_id;
  insert into public.custom_bank_senders(custom_bank_id, user_id, sender_email)
    select p_bank_id, p_user_id, lower(btrim(value)) from jsonb_array_elements_text(p_senders);
end;
$$;
revoke all on function private.replace_custom_bank_senders(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function private.replace_custom_bank_senders(uuid, uuid, jsonb) to service_role;

-- Service-only: the web backend has already resolved the signed-in identity and validated catalog collisions.
create function public.create_custom_bank_account(
  p_user_id uuid, p_bank_id uuid, p_client_request_id text, p_values jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_existing public.custom_banks%rowtype;
  v_account_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 190026));
  if not public.monara_user_is_active(p_user_id) then
    raise exception using errcode = '23514', message = 'This Monara identity is unavailable.';
  end if;
  select * into v_existing from public.custom_banks
    where user_id = p_user_id and client_request_id = p_client_request_id;
  if found then
    if v_existing.id <> p_bank_id or v_existing.creation_payload is distinct from p_values then
      raise exception using errcode = '23505', message = 'That request ID was already used.';
    end if;
    select id into v_account_id from public.financial_accounts
      where user_id = p_user_id and client_request_id = p_client_request_id
        and custom_bank_id = p_bank_id;
    if v_account_id is null then
      raise exception using errcode = '23514', message = 'That creation could not be recovered.';
    end if;
    return v_account_id;
  end if;
  if (select count(*) from public.custom_banks where user_id = p_user_id) >= 100 then
    raise exception using errcode = '23514', message = 'The Custom Bank limit has been reached.';
  end if;
  insert into public.custom_banks(id, user_id, client_request_id, name, platform, logo, creation_payload)
    values(p_bank_id, p_user_id, p_client_request_id, p_values->>'name', p_values->>'platform',
      p_values->>'logo', p_values);
  perform private.replace_custom_bank_senders(p_bank_id, p_user_id, p_values->'senderEmails');
  insert into public.financial_accounts(user_id, client_request_id, name, institution, institution_key,
    account_type, currency, last_four, gmail_connection_id)
    values(p_user_id, p_client_request_id, p_values->>'accountName', p_values->>'name',
      'custom_' || replace(p_bank_id::text, '-', ''),
      case when p_values->>'platform' = 'E_WALLET' then 'wallet' else 'bank' end,
      'IDR', p_values->>'lastFour', (p_values->>'gmailConnectionId')::uuid)
    returning id into v_account_id;
  return v_account_id;
end;
$$;
revoke all on function public.create_custom_bank_account(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_custom_bank_account(uuid, uuid, text, jsonb) to service_role;

create function public.update_custom_bank(
  p_user_id uuid, p_bank_id uuid, p_expected_updated_at timestamptz, p_values jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_bank public.custom_banks%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 190026));
  if not public.monara_user_is_active(p_user_id) then
    raise exception using errcode = '23514', message = 'This Monara identity is unavailable.';
  end if;
  select * into v_bank from public.custom_banks where id = p_bank_id and user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'That Custom Bank was not found.';
  end if;
  if v_bank.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'That Custom Bank changed. Refresh and try again.';
  end if;
  perform private.replace_custom_bank_senders(p_bank_id, p_user_id, p_values->'senderEmails');
  update public.custom_banks set name = p_values->>'name', logo = p_values->>'logo' where id = p_bank_id;
end;
$$;
revoke all on function public.update_custom_bank(uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.update_custom_bank(uuid, uuid, timestamptz, jsonb) to service_role;
