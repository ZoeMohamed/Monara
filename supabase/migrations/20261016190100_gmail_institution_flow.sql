-- Institution-based Gmail ingestion:
-- 1. A Financial Account may name its registry entry
--    (packages/contracts/src/institutions/institution-senders.json); Gmail imports
--    from that entry's senders map to the account.
-- 2. Discovery: after a Gmail connection, which registry entries have emailed the
--    User, so the app can suggest accounts to add or link.
-- 3. record_gmail_extraction maps the account from the sender's entry, takes the
--    category from the User's own history, and auto-confirms only verified senders.
-- 4. A shared merchant_profiles cache for categorization, and an idempotent
--    category write-back that never overrides the User.

alter table public.financial_accounts
  add column institution_key text check (institution_key ~ '^[A-Za-z0-9_]{1,60}$');

create index financial_accounts_user_institution_idx
  on public.financial_accounts (user_id, institution_key)
  where institution_key is not null;

alter table public.gmail_connections
  add column discovery_state text not null default 'idle'
    check (discovery_state in ('idle', 'running', 'completed', 'failed')),
  add column discovery_updated_at timestamptz;

-- One row per registry entry that emailed a connection's mailbox. Service-role only.
create table public.gmail_institution_discoveries (
  gmail_connection_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  institution_key text not null check (institution_key ~ '^[A-Za-z0-9_]{1,60}$'),
  email_count integer not null check (email_count > 0),
  last_fours text[] not null default '{}'
    check (cardinality(last_fours) <= 10 and array_to_string(last_fours, ',') ~ '^([0-9]{4}(,[0-9]{4})*)?$'),
  last_seen_at timestamptz,
  discovered_at timestamptz not null default statement_timestamp(),
  primary key (gmail_connection_id, institution_key),
  foreign key (gmail_connection_id, user_id)
    references public.gmail_connections (id, user_id) on delete cascade
);

alter table public.gmail_institution_discoveries enable row level security;
alter table public.gmail_institution_discoveries force row level security;
revoke all on table public.gmail_institution_discoveries from public, anon, authenticated;
grant select, insert, update, delete on table public.gmail_institution_discoveries
  to service_role;

-- Public facts about a merchant from web search, shared by every User. Holds no
-- User data: only the normalized merchant name, the query, and a short summary.
create table public.merchant_profiles (
  merchant_key text primary key check (char_length(merchant_key) between 1 and 300),
  status text not null check (status in ('searching', 'ready')),
  summary text check (summary is null or char_length(summary) <= 2000),
  claimed_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz
);

alter table public.merchant_profiles enable row level security;
alter table public.merchant_profiles force row level security;
revoke all on table public.merchant_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.merchant_profiles to service_role;

-- How a merchant name is compared: lowercase, single spaces, no surrounding spaces.
create function public.normalize_merchant_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$ select nullif(lower(btrim(regexp_replace(p_name, '\s+', ' ', 'g'))), '') $$;

create function public.start_gmail_discovery(p_connection_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.gmail_connections
    set discovery_state = 'running', discovery_updated_at = statement_timestamp()
    where id = p_connection_id
      and status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'Gmail connection is not active.';
  end if;
end;
$$;

-- Replaces the connection's discoveries with what the latest scan found.
create function public.record_gmail_discovery(p_connection_id uuid, p_found jsonb)
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

  delete from public.gmail_institution_discoveries
    where gmail_connection_id = p_connection_id;
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
  from jsonb_array_elements(p_found) as entry;

  update public.gmail_connections
    set discovery_state = 'completed', discovery_updated_at = statement_timestamp()
    where id = p_connection_id;
end;
$$;

create function public.fail_gmail_discovery(p_connection_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.gmail_connections
    set discovery_state = 'failed', discovery_updated_at = statement_timestamp()
    where id = p_connection_id;
end;
$$;

-- The owner's active accounts belonging to one registry entry, and the category the
-- owner last confirmed for a merchant. Both used only inside record_gmail_extraction.
create function public.gmail_item_account(
  p_user_id uuid,
  p_institution_key text,
  p_kind text,
  p_last_four text
)
returns uuid
language sql
stable
set search_path = ''
as $$
  -- Transfers need a from and a to account, which email extraction never sets.
  -- One account of the entry maps unless the email names a different card ending;
  -- several accounts map only when exactly one has the ending the email names.
  select case
    when p_kind is not distinct from 'transfer' or p_institution_key is null then null
    when count(*) = 1 and (
        p_last_four is null
        or (array_agg(account.last_four))[1] is null
        or (array_agg(account.last_four))[1] = p_last_four
      ) then (array_agg(account.id))[1]
    when count(*) > 1 and p_last_four is not null
      and count(*) filter (where account.last_four = p_last_four) = 1
      then (array_agg(account.id) filter (where account.last_four = p_last_four))[1]
  end
  from public.financial_accounts as account
  where account.user_id = p_user_id
    and account.is_active
    and account.institution_key = p_institution_key
$$;

create function public.user_merchant_category(p_user_id uuid, p_merchant_name text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select item.category_id
    from public.transactions as item
    join public.categories as category
      on category.id = item.category_id
      and category.user_id = item.user_id
      and not category.is_archived
    where item.user_id = p_user_id
      and item.review_status = 'confirmed'
      and item.deleted_at is null
      and public.normalize_merchant_name(item.merchant_name)
        = public.normalize_merchant_name(p_merchant_name)
    order by item.updated_at desc
    limit 1
$$;

-- Records one email's extraction. p_institution_key is the registry entry of the
-- email's sender, and p_sender_verified whether Gmail authenticated that sender's
-- domain (DKIM or SPF). Returns the transaction ids and those still uncategorized.
create function public.record_gmail_extraction(
  p_processed_message_id uuid,
  p_outcome text,
  p_items jsonb,
  p_sender_verified boolean,
  p_institution_key text default null
)
returns table (
  transaction_ids uuid[],
  already_finished boolean,
  uncategorized_transaction_ids uuid[]
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_message public.processed_gmail_messages%rowtype;
begin
  if p_outcome not in ('transactions', 'skipped', 'failed') then
    raise exception using errcode = '22023', message = 'Unknown extraction outcome.';
  end if;
  if jsonb_typeof(p_items) <> 'array'
    or (p_outcome = 'transactions') <> (jsonb_array_length(p_items) > 0) then
    raise exception using errcode = '22023', message = 'Items do not match the outcome.';
  end if;

  -- The message lock serializes concurrent attempts for the same message. The share
  -- lock on the connection makes a concurrent disconnect wait until this record ends,
  -- so transactions are never added after the connection stopped being active.
  select message.*
    into v_message
    from public.processed_gmail_messages as message
    join public.gmail_connections as connection
      on connection.id = message.gmail_connection_id
      and connection.user_id = message.user_id
    where message.id = p_processed_message_id
      and connection.status = 'active'
    for update of message
    for share of connection;
  if v_message.id is null then
    raise exception using errcode = 'P0002', message = 'Gmail connection is not active.';
  end if;

  if v_message.processing_status not in ('processed', 'skipped') and p_outcome = 'transactions' then
    insert into public.transactions (
      user_id,
      processed_gmail_message_id,
      source_item_index,
      source_type,
      review_status,
      transaction_type,
      merchant_name,
      amount,
      currency,
      occurred_on,
      occurred_time,
      description,
      location,
      account_hint,
      financial_account_id,
      category_id,
      ai_confidence
    )
    select
      v_message.user_id,
      v_message.id,
      (mapped.ordinality - 1)::integer,
      'gmail_email',
      -- Confirmed only for an authenticated sender, when confident and complete
      -- enough to count toward totals. Items the extractor guarded have their
      -- confidence capped below the threshold.
      case
        when p_sender_verified
          and mapped.confidence >= public.gmail_auto_confirm_confidence()
          and mapped.kind in ('expense', 'income')
          and mapped.amount is not null
          and mapped.currency = 'IDR'
          and mapped.occurred_on is not null
          and mapped.financial_account_id is not null
          and (mapped.merchant_name is not null or mapped.description is not null)
          then 'confirmed'
        else 'pending'
      end,
      mapped.kind,
      mapped.merchant_name,
      mapped.amount,
      mapped.currency,
      mapped.occurred_on,
      mapped.occurred_time,
      mapped.description,
      mapped.location,
      mapped.account_hint,
      mapped.financial_account_id,
      case when mapped.kind is distinct from 'transfer' then
        public.user_merchant_category(v_message.user_id, mapped.merchant_name)
      end,
      mapped.confidence
    from (
      select
        entry.ordinality,
        entry.item ->> 'kind' as kind,
        entry.item ->> 'merchantName' as merchant_name,
        (entry.item -> 'money' ->> 'amountMinor')::numeric as amount,
        entry.item -> 'money' ->> 'currency' as currency,
        (entry.item ->> 'occurredOn')::date as occurred_on,
        (entry.item ->> 'occurredTime')::time as occurred_time,
        entry.item ->> 'description' as description,
        entry.item ->> 'location' as location,
        entry.item ->> 'accountHint' as account_hint,
        public.gmail_item_account(
          v_message.user_id,
          p_institution_key,
          entry.item ->> 'kind',
          entry.item ->> 'accountLastFour'
        ) as financial_account_id,
        round((entry.item ->> 'confidence')::numeric, 3) as confidence
      from jsonb_array_elements(p_items) with ordinality as entry (item, ordinality)
    ) as mapped
    on conflict (processed_gmail_message_id, source_item_index)
      where processed_gmail_message_id is not null
      do nothing;
  end if;

  if v_message.processing_status not in ('processed', 'skipped') then
    update public.processed_gmail_messages
      set processing_status = case p_outcome
          when 'transactions' then 'processed'
          else p_outcome
        end,
        processed_at = statement_timestamp()
      where id = v_message.id;
  end if;

  return query
    select
      coalesce(array_agg(item.id order by item.source_item_index), array[]::uuid[]),
      v_message.processing_status in ('processed', 'skipped'),
      coalesce(
        array_agg(item.id order by item.source_item_index) filter (
          where item.category_id is null
            and item.transaction_type is distinct from 'transfer'
            and item.merchant_name is not null
        ),
        array[]::uuid[]
      )
      from public.transactions as item
      where item.processed_gmail_message_id = v_message.id;
end;
$$;

-- Categorization's view of one imported transaction: what to search and for whom.
create function public.imported_transaction_for_category(p_transaction_id uuid)
returns table (
  user_id uuid,
  merchant_name text,
  location text,
  needs_category boolean
)
language sql
stable
set search_path = ''
as $$
  select
    item.user_id,
    item.merchant_name,
    item.location,
    item.category_id is null and item.updated_at = item.created_at and item.deleted_at is null
  from public.transactions as item
  where item.id = p_transaction_id
    and item.source_type = 'gmail_email'
$$;

-- Fills the category of an imported transaction from categorization. Changes nothing
-- once the transaction has a category or the User has edited or deleted it, so a
-- retried job and a late result are both harmless. The name must match exactly one
-- of the owner's unarchived Categories.
create function public.set_imported_category(p_transaction_id uuid, p_category_name text)
returns table (applied boolean, user_id uuid, review_status text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.transactions%rowtype;
  v_category_id uuid;
begin
  select item.*
    into v_item
    from public.transactions as item
    where item.id = p_transaction_id
      and item.source_type = 'gmail_email'
    for update of item;
  if v_item.id is null then
    raise exception using errcode = 'P0002', message = 'Imported transaction not found.';
  end if;

  select case when count(*) = 1 then (array_agg(category.id))[1] end
    into v_category_id
    from public.categories as category
    where category.user_id = v_item.user_id
      and not category.is_archived
      and lower(btrim(category.name)) = lower(btrim(p_category_name));

  if v_category_id is null
    or v_item.category_id is not null
    or v_item.deleted_at is not null
    or v_item.updated_at <> v_item.created_at then
    return query select false, v_item.user_id, v_item.review_status;
    return;
  end if;

  update public.transactions
    set category_id = v_category_id
    where id = v_item.id;
  return query select true, v_item.user_id, v_item.review_status;
end;
$$;

-- Merchant searches are shared. The first job for a merchant claims it and searches;
-- others wait for the result. A claim older than two minutes is assumed abandoned.
create function public.claim_merchant_profile(p_merchant_key text)
returns table (status text, summary text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.merchant_profiles%rowtype;
begin
  insert into public.merchant_profiles (merchant_key, status, claimed_at)
    values (p_merchant_key, 'searching', statement_timestamp())
    on conflict (merchant_key) do nothing;
  if found then
    return query select 'claimed'::text, null::text;
    return;
  end if;

  select profile.*
    into v_profile
    from public.merchant_profiles as profile
    where profile.merchant_key = p_merchant_key
    for update of profile;

  if v_profile.status = 'ready' and v_profile.expires_at > statement_timestamp() then
    return query select 'ready'::text, v_profile.summary;
    return;
  end if;
  if v_profile.status = 'searching'
    and v_profile.claimed_at > statement_timestamp() - interval '2 minutes' then
    return query select 'busy'::text, null::text;
    return;
  end if;

  update public.merchant_profiles
    set status = 'searching', claimed_at = statement_timestamp(),
      updated_at = statement_timestamp()
    where merchant_key = p_merchant_key;
  return query select 'claimed'::text, null::text;
end;
$$;

-- Stores a search result; a null summary records that nothing useful was found, so the
-- merchant is not searched again until the profile expires.
create function public.save_merchant_profile(p_merchant_key text, p_summary text default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.merchant_profiles
    set status = 'ready',
      summary = p_summary,
      claimed_at = null,
      updated_at = statement_timestamp(),
      expires_at = statement_timestamp() + interval '90 days'
    where merchant_key = p_merchant_key
$$;

-- Gives up a claim after a failed search so another job can try again at once.
create function public.release_merchant_profile(p_merchant_key text)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.merchant_profiles
    where merchant_key = p_merchant_key
      and status = 'searching'
$$;

revoke execute on function public.normalize_merchant_name(text) from public, anon, authenticated;
revoke execute on function public.start_gmail_discovery(uuid) from public, anon, authenticated;
revoke execute on function public.record_gmail_discovery(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.fail_gmail_discovery(uuid) from public, anon, authenticated;
revoke execute on function public.gmail_item_account(uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.user_merchant_category(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.record_gmail_extraction(uuid, text, jsonb, boolean, text)
  from public, anon, authenticated;
revoke execute on function public.imported_transaction_for_category(uuid)
  from public, anon, authenticated;
revoke execute on function public.set_imported_category(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.claim_merchant_profile(text) from public, anon, authenticated;
revoke execute on function public.save_merchant_profile(text, text)
  from public, anon, authenticated;
revoke execute on function public.release_merchant_profile(text)
  from public, anon, authenticated;

grant execute on function public.normalize_merchant_name(text) to service_role;
grant execute on function public.start_gmail_discovery(uuid) to service_role;
grant execute on function public.record_gmail_discovery(uuid, jsonb) to service_role;
grant execute on function public.fail_gmail_discovery(uuid) to service_role;
grant execute on function public.gmail_item_account(uuid, text, text, text) to service_role;
grant execute on function public.user_merchant_category(uuid, text) to service_role;
grant execute on function public.record_gmail_extraction(uuid, text, jsonb, boolean, text)
  to service_role;
grant execute on function public.imported_transaction_for_category(uuid) to service_role;
grant execute on function public.set_imported_category(uuid, text) to service_role;
grant execute on function public.claim_merchant_profile(text) to service_role;
grant execute on function public.save_merchant_profile(text, text) to service_role;
grant execute on function public.release_merchant_profile(text) to service_role;
