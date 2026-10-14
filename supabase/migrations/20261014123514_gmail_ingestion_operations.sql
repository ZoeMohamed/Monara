-- Gmail ingestion operations called by the Next.js backend for the agent worker
-- (packages/contracts/src/gmail-extraction.ts). Each runs in one transaction so a
-- retried or concurrent job can never create a second set of transactions.
-- Callable only by service_role; the backend authenticates the agent first.
-- A connection that is not active raises P0002, which the backend maps to 404.

create function public.claim_gmail_message(
  p_connection_id uuid,
  p_gmail_message_id text,
  p_received_at timestamptz
)
returns table (processed_message_id uuid, already_finished boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select connection.user_id
    into v_user_id
    from public.gmail_connections as connection
    where connection.id = p_connection_id
      and connection.status = 'active';
  if v_user_id is null then
    raise exception using errcode = 'P0002', message = 'Gmail connection is not active.';
  end if;

  insert into public.processed_gmail_messages (
    user_id,
    gmail_connection_id,
    gmail_message_id,
    received_at
  )
  values (v_user_id, p_connection_id, p_gmail_message_id, p_received_at)
  on conflict (gmail_connection_id, gmail_message_id) do nothing;

  -- Processing and failed messages may be picked up again by a retried job.
  return query
    select message.id, message.processing_status in ('processed', 'skipped')
      from public.processed_gmail_messages as message
      where message.gmail_connection_id = p_connection_id
        and message.gmail_message_id = p_gmail_message_id;
end;
$$;

create function public.record_gmail_extraction(
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
      category_id,
      ai_confidence
    )
    select
      v_message.user_id,
      v_message.id,
      (entry.ordinality - 1)::integer,
      'gmail_email',
      'pending',
      entry.item ->> 'kind',
      entry.item ->> 'merchantName',
      (entry.item -> 'money' ->> 'amountMinor')::numeric,
      entry.item -> 'money' ->> 'currency',
      (entry.item ->> 'occurredOn')::date,
      (entry.item ->> 'occurredTime')::time,
      entry.item ->> 'description',
      entry.item ->> 'location',
      entry.item ->> 'accountHint',
      -- Only an unambiguous match among the owner's own Categories is kept.
      (
        select case when count(*) = 1 then (array_agg(category.id))[1] end
          from public.categories as category
          where category.user_id = v_message.user_id
            and not category.is_archived
            and lower(btrim(category.name)) = lower(btrim(entry.item ->> 'categoryName'))
      ),
      round((entry.item ->> 'confidence')::numeric, 3)
    from jsonb_array_elements(p_items) with ordinality as entry (item, ordinality)
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

create function public.mark_gmail_connection_synced(
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
    set last_synced_at = greatest(coalesce(last_synced_at, p_synced_at), p_synced_at)
    where id = p_connection_id
      and status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'Gmail connection is not active.';
  end if;
end;
$$;

-- Sync Now progress for one of the User's own connections. Returns no row when
-- the connection is not theirs, so the backend answers 404 without revealing it.
create function public.gmail_connection_sync_counts(
  p_user_id uuid,
  p_connection_id uuid
)
returns table (
  imported bigint,
  skipped bigint,
  failed bigint,
  in_progress bigint,
  imported_transactions bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where message.processing_status = 'processed'),
    count(*) filter (where message.processing_status = 'skipped'),
    count(*) filter (where message.processing_status = 'failed'),
    count(*) filter (where message.processing_status = 'processing'),
    (
      select count(*)
        from public.transactions as item
        join public.processed_gmail_messages as source
          on source.id = item.processed_gmail_message_id
        where source.gmail_connection_id = p_connection_id
          and item.user_id = p_user_id
    )
  from public.gmail_connections as connection
  left join public.processed_gmail_messages as message
    on message.gmail_connection_id = connection.id
  where connection.id = p_connection_id
    and connection.user_id = p_user_id
  group by connection.id;
$$;

revoke execute on function public.claim_gmail_message(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.gmail_connection_sync_counts(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.gmail_connection_sync_counts(uuid, uuid) to service_role;
revoke execute on function public.record_gmail_extraction(uuid, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.mark_gmail_connection_synced(uuid, timestamptz)
  from public, anon, authenticated;

grant execute on function public.claim_gmail_message(uuid, text, timestamptz) to service_role;
grant execute on function public.record_gmail_extraction(uuid, text, jsonb) to service_role;
grant execute on function public.mark_gmail_connection_synced(uuid, timestamptz)
  to service_role;
