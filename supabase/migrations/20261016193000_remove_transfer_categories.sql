-- Match the product's simple ledger: expense, income, and exclusion are the three
-- transaction types. Review state is only pending or confirmed. Exclusions retain
-- reimbursements, internal transfers, duplicates, and non-personal activity for
-- audit and deduplication without affecting financial totals.

drop trigger if exists transactions_require_active_financial_accounts
on public.transactions;

drop trigger if exists transactions_enforce_review_transition
on public.transactions;

do $$
declare
  constraint_name name;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) like '%transaction_type%'
        or pg_get_constraintdef(oid) like '%review_status%'
        or pg_get_constraintdef(oid) like '%from_financial_account_id%'
        or pg_get_constraintdef(oid) like '%to_financial_account_id%'
      )
  loop
    execute format(
      'alter table public.transactions drop constraint %I',
      constraint_name
    );
  end loop;
end;
$$;

update public.transactions
set
  financial_account_id = coalesce(
    financial_account_id,
    from_financial_account_id,
    to_financial_account_id
  ),
  review_status = case
    when review_status in ('confirmed', 'rejected') then 'confirmed'
    else 'pending'
  end,
  transaction_type = 'exclusion'
where review_status = 'rejected' or transaction_type = 'transfer';

alter table public.transactions
  drop column from_financial_account_id,
  drop column to_financial_account_id,
  add constraint transactions_transaction_type_check
    check (
      transaction_type is null
      or transaction_type in ('expense', 'income', 'exclusion')
    ),
  add constraint transactions_review_status_check
    check (review_status in ('pending', 'confirmed')),
  add constraint transactions_confirmed_fields_check
    check (
      review_status <> 'confirmed'
      or (
        transaction_type is not null
        and (
          transaction_type = 'exclusion'
          or (
            amount is not null
            and currency = 'IDR'
            and occurred_on is not null
          )
        )
      )
    ),
  add constraint transactions_direct_details_check
    check (
      source_type = 'gmail_email'
      or (
        financial_account_id is not null
        and (merchant_name is not null or description is not null)
      )
    );

create or replace function private.require_active_transaction_accounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.review_status <> 'confirmed' or new.financial_account_id is null then
    return new;
  end if;

  if (
    tg_op = 'INSERT'
    or old.review_status <> 'confirmed'
    or new.financial_account_id is distinct from old.financial_account_id
  ) and exists (
    select 1
    from public.financial_accounts
    where id = new.financial_account_id
      and user_id = new.user_id
      and not is_active
  ) then
    raise check_violation using
      message = 'Confirmed transactions require active Financial Accounts.';
  end if;

  return new;
end;
$$;

revoke all on function private.require_active_transaction_accounts()
from public, anon, authenticated;

create trigger transactions_require_active_financial_accounts
before insert or update of financial_account_id, review_status
on public.transactions
for each row execute function private.require_active_transaction_accounts();

create trigger transactions_enforce_review_transition
before update of review_status on public.transactions
for each row execute function private.enforce_transaction_review_transition();

-- Gmail exclusions intentionally stay outside account/category inference. They are
-- retained for audit and deduplication, but do not need bookkeeping dimensions.
create or replace function public.gmail_item_account(
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
  select case
    when p_kind is not distinct from 'exclusion' or p_institution_key is null then null
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

create or replace function public.user_merchant_category(p_user_id uuid, p_merchant_name text)
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
      and item.transaction_type in ('expense', 'income')
      and item.deleted_at is null
      and public.normalize_merchant_name(item.merchant_name)
        = public.normalize_merchant_name(p_merchant_name)
    order by item.updated_at desc
    limit 1
$$;

create or replace function public.imported_transaction_for_category(p_transaction_id uuid)
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
    item.transaction_type in ('expense', 'income')
      and item.category_id is null
      and item.updated_at = item.created_at
      and item.deleted_at is null
  from public.transactions as item
  where item.id = p_transaction_id
    and item.source_type = 'gmail_email'
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

  update public.transactions
    set category_id = v_category_id
    where id = v_item.id;
  return query select true, v_item.user_id, v_item.review_status;
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
        case when entry.item ->> 'kind' in ('expense', 'income') then (
          select case when count(*) = 1 then (array_agg(account.id))[1] end
            from public.financial_accounts as account
            where account.user_id = v_message.user_id
              and account.is_active
              and lower(btrim(account.name))
                = lower(btrim(entry.item ->> 'financialAccountName'))
        ) end as financial_account_id,
        case when entry.item ->> 'kind' in ('expense', 'income') then (
          select case when count(*) = 1 then (array_agg(category.id))[1] end
            from public.categories as category
            where category.user_id = v_message.user_id
              and not category.is_archived
              and lower(btrim(category.name)) = lower(btrim(entry.item ->> 'categoryName'))
        ) end as category_id,
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
            and item.transaction_type in ('expense', 'income')
            and item.merchant_name is not null
        ),
        array[]::uuid[]
      )
      from public.transactions as item
      where item.processed_gmail_message_id = v_message.id;
end;
$$;
