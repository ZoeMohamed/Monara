-- Gmail ingestion improvements:
-- 1. A durable sync status per connection, so Sync Now can show queued, running,
--    completed, and failed instead of a browser-only "queued" that never ends.
-- 2. Listing claims every listed message up front, so progress and completion are
--    derived from processed_gmail_messages rather than from counters that can drift.
-- 3. Extracted items may name one of the owner's Financial Accounts, mapped the same
--    way as Categories: only an unambiguous match among the owner's own accounts.
-- 4. Items the extractor is highly confident about, and that are complete enough to
--    count toward totals, are confirmed directly instead of waiting for review.

alter table public.gmail_connections
  add column sync_state text not null default 'idle'
    check (sync_state in ('idle', 'queued', 'listing', 'listed', 'failed')),
  add column sync_error text
    check (sync_error in ('agent_unavailable', 'gmail_unavailable', 'sync_failed')),
  add column sync_requested_at timestamptz,
  add column sync_updated_at timestamptz,
  add check ((sync_state = 'failed') = (sync_error is not null));

-- Progress queries look up a connection's messages claimed since a sync started.
create index processed_gmail_messages_connection_created_idx
  on public.processed_gmail_messages (gmail_connection_id, created_at);

-- Sync Now: marks a sync as queued before the agent is asked to run it.
-- Raises 55000 when a sync that has not stalled is already queued or running.
create function public.request_gmail_sync(p_user_id uuid, p_connection_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_connection public.gmail_connections%rowtype;
  v_status text;
begin
  select connection.*
    into v_connection
    from public.gmail_connections as connection
    where connection.id = p_connection_id
      and connection.user_id = p_user_id
      and connection.status = 'active'
    for update of connection;
  if v_connection.id is null then
    raise exception using errcode = 'P0002', message = 'Gmail connection is not active.';
  end if;

  select status.state
    into v_status
    from public.gmail_sync_statuses(p_user_id) as status
    where status.connection_id = p_connection_id;
  if v_status in ('queued', 'running') then
    raise exception using errcode = '55000', message = 'A Gmail sync is already running.';
  end if;

  update public.gmail_connections
    set sync_state = 'queued',
      sync_error = null,
      sync_requested_at = statement_timestamp(),
      sync_updated_at = statement_timestamp()
    where id = p_connection_id;
  return statement_timestamp();
end;
$$;

-- Records a sync that could not run or finish. A newer request is never overwritten:
-- p_requested_at, when given, must still be the current request.
create function public.fail_gmail_sync(
  p_connection_id uuid,
  p_error text,
  p_requested_at timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.gmail_connections
    set sync_state = 'failed',
      sync_error = p_error,
      sync_updated_at = statement_timestamp()
    where id = p_connection_id
      and (p_requested_at is null or sync_requested_at = p_requested_at);
end;
$$;

-- The agent started listing. A scheduled sync has no request, so it starts one here.
create function public.start_gmail_sync(p_connection_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.gmail_connections
    set sync_state = 'listing',
      sync_error = null,
      sync_requested_at = case
        when sync_state = 'queued' then coalesce(sync_requested_at, statement_timestamp())
        else statement_timestamp()
      end,
      sync_updated_at = statement_timestamp()
    where id = p_connection_id
      and status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'Gmail connection is not active.';
  end if;
end;
$$;

-- Claims one listed page of messages in one statement. Already claimed messages are
-- left as they are. Returns how many messages still need extraction.
create function public.claim_gmail_messages(p_connection_id uuid, p_messages jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_pending integer;
begin
  if jsonb_typeof(p_messages) <> 'array' then
    raise exception using errcode = '22023', message = 'Messages must be an array.';
  end if;

  select connection.user_id
    into v_user_id
    from public.gmail_connections as connection
    where connection.id = p_connection_id
      and connection.status = 'active'
    for share of connection;
  if v_user_id is null then
    raise exception using errcode = 'P0002', message = 'Gmail connection is not active.';
  end if;

  insert into public.processed_gmail_messages (
    user_id,
    gmail_connection_id,
    gmail_message_id,
    received_at
  )
  select v_user_id, p_connection_id, entry ->> 'gmailMessageId', (entry ->> 'receivedAt')::timestamptz
    from jsonb_array_elements(p_messages) as entry
    on conflict (gmail_connection_id, gmail_message_id) do nothing;

  update public.gmail_connections
    set sync_updated_at = statement_timestamp()
    where id = p_connection_id
      and sync_state = 'listing';

  select count(*)
    into v_pending
    from public.processed_gmail_messages as message
    join jsonb_array_elements(p_messages) as entry
      on entry ->> 'gmailMessageId' = message.gmail_message_id
    where message.gmail_connection_id = p_connection_id
      and message.processing_status in ('processing', 'failed');
  return v_pending;
end;
$$;

-- The last page was listed: the sync cursor moves forward and the sync is now waiting
-- only for its messages to be extracted.
create or replace function public.mark_gmail_connection_synced(
  p_connection_id uuid,
  p_synced_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Never move backwards: an older sync finishing late keeps the newer time.
  update public.gmail_connections
    set last_synced_at = greatest(coalesce(last_synced_at, p_synced_at), p_synced_at),
      sync_state = case when sync_state = 'listing' then 'listed' else sync_state end,
      sync_updated_at = case
        when sync_state = 'listing' then statement_timestamp()
        else sync_updated_at
      end
    where id = p_connection_id
      and status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'Gmail connection is not active.';
  end if;
end;
$$;

-- A sync with no progress for this long is reported as failed so it can be retried.
-- Extraction of one message takes seconds; a page listing takes under a minute.
create function public.gmail_sync_stall_interval()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '10 minutes' $$;

-- Sync status for each of one User's connections, derived from stored state and the
-- messages claimed since the sync was requested. Counts cover that sync only.
create function public.gmail_sync_statuses(p_user_id uuid)
returns table (
  connection_id uuid,
  state text,
  error text,
  requested_at timestamptz,
  imported bigint,
  skipped bigint,
  failed bigint,
  in_progress bigint,
  imported_transactions bigint,
  confirmed_transactions bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with run as (
    select
      connection.id,
      connection.sync_state,
      connection.sync_error,
      connection.sync_requested_at,
      greatest(
        connection.sync_updated_at,
        (
          select max(coalesce(message.processed_at, message.created_at))
            from public.processed_gmail_messages as message
            where message.gmail_connection_id = connection.id
              and message.created_at >= connection.sync_requested_at
        )
      ) as last_progress_at,
      count(message.id) filter (where message.processing_status = 'processed') as imported,
      count(message.id) filter (where message.processing_status = 'skipped') as skipped,
      count(message.id) filter (where message.processing_status = 'failed') as failed,
      count(message.id) filter (where message.processing_status = 'processing') as in_progress
    from public.gmail_connections as connection
    left join public.processed_gmail_messages as message
      on message.gmail_connection_id = connection.id
      and message.created_at >= connection.sync_requested_at
    where connection.user_id = p_user_id
    group by connection.id
  )
  select
    run.id,
    case
      when run.sync_state = 'idle' then 'idle'
      when run.sync_state = 'failed' then 'failed'
      when run.sync_state = 'listed' and run.in_progress = 0 then 'completed'
      when run.last_progress_at < statement_timestamp() - public.gmail_sync_stall_interval()
        then 'failed'
      when run.sync_state = 'queued' then 'queued'
      else 'running'
    end,
    case
      when run.sync_state = 'failed' then run.sync_error
      when run.sync_state in ('queued', 'listing', 'listed')
        and not (run.sync_state = 'listed' and run.in_progress = 0)
        and run.last_progress_at < statement_timestamp() - public.gmail_sync_stall_interval()
        then 'stalled'
    end,
    run.sync_requested_at,
    run.imported,
    run.skipped,
    run.failed,
    run.in_progress,
    (
      select count(*)
        from public.transactions as item
        join public.processed_gmail_messages as source
          on source.id = item.processed_gmail_message_id
        where source.gmail_connection_id = run.id
          and source.created_at >= run.sync_requested_at
          and item.user_id = p_user_id
    ),
    (
      select count(*)
        from public.transactions as item
        join public.processed_gmail_messages as source
          on source.id = item.processed_gmail_message_id
        where source.gmail_connection_id = run.id
          and source.created_at >= run.sync_requested_at
          and item.user_id = p_user_id
          and item.review_status = 'confirmed'
    )
  from run;
$$;

-- The lowest model confidence at which a complete item is confirmed without review.
create function public.gmail_auto_confirm_confidence()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 0.9::numeric $$;

-- Gmail imports still start pending, except items that meet the auto-confirm rule
-- below. The table's checks already require an amount, IDR, and a date when confirmed.
create or replace function private.enforce_initial_transaction_review()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.source_type = 'gmail_email'
    and new.review_status <> 'pending'
    and not (
      new.review_status = 'confirmed'
      and new.ai_confidence >= public.gmail_auto_confirm_confidence()
      and new.transaction_type in ('expense', 'income')
      and new.financial_account_id is not null
      and (new.merchant_name is not null or new.description is not null)
    ) then
    raise exception using
      errcode = '23514',
      message = 'Gmail imports must start pending review.';
  end if;

  return new;
end;
$$;

create or replace function public.record_gmail_extraction(
  p_processed_message_id uuid,
  p_outcome text,
  p_items jsonb
)
returns table (transaction_ids uuid[], already_finished boolean)
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

  if v_message.processing_status in ('processed', 'skipped') then
    return query
      select coalesce(
          array_agg(item.id order by item.source_item_index),
          array[]::uuid[]
        ),
        true
        from public.transactions as item
        where item.processed_gmail_message_id = v_message.id;
    return;
  end if;

  if p_outcome = 'transactions' then
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
      -- Confirmed only when confident and complete enough to count toward totals.
      -- Anything the extractor guarded (an amount, date, or location it could not
      -- verify in the email) has its confidence capped below this threshold.
      case
        when mapped.confidence >= public.gmail_auto_confirm_confidence()
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
      mapped.category_id,
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
        -- Transfers need a from and a to account, which email extraction never sets.
        case when entry.item ->> 'kind' is distinct from 'transfer' then (
          select case when count(*) = 1 then (array_agg(account.id))[1] end
            from public.financial_accounts as account
            where account.user_id = v_message.user_id
              and account.is_active
              and lower(btrim(account.name))
                = lower(btrim(entry.item ->> 'financialAccountName'))
        ) end as financial_account_id,
        -- Only an unambiguous match among the owner's own Categories is kept.
        (
          select case when count(*) = 1 then (array_agg(category.id))[1] end
            from public.categories as category
            where category.user_id = v_message.user_id
              and not category.is_archived
              and lower(btrim(category.name)) = lower(btrim(entry.item ->> 'categoryName'))
        ) as category_id,
        round((entry.item ->> 'confidence')::numeric, 3) as confidence
      from jsonb_array_elements(p_items) with ordinality as entry (item, ordinality)
    ) as mapped
    on conflict (processed_gmail_message_id, source_item_index)
      where processed_gmail_message_id is not null
      do nothing;
  end if;

  update public.processed_gmail_messages
    set processing_status = case p_outcome
        when 'transactions' then 'processed'
        else p_outcome
      end,
      processed_at = statement_timestamp()
    where id = v_message.id;

  return query
    select coalesce(array_agg(item.id order by item.source_item_index), array[]::uuid[]), false
      from public.transactions as item
      where item.processed_gmail_message_id = v_message.id;
end;
$$;

revoke execute on function public.request_gmail_sync(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.fail_gmail_sync(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.start_gmail_sync(uuid) from public, anon, authenticated;
revoke execute on function public.claim_gmail_messages(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.gmail_sync_statuses(uuid) from public, anon, authenticated;
revoke execute on function public.gmail_sync_stall_interval() from public, anon, authenticated;
revoke execute on function public.gmail_auto_confirm_confidence()
  from public, anon, authenticated;

grant execute on function public.request_gmail_sync(uuid, uuid) to service_role;
grant execute on function public.fail_gmail_sync(uuid, text, timestamptz) to service_role;
grant execute on function public.start_gmail_sync(uuid) to service_role;
grant execute on function public.claim_gmail_messages(uuid, jsonb) to service_role;
grant execute on function public.gmail_sync_statuses(uuid) to service_role;
grant execute on function public.gmail_sync_stall_interval() to service_role;
grant execute on function public.gmail_auto_confirm_confidence() to service_role;
