-- Complete the ledger foundation: current default Categories, explicit cash
-- direction, and a deterministic Jakarta date for every stored transaction.

create function private.seed_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories (user_id, name, slug, icon, color, is_default)
  values
    (p_user_id, 'Housing', 'housing', 'home', '#A16207', true),
    (p_user_id, 'Bills', 'bills', 'bills', '#8B5CF6', true),
    (p_user_id, 'Services', 'services', 'services', '#7C3AED', true),
    (p_user_id, 'Resto & Cafe', 'resto-cafe', 'food', '#F97316', true),
    (p_user_id, 'Groceries', 'groceries', 'groceries', '#22C55E', true),
    (p_user_id, 'Ride-hail', 'ride-hail', 'transport', '#0EA5E9', true),
    (p_user_id, 'Own Vehicle', 'own-vehicle', 'transport', '#0284C7', true),
    (p_user_id, 'Ecommerce', 'ecommerce', 'shopping', '#EC4899', true),
    (p_user_id, 'Retail', 'retail', 'store', '#DB2777', true),
    (p_user_id, 'Digital', 'digital', 'digital', '#6366F1', true),
    (p_user_id, 'Travel', 'travel', 'travel', '#06B6D4', true),
    (p_user_id, 'Activities', 'activities', 'film', '#4F46E5', true),
    (p_user_id, 'Bar & Drinks', 'bar-drinks', 'drinks', '#F59E0B', true),
    (p_user_id, 'Insurance', 'insurance', 'shield', '#2563EB', true),
    (p_user_id, 'Clinic & Meds', 'clinic-meds', 'heart', '#EF4444', true),
    (p_user_id, 'Fit & Wellness', 'fit-wellness', 'pulse', '#14B8A6', true),
    (p_user_id, 'Family', 'family', 'family', '#D946EF', true),
    (p_user_id, 'Giving', 'giving', 'giving', '#F43F5E', true),
    (p_user_id, 'Misc', 'misc', 'dot', '#64748B', true),
    (p_user_id, 'Repayment', 'repayment', 'repayment', '#78716C', true),
    (p_user_id, 'Internal', 'internal', 'internal', '#64748B', true),
    (p_user_id, 'Reimbursed', 'reimbursed', 'reimbursed', '#10B981', true),
    (p_user_id, 'Investment', 'investment', 'investment', '#0D9488', true),
    (p_user_id, 'One-off', 'one-off', 'one-off', '#F59E0B', true),
    (p_user_id, 'Cancelled', 'cancelled', 'cancelled', '#94A3B8', true)
  on conflict (user_id, slug) do update
    set name = excluded.name,
        icon = excluded.icon,
        color = excluded.color,
        is_archived = false,
        updated_at = statement_timestamp()
    where public.categories.is_default;

  -- Keep referenced historical Categories, but remove superseded defaults from
  -- pickers and categorization instead of destructively deleting ledger links.
  update public.categories
    set is_archived = true,
        updated_at = statement_timestamp()
    where user_id = p_user_id
      and is_default
      and slug not in (
        'housing', 'bills', 'services', 'resto-cafe', 'groceries', 'ride-hail',
        'own-vehicle', 'ecommerce', 'retail', 'digital', 'travel', 'activities',
        'bar-drinks', 'insurance', 'clinic-meds', 'fit-wellness', 'family',
        'giving', 'misc', 'repayment', 'internal', 'reimbursed', 'investment',
        'one-off', 'cancelled'
      );
end;
$$;

revoke execute on function private.seed_default_categories(uuid)
  from public, anon, authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  profile_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Monara User'
  );

  insert into public.profiles (id, display_name)
  values (new.id, left(profile_name, 100));

  insert into public.reminder_preferences (user_id)
  values (new.id);

  perform private.seed_default_categories(new.id);
  return new;
end;
$$;

do $$
declare
  existing_user record;
begin
  for existing_user in select id from auth.users loop
    perform private.seed_default_categories(existing_user.id);
  end loop;
end;
$$;

alter table public.transactions
  add column flow_direction text;

update public.transactions
set flow_direction = case transaction_type
  when 'expense' then 'out'
  when 'income' then 'in'
  else null
end;

update public.transactions as transaction
set occurred_on = coalesce(
  (source.received_at at time zone 'Asia/Jakarta')::date,
  (transaction.created_at at time zone 'Asia/Jakarta')::date
)
from public.processed_gmail_messages as source
where transaction.processed_gmail_message_id = source.id
  and transaction.occurred_on is null;

update public.transactions
set occurred_on = (created_at at time zone 'Asia/Jakarta')::date
where occurred_on is null;

alter table public.transactions
  alter column occurred_on set default ((statement_timestamp() at time zone 'Asia/Jakarta')::date),
  alter column occurred_on set not null,
  add constraint transactions_flow_direction_check check (
    (transaction_type is null and flow_direction is null)
    or (transaction_type = 'expense' and flow_direction = 'out')
    or (transaction_type = 'income' and flow_direction = 'in')
    or (transaction_type = 'exclusion' and (flow_direction is null or flow_direction in ('in', 'out')))
  );

create function private.normalize_transaction_foundation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_received_on date;
begin
  if new.occurred_on is null then
    if new.processed_gmail_message_id is not null then
      select (message.received_at at time zone 'Asia/Jakarta')::date
        into source_received_on
        from public.processed_gmail_messages as message
        where message.id = new.processed_gmail_message_id;
    end if;
    new.occurred_on := coalesce(
      source_received_on,
      case when tg_op = 'UPDATE' then old.occurred_on end,
      (statement_timestamp() at time zone 'Asia/Jakarta')::date
    );
  end if;

  new.flow_direction := case new.transaction_type
    when 'expense' then 'out'
    when 'income' then 'in'
    when 'exclusion' then new.flow_direction
    else null
  end;
  return new;
end;
$$;

revoke execute on function private.normalize_transaction_foundation()
  from public, anon, authenticated;

create trigger transactions_normalize_foundation
before insert or update of transaction_type, flow_direction, occurred_on, processed_gmail_message_id
on public.transactions
for each row execute function private.normalize_transaction_foundation();

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
      gmail_auto_confirm_pending
    )
    select
      v_message.user_id,
      v_message.id,
      (mapped.ordinality - 1)::integer,
      'gmail_email',
      case when qualified.eligible and qualified.category_id is not null
        then 'confirmed' else 'pending' end,
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
      qualified.category_id,
      round(mapped.confidence, 3),
      qualified.eligible and qualified.category_id is null
    from (
      select
        entry.ordinality,
        entry.item ->> 'kind' as kind,
        case entry.item ->> 'kind'
          when 'expense' then 'out'
          when 'income' then 'in'
          when 'exclusion' then entry.item ->> 'flowDirection'
          else null
        end as flow_direction,
        entry.item ->> 'merchantName' as merchant_name,
        (entry.item -> 'money' ->> 'amountMinor')::numeric as amount,
        entry.item -> 'money' ->> 'currency' as currency,
        coalesce(
          (entry.item ->> 'occurredOn')::date,
          (v_message.received_at at time zone 'Asia/Jakarta')::date
        ) as occurred_on,
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
