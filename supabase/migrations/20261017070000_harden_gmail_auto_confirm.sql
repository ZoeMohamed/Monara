-- Auto-confirm only highly certain Gmail transactions. The score is necessary,
-- but never sufficient: the current ingestion function also requires an
-- authenticated sender, a complete IDR transaction, and one unambiguous active
-- Financial Account owned by the User.
create or replace function public.gmail_auto_confirm_confidence()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 0.95::numeric $$;

-- The original overload predates sender authentication and therefore cannot
-- prove that the message came from a registered institution. All production
-- ingestion uses the five-argument overload below, which receives that result
-- from the Gmail adapter.
drop function public.record_gmail_extraction(uuid, text, jsonb);

-- Decide from the raw score. Keep the three-decimal stored representation for
-- display and compatibility, but never let 0.9495 round up into confirmation.
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
      case when mapped.kind in ('expense', 'income') then
        public.user_merchant_category(v_message.user_id, mapped.merchant_name)
      end,
      round(mapped.confidence, 3)
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
        (entry.item ->> 'confidence')::numeric as confidence
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
            and item.transaction_type in ('expense', 'income')
            and item.merchant_name is not null
        ),
        array[]::uuid[]
      )
      from public.transactions as item
      where item.processed_gmail_message_id = v_message.id;
end;
$$;

comment on function public.gmail_auto_confirm_confidence() is
  'Minimum normalized extraction confidence for Gmail auto-confirm; all deterministic ingestion guards must also pass.';
