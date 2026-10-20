-- A Gmail transaction whose email states no usable date takes the day the email arrived,
-- counted in Jakarta. A receipt arrives on or after the day it describes, and a dated
-- ledger is worth more than an empty date. The agent sets it too; this keeps the rule
-- true for any other writer and repairs rows imported before it.
create or replace function private.normalize_transaction_foundation()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  source_received_on date;
begin
  if new.occurred_on is null then
    if new.source_type='gmail_email' and new.processed_gmail_message_id is not null then
      select (message.received_at at time zone 'Asia/Jakarta')::date
        into source_received_on
        from public.processed_gmail_messages as message
        where message.id=new.processed_gmail_message_id;
    end if;
    new.occurred_on:=coalesce(source_received_on,
      case when tg_op='UPDATE' then old.occurred_on end,
      (statement_timestamp() at time zone 'Asia/Jakarta')::date);
  end if;
  if new.source_type='gmail_email' and new.review_status='pending' and new.flow_direction is null then
    new.flow_direction:=null;
  else
    new.flow_direction:=case new.transaction_type when 'expense' then 'out'
      when 'income' then 'in' when 'exclusion' then new.flow_direction
      else case when new.flow_direction in ('in','out') then new.flow_direction end end;
  end if;
  return new;
end; $$;

-- The trigger fills the date on update, so touching each undated row is enough.
update public.transactions
set occurred_on=occurred_on
where source_type='gmail_email' and occurred_on is null;

-- Import eligibility counts the date a row will be stored with, so a confident row whose
-- email names no date is queued for categorization and confirmed like any other. This
-- restates the previous definition with that one predicate changed.
create or replace function public.record_gmail_extraction(
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

  if exists (
    select 1 from jsonb_array_elements(p_items) as entry(item)
    where entry.item -> 'normalizedDisplayName' <> 'null'::jsonb
      and (jsonb_typeof(entry.item -> 'normalizedDisplayName') <> 'string'
        or char_length(entry.item ->> 'normalizedDisplayName') > 80)
  ) then
    raise exception using errcode = '22023', message = 'Normalized display name is invalid.';
  end if;

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
      flow_direction,
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
      ai_confidence,
      gmail_auto_confirm_pending,
      gmail_classification_status,
      gmail_extraction_evidence
    )
    select
      v_message.user_id,
      v_message.id,
      (mapped.ordinality - 1)::integer,
      'gmail_email',
      'pending',
      mapped.kind,
      mapped.flow_direction,
      mapped.merchant_name,
      mapped.amount,
      mapped.currency,
      mapped.occurred_on,
      mapped.occurred_time,
      mapped.description,
      mapped.location,
      mapped.account_hint,
      mapped.financial_account_id,
      null,
      round(mapped.confidence, 3),
      qualified.eligible,
      'pending',
      mapped.evidence
    from (
      select
        entry.ordinality,
        entry.item as evidence,
        entry.item ->> 'kind' as kind,
        case entry.item ->> 'kind'
          when 'expense' then 'out'
          when 'income' then 'in'
          when 'exclusion' then entry.item ->> 'flowDirection'
          else case when entry.item ->> 'flowDirection' in ('in','out')
            then entry.item ->> 'flowDirection' end
        end as flow_direction,
        coalesce(nullif(btrim(entry.item ->> 'normalizedDisplayName'),''),
          entry.item ->> 'merchantName') as merchant_name,
        (entry.item -> 'money' ->> 'amountMinor')::numeric as amount,
        entry.item -> 'money' ->> 'currency' as currency,
        (entry.item ->> 'occurredOn')::date as occurred_on,
        (entry.item ->> 'occurredTime')::time as occurred_time,
        entry.item ->> 'description' as description,
        entry.item ->> 'location' as location,
        entry.item ->> 'accountHint' as account_hint,
        public.gmail_item_account(
          v_message.user_id,
          v_message.gmail_connection_id,
          p_institution_key,
          entry.item ->> 'kind',
          entry.item ->> 'accountLastFour'
        ) as financial_account_id,
        (entry.item ->> 'confidence')::numeric as confidence
      from jsonb_array_elements(p_items) with ordinality as entry (item, ordinality)
    ) as mapped
    cross join lateral (
      select
        coalesce(
          p_sender_verified
            and mapped.confidence >= public.gmail_auto_confirm_confidence()
            and mapped.kind in ('expense', 'income', 'exclusion')
            and mapped.amount is not null
            and mapped.currency = 'IDR'
            and coalesce(mapped.occurred_on,
              (v_message.received_at at time zone 'Asia/Jakarta')::date) is not null
            and mapped.financial_account_id is not null
            and (mapped.merchant_name is not null or mapped.description is not null),
          false
        ) as eligible
    ) as qualified
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
          where item.gmail_classification_status = 'pending'
        ),
        array[]::uuid[]
      )
      from public.transactions as item
      where item.processed_gmail_message_id = v_message.id;
end;
$$;
