-- Gmail auto-confirm waits for a Category. A transaction that meets every
-- auto-confirm rule is confirmed on import only when the User's own history supplies
-- its Category; otherwise it is saved pending with gmail_auto_confirm_pending set,
-- and categorization confirms it in the same statement that sets the Category. When
-- categorization finds no confident Category, the transaction stays pending review.

alter table public.transactions
  add column gmail_auto_confirm_pending boolean not null default false;

comment on column public.transactions.gmail_auto_confirm_pending is
  'Met every Gmail auto-confirm rule on import but had no Category; set_imported_category confirms it.';

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
      ai_confidence,
      gmail_auto_confirm_pending
    )
    select
      v_message.user_id,
      v_message.id,
      (mapped.ordinality - 1)::integer,
      'gmail_email',
      -- Confirmed only with a Category; without one it waits for categorization.
      case when qualified.eligible and qualified.category_id is not null
        then 'confirmed' else 'pending' end,
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
      qualified.category_id,
      round(mapped.confidence, 3),
      qualified.eligible and qualified.category_id is null
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
    cross join lateral (
      select
        coalesce(
          p_sender_verified
            and mapped.confidence >= public.gmail_auto_confirm_confidence()
            and mapped.kind in ('expense', 'income')
            and mapped.amount is not null
            and mapped.currency = 'IDR'
            and mapped.occurred_on is not null
            and mapped.financial_account_id is not null
            and (mapped.merchant_name is not null or mapped.description is not null),
          false
        ) as eligible,
        case when mapped.kind in ('expense', 'income') then
          public.user_merchant_category(v_message.user_id, mapped.merchant_name)
        end as category_id
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

create or replace function public.set_imported_category(
  p_transaction_id uuid,
  p_category_name text
)
returns table (applied boolean, user_id uuid, review_status text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.transactions%rowtype;
  v_category_id uuid;
  v_review_status text;
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
    or v_item.transaction_type not in ('expense', 'income')
    or v_item.category_id is not null
    or v_item.deleted_at is not null
    or v_item.updated_at <> v_item.created_at then
    return query select false, v_item.user_id, v_item.review_status;
    return;
  end if;

  -- A transaction that met every auto-confirm rule but lacked a Category is confirmed
  -- together with the Category it was waiting for.
  v_review_status := case
    when v_item.gmail_auto_confirm_pending and v_item.review_status = 'pending' then 'confirmed'
    else v_item.review_status
  end;
  update public.transactions
    set category_id = v_category_id,
      review_status = v_review_status,
      gmail_auto_confirm_pending = false
    where id = v_item.id;
  return query select true, v_item.user_id, v_review_status;
end;
$$;
