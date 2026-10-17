-- One Gmail mailbox per Financial Account. A bank sends an account's alerts to the
-- one address registered with it, so each email-fed account names the mailbox it is
-- imported from, and a mailbox imports only its own accounts' senders. Null means a
-- manual-only account. The composite key keeps the mailbox owned by the account's User.

alter table public.financial_accounts
  add column gmail_connection_id uuid,
  add constraint financial_accounts_gmail_connection_fkey
    foreign key (gmail_connection_id, user_id)
    references public.gmail_connections (id, user_id)
    on delete set null (gmail_connection_id);

create index financial_accounts_gmail_connection_idx
  on public.financial_accounts (gmail_connection_id, user_id)
  where gmail_connection_id is not null;

comment on column public.financial_accounts.gmail_connection_id is
  'The Gmail connection this account''s bank emails are imported from; null for a manual-only account.';

-- An account may only be linked to an active mailbox. Unlinking is always allowed.
create function private.require_active_linked_gmail()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.gmail_connection_id is not null
    and (tg_op = 'INSERT' or new.gmail_connection_id is distinct from old.gmail_connection_id)
    and not exists (
      select 1
        from public.gmail_connections as connection
        where connection.id = new.gmail_connection_id
          and connection.user_id = new.user_id
          and connection.status = 'active'
    ) then
    raise exception using
      errcode = '23514',
      message = 'A Financial Account can only be linked to an active Gmail connection.';
  end if;
  return new;
end;
$$;

revoke all on function private.require_active_linked_gmail() from public, anon, authenticated;

create trigger financial_accounts_require_active_linked_gmail
before insert or update of gmail_connection_id on public.financial_accounts
for each row execute function private.require_active_linked_gmail();

-- Disconnecting a mailbox unlinks its accounts in the same statement. The accounts and
-- their imported transactions stay; each becomes manual-only until the User picks
-- another mailbox. A connection in error keeps its links, since reconnecting fixes it.
create function private.unlink_disconnected_gmail_accounts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'disconnected' and old.status <> 'disconnected' then
    update public.financial_accounts
      set gmail_connection_id = null
      where gmail_connection_id = new.id
        and user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function private.unlink_disconnected_gmail_accounts()
from public, anon, authenticated;

create trigger gmail_connections_unlink_accounts
after update of status on public.gmail_connections
for each row execute function private.unlink_disconnected_gmail_accounts();

-- Existing accounts: with exactly one active mailbox, its institution accounts are
-- fed by it. With several, they stay unlinked until the User picks one.
update public.financial_accounts as account
  set gmail_connection_id = single.connection_id
  from (
    select connection.user_id, (array_agg(connection.id))[1] as connection_id
      from public.gmail_connections as connection
      where connection.status = 'active'
      group by connection.user_id
      having count(*) = 1
  ) as single
  where account.user_id = single.user_id
    and account.institution_key is not null
    and account.gmail_connection_id is null;

-- An imported item maps only to an account fed by the mailbox the email came from.
-- Several such accounts at one institution are told apart by the card or account ending.
drop function public.gmail_item_account(uuid, text, text, text);

create function public.gmail_item_account(
  p_user_id uuid,
  p_connection_id uuid,
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
    and account.gmail_connection_id = p_connection_id
    and account.is_active
    and account.institution_key = p_institution_key
$$;

revoke execute on function public.gmail_item_account(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.gmail_item_account(uuid, uuid, text, text, text) to service_role;

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
