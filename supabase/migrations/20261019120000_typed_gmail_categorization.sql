-- Flush deferred ownership checks before toggling structural relink triggers.
set constraints all immediate;

-- Typed catalogs preserve every existing ledger treatment. Structural relinks do
-- not represent User edits, so their optimistic concurrency timestamps survive.
alter table public.categories add column kind text;
alter table public.categories disable trigger categories_set_updated_at;
update public.categories set kind = case
  when is_default and slug in ('repayment','internal','reimbursed','investment','one-off','cancelled')
    then 'exclusion' else 'expense' end;
alter table public.categories enable trigger categories_set_updated_at;
alter table public.categories alter column kind set not null,
  add constraint categories_kind_check check (kind in ('expense','income','exclusion'));

create temporary table category_kind_map (
  old_id uuid not null, kind text not null, new_id uuid not null,
  primary key (old_id, kind)
) on commit drop;
insert into category_kind_map select id,kind,id from public.categories;

-- Include undo snapshots, even if their category is no longer used by a live row.
with needed as (
  select category_id as id, transaction_type as kind from public.transactions
    where category_id is not null and transaction_type is not null
  union select category_id,'expense' from public.budgets
  union select (operation_state #>> '{values,categoryId}')::uuid,
    operation_state #>> '{values,kind}' from public.agent_action_states
    where operation_state ->> 'operation' = 'restore_transaction'
      and operation_state #>> '{values,categoryId}' is not null
      and operation_state #>> '{values,kind}' in ('expense','income','exclusion')
  union select ((operation_state ->> 'values')::jsonb ->> 'categoryId')::uuid,'expense'
    from public.agent_action_states where operation_state ->> 'operation' = 'restore_budget'
)
insert into category_kind_map
select needed.id,needed.kind,gen_random_uuid() from needed
join public.categories as category on category.id=needed.id
where needed.kind <> category.kind on conflict do nothing;

insert into public.categories(id,user_id,name,slug,icon,color,is_default,is_archived,created_at,updated_at,kind)
select map.new_id,category.user_id,category.name,
  'typed-' || replace(category.id::text,'-','') || '-' || map.kind,
  category.icon,category.color,false,category.is_archived,
  category.created_at,category.updated_at,map.kind
from category_kind_map as map join public.categories as category on category.id=map.old_id
where map.new_id<>map.old_id;

alter table public.transactions disable trigger transactions_set_updated_at;
update public.transactions as item set category_id=map.new_id
from category_kind_map as map where item.category_id=map.old_id
  and item.transaction_type=map.kind and map.new_id<>map.old_id;
alter table public.transactions enable trigger transactions_set_updated_at;
alter table public.budgets disable trigger budgets_set_updated_at;
update public.budgets as budget set category_id=map.new_id
from category_kind_map as map where budget.category_id=map.old_id
  and map.kind='expense' and map.new_id<>map.old_id;
alter table public.budgets enable trigger budgets_set_updated_at;
update public.agent_action_states as state
set operation_state=jsonb_set(state.operation_state,'{values,categoryId}',to_jsonb(map.new_id::text))
from category_kind_map as map
where state.operation_state ->> 'operation'='restore_transaction'
  and state.operation_state #>> '{values,categoryId}'=map.old_id::text
  and state.operation_state #>> '{values,kind}'=map.kind and map.new_id<>map.old_id;
update public.agent_action_states as state
set operation_state=jsonb_set(state.operation_state,'{values}',
  to_jsonb(jsonb_set((state.operation_state ->> 'values')::jsonb,
    '{categoryId}',to_jsonb(map.new_id::text))::text))
from category_kind_map as map
where state.operation_state ->> 'operation'='restore_budget'
  and (state.operation_state ->> 'values')::jsonb ->> 'categoryId'=map.old_id::text
  and map.kind='expense' and map.new_id<>map.old_id;
set constraints all immediate;

create function private.require_compatible_category() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_kind text; v_archived boolean; v_expected text; v_pending_hint boolean:=false;
begin
  if tg_table_name='categories' then
    if new.kind is distinct from old.kind then
      raise check_violation using message='Category type cannot be changed.';
    end if;
    return new;
  end if;
  if new.category_id is null then return new; end if;
  select category.kind,category.is_archived into v_kind,v_archived
    from public.categories as category
    where category.id=new.category_id and category.user_id=new.user_id
    for share;
  if tg_table_name='budgets' then v_expected:='expense';
  else
    v_expected:=new.transaction_type;
    v_pending_hint:=v_expected is null and new.review_status='pending';
  end if;
  -- An unknown pending type may retain a category hint without affecting totals.
  if tg_op='UPDATE' and new.category_id is not distinct from old.category_id
    and v_kind is not null
    and (tg_table_name='budgets' or v_pending_hint or v_kind is not distinct from v_expected) then
    return new;
  end if;
  if v_kind is null or v_archived or (not v_pending_hint and v_kind is distinct from v_expected) then
    raise check_violation using message='An active compatible owned Category is required.';
  end if;
  return new;
end; $$;
revoke all on function private.require_compatible_category() from public,anon,authenticated;
create trigger categories_immutable_kind before update of kind on public.categories
for each row execute function private.require_compatible_category();
create trigger transactions_compatible_category before insert or update of category_id,transaction_type
on public.transactions for each row execute function private.require_compatible_category();
create trigger budgets_compatible_category before insert or update of category_id
on public.budgets for each row execute function private.require_compatible_category();

create or replace function private.seed_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories (user_id, name, slug, icon, color, is_default, kind)
  values
    (p_user_id, 'Housing', 'housing', 'home', '#A16207', true, 'expense'),
    (p_user_id, 'Bills', 'bills', 'bills', '#8B5CF6', true, 'expense'),
    (p_user_id, 'Services', 'services', 'services', '#7C3AED', true, 'expense'),
    (p_user_id, 'Resto & Cafe', 'resto-cafe', 'food', '#F97316', true, 'expense'),
    (p_user_id, 'Groceries', 'groceries', 'groceries', '#22C55E', true, 'expense'),
    (p_user_id, 'Ride-hail', 'ride-hail', 'transport', '#0EA5E9', true, 'expense'),
    (p_user_id, 'Own Vehicle', 'own-vehicle', 'transport', '#0284C7', true, 'expense'),
    (p_user_id, 'Ecommerce', 'ecommerce', 'shopping', '#EC4899', true, 'expense'),
    (p_user_id, 'Retail', 'retail', 'store', '#DB2777', true, 'expense'),
    (p_user_id, 'Digital', 'digital', 'digital', '#6366F1', true, 'expense'),
    (p_user_id, 'Travel', 'travel', 'travel', '#06B6D4', true, 'expense'),
    (p_user_id, 'Activities', 'activities', 'film', '#4F46E5', true, 'expense'),
    (p_user_id, 'Bar & Drinks', 'bar-drinks', 'drinks', '#F59E0B', true, 'expense'),
    (p_user_id, 'Insurance', 'insurance', 'shield', '#2563EB', true, 'expense'),
    (p_user_id, 'Clinic & Meds', 'clinic-meds', 'heart', '#EF4444', true, 'expense'),
    (p_user_id, 'Fit & Wellness', 'fit-wellness', 'pulse', '#14B8A6', true, 'expense'),
    (p_user_id, 'Family', 'family', 'family', '#D946EF', true, 'expense'),
    (p_user_id, 'Giving', 'giving', 'giving', '#F43F5E', true, 'expense'),
    (p_user_id, 'Misc', 'misc', 'dot', '#64748B', true, 'expense'),
    (p_user_id, 'Repayment', 'repayment', 'repayment', '#78716C', true, 'exclusion'),
    (p_user_id, 'Internal', 'internal', 'internal', '#64748B', true, 'exclusion'),
    (p_user_id, 'Reimbursed', 'reimbursed', 'reimbursed', '#10B981', true, 'exclusion'),
    (p_user_id, 'Investment', 'investment', 'investment', '#0D9488', true, 'exclusion'),
    (p_user_id, 'One-off', 'one-off', 'one-off', '#F59E0B', true, 'exclusion'),
    (p_user_id, 'Cancelled', 'cancelled', 'cancelled', '#94A3B8', true, 'exclusion'),
    (p_user_id, 'Salary', 'salary', 'income', '#10B981', true, 'income'),
    (p_user_id, 'Freelance', 'freelance', 'income', '#10B981', true, 'income'),
    (p_user_id, 'Business', 'business', 'income', '#10B981', true, 'income'),
    (p_user_id, 'Interest', 'interest', 'income', '#10B981', true, 'income'),
    (p_user_id, 'Gifts', 'gifts', 'income', '#10B981', true, 'income'),
    (p_user_id, 'Other Income', 'other-income', 'income', '#10B981', true, 'income')
  on conflict (user_id, slug) do nothing;
end;
$$;

revoke execute on function private.seed_default_categories(uuid)
  from public, anon, authenticated;

do $$ declare v_user record; begin
  for v_user in select id from auth.users loop
    -- Share deletion acceptance's lock before checking whether writes are allowed.
    perform pg_advisory_xact_lock(hashtextextended(v_user.id::text,190026));
    if public.monara_user_is_active(v_user.id) then
      perform private.seed_default_categories(v_user.id);
    end if;
  end loop;
end; $$;

-- Null status identifies pre-upgrade imports. They are not swept or reclassified.
alter table public.transactions
  add column gmail_classification_status text check (gmail_classification_status in ('pending','completed','needs_review')),
  add column gmail_classification_confidence numeric check (gmail_classification_confidence between 0 and 1),
  add column gmail_extraction_evidence jsonb;
comment on column public.transactions.gmail_extraction_evidence is
  'Structured extractor facts for categorization; no raw message content.';
create index transactions_pending_gmail_classification_idx on public.transactions(processed_gmail_message_id)
  where gmail_classification_status='pending';

-- An absent extracted date is unknown. Legacy rows retain their existing dates.
alter table public.transactions
  alter column occurred_on drop not null,
  drop constraint transactions_flow_direction_check,
  add constraint transactions_flow_direction_check check (
    (transaction_type is null and review_status='pending'
      and (flow_direction is null or flow_direction in ('in','out')))
    or (transaction_type='expense' and flow_direction='out')
    or (transaction_type='income' and flow_direction='in')
    or (transaction_type='exclusion' and (flow_direction is null or flow_direction in ('in','out')))
  );
create or replace function private.normalize_transaction_foundation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.occurred_on is null and new.source_type<>'gmail_email' then
    new.occurred_on:=coalesce(case when tg_op='UPDATE' then old.occurred_on end,
      (statement_timestamp() at time zone 'Asia/Jakarta')::date);
  end if;
  new.flow_direction:=case new.transaction_type when 'expense' then 'out'
    when 'income' then 'in' when 'exclusion' then new.flow_direction
    else case when new.flow_direction in ('in','out') then new.flow_direction end end;
  return new;
end; $$;

create function private.normalized_holder_name(p_name text) returns text
language sql immutable set search_path='' as $$
  select nullif(string_agg(word,' ' order by position),'')
  from regexp_split_to_table(regexp_replace(lower(normalize(p_name,NFKC)),
    '[^[:alnum:][:space:]]',' ','g'),'[[:space:]]+') with ordinality as names(word,position)
  where word<>'' and word not in ('bpk','bapak','ibu','sdr','sdri','mr','mrs','ms','tn','ny','nn');
$$;
revoke all on function private.normalized_holder_name(text) from public,anon,authenticated;
grant execute on function private.normalized_holder_name(text) to service_role;
grant usage on schema private to service_role;

-- Account mapping applies to exclusions too: Internal retains its source account.
create or replace function public.gmail_item_account(
  p_user_id uuid,p_connection_id uuid,p_institution_key text,p_kind text,p_last_four text
) returns uuid language sql stable set search_path='' as $$
  select case
    when p_institution_key is null then null
    when count(*)=1 and (p_last_four is null or (array_agg(account.last_four))[1] is null
      or (array_agg(account.last_four))[1]=p_last_four) then (array_agg(account.id))[1]
    when count(*)>1 and p_last_four is not null
      and count(*) filter(where account.last_four=p_last_four)=1
      then (array_agg(account.id) filter(where account.last_four=p_last_four))[1]
  end from public.financial_accounts as account
  where account.user_id=p_user_id and account.gmail_connection_id=p_connection_id
    and account.is_active and account.institution_key=p_institution_key;
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
            and mapped.kind in ('expense', 'income', 'exclusion')
            and mapped.amount is not null
            and mapped.currency = 'IDR'
            and mapped.evidence ->> 'occurredOn' is not null
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

-- A User edit settles background work without modifying their financial choice.
create function private.settle_edited_gmail_classification() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.gmail_classification_status='pending' and new.gmail_classification_status='pending' then
    new.gmail_classification_status:='needs_review';
    new.gmail_auto_confirm_pending:=false;
  end if;
  return new;
end; $$;
revoke all on function private.settle_edited_gmail_classification() from public,anon,authenticated;
create trigger transactions_settle_edited_gmail_classification before update on public.transactions
for each row execute function private.settle_edited_gmail_classification();

drop function public.imported_transaction_for_category(uuid);
create function public.imported_transaction_for_category(p_transaction_id uuid)
returns table(user_id uuid,merchant_name text,location text,needs_category boolean,
  kind text,flow_direction text,description text,counterparty_name text,
  counterparty_type text,is_transfer boolean,internal_transfer boolean,holder_name text)
language sql stable security invoker set search_path='' as $$
  select item.user_id,item.merchant_name,item.location,
    item.category_id is null and item.updated_at=item.created_at and item.deleted_at is null
      and item.review_status='pending'
      and (item.gmail_classification_status='pending' or item.gmail_classification_status is null),
    item.transaction_type,item.flow_direction,item.description,
    item.gmail_extraction_evidence ->> 'counterpartyName',
    coalesce(item.gmail_extraction_evidence ->> 'counterpartyType','unknown'),
    coalesce((item.gmail_extraction_evidence ->> 'isTransfer')::boolean,false),
    coalesce((item.gmail_extraction_evidence ->> 'isTransfer')::boolean,false)
      and coalesce(item.gmail_extraction_evidence ->> 'counterpartyType','unknown')<>'business'
      and item.flow_direction in ('in','out')
      and private.normalized_holder_name(profile.full_name) is not null
      and private.normalized_holder_name(profile.full_name) =
        private.normalized_holder_name(item.gmail_extraction_evidence ->> 'counterpartyName'),
    profile.full_name
  from public.transactions as item
  join public.processed_gmail_messages as message on message.id=item.processed_gmail_message_id
  join public.gmail_connections as connection on connection.id=message.gmail_connection_id
    and connection.user_id=item.user_id and connection.status='active'
  left join public.profiles as profile on profile.id=item.user_id
  where item.id=p_transaction_id and item.source_type='gmail_email';
$$;
revoke execute on function public.imported_transaction_for_category(uuid) from public,anon,authenticated;
grant execute on function public.imported_transaction_for_category(uuid) to service_role;

create or replace function public.set_imported_category(
  p_transaction_id uuid,p_category_id uuid default null,p_kind text default null,p_confidence numeric default null
) returns table(applied boolean,user_id uuid,review_status text)
language plpgsql security invoker set search_path='' as $$
declare
  v_item public.transactions%rowtype;
  v_category public.categories%rowtype;
  v_holder text;
  v_internal boolean:=false;
  v_qualified boolean:=false;
  v_review_status text;
begin
  select item.* into v_item from public.transactions as item
    join public.processed_gmail_messages as message on message.id=item.processed_gmail_message_id
    join public.gmail_connections as connection on connection.id=message.gmail_connection_id
      and connection.user_id=item.user_id and connection.status='active'
    where item.id=p_transaction_id and item.source_type='gmail_email'
    for update of item for share of connection;
  if v_item.id is null then
    raise exception using errcode='P0002',message='Imported transaction not found.';
  end if;
  if v_item.deleted_at is not null or v_item.category_id is not null
    or v_item.updated_at<>v_item.created_at or v_item.review_status<>'pending'
    or (v_item.gmail_classification_status is not null and v_item.gmail_classification_status<>'pending') then
    return query select false,v_item.user_id,v_item.review_status; return;
  end if;
  if p_confidence is not null and (p_confidence<0 or p_confidence>1) then
    raise exception using errcode='22023',message='Classification confidence is invalid.';
  end if;
  if p_category_id is not null then
    select category.* into v_category from public.categories as category
      where category.id=p_category_id and category.user_id=v_item.user_id
        and not category.is_archived and category.kind=p_kind for share;
    if v_category.id is null or p_kind not in ('expense','income','exclusion')
      or (p_kind='expense' and v_item.flow_direction is distinct from 'out')
      or (p_kind='income' and v_item.flow_direction is distinct from 'in') then
      raise exception using errcode='22023',message='An active compatible owned Category is required.';
    end if;
    if v_category.kind='exclusion' and v_category.is_default and v_category.slug='internal' then
      select profile.full_name into v_holder from public.profiles as profile
        where profile.id=v_item.user_id for share;
      v_internal:=coalesce((v_item.gmail_extraction_evidence ->> 'isTransfer')::boolean,false)
        and coalesce(v_item.gmail_extraction_evidence ->> 'counterpartyType','unknown')<>'business'
        and v_item.flow_direction in ('in','out')
        and private.normalized_holder_name(v_holder) is not null
        and private.normalized_holder_name(v_holder)=
          private.normalized_holder_name(v_item.gmail_extraction_evidence ->> 'counterpartyName');
      -- Never turn an ambiguous possible transfer into an exclusion automatically.
      if not coalesce(v_internal,false) then
        update public.transactions set gmail_classification_status='needs_review',
          gmail_auto_confirm_pending=false where id=v_item.id;
        return query select false,v_item.user_id,v_item.review_status; return;
      end if;
    end if;
    if v_item.financial_account_id is not null then
      perform 1 from public.financial_accounts as account
        where account.id=v_item.financial_account_id and account.user_id=v_item.user_id
          and account.is_active for share;
      v_qualified:=found;
    end if;
    v_qualified:=v_qualified and v_item.gmail_auto_confirm_pending
      and v_item.ai_confidence>=public.gmail_auto_confirm_confidence()
      and p_confidence>=0.95 and v_item.amount is not null and v_item.currency='IDR'
      and v_item.gmail_extraction_evidence ->> 'occurredOn' is not null
      -- Personal/unknown transfers may be an unrecognized own-account transfer.
      -- Keep the category suggestion pending rather than guessing financial impact.
      and (not coalesce((v_item.gmail_extraction_evidence ->> 'isTransfer')::boolean,false)
        or coalesce(v_internal,false)
        or v_item.gmail_extraction_evidence ->> 'counterpartyType'='business')
      and (p_kind in ('expense','income') or coalesce(v_internal,false));
  elsif p_kind is not null then
    raise exception using errcode='22023',message='Classification category is missing.';
  end if;
  v_review_status:=case when coalesce(v_qualified,false) then 'confirmed' else 'pending' end;
  update public.transactions set category_id=p_category_id,
    transaction_type=case when p_category_id is null then v_item.transaction_type else p_kind end,
    review_status=v_review_status,gmail_auto_confirm_pending=false,
    gmail_classification_confidence=p_confidence,
    gmail_classification_status=case
      when p_category_id is null or p_confidence is null or p_confidence<0.95
        or (p_kind='exclusion' and not coalesce(v_internal,false)) then 'needs_review'
      else 'completed' end
    where id=v_item.id;
  return query select true,v_item.user_id,v_review_status;
end; $$;
revoke execute on function public.set_imported_category(uuid,uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.set_imported_category(uuid,uuid,text,numeric) to service_role;

-- Old calls may still drain. Resolve only a unique compatible label, and never
-- interpret a legacy call as classification confidence or auto-confirmation.
create or replace function public.set_imported_category(p_transaction_id uuid,p_category_name text)
returns table(applied boolean,user_id uuid,review_status text)
language plpgsql security invoker set search_path='' as $$
declare v_item public.transactions%rowtype; v_category_id uuid;
begin
  select item.* into v_item from public.transactions as item where item.id=p_transaction_id;
  select case when count(*)=1 then (array_agg(category.id))[1] end into v_category_id
    from public.categories as category where category.user_id=v_item.user_id
      and category.kind=v_item.transaction_type and not category.is_archived
      and lower(btrim(category.name))=lower(btrim(p_category_name));
  if v_category_id is null then
    perform * from public.set_imported_category(p_transaction_id,null::uuid,null::text,null::numeric);
    return query select false,v_item.user_id,v_item.review_status;
    return;
  end if;
  return query select * from public.set_imported_category(p_transaction_id,v_category_id,
    v_item.transaction_type,null::numeric);
end; $$;

-- Provider retry waits are bounded deadlines, not failed imports or synthetic progress.
alter table public.gmail_connections add column sync_retry_until timestamptz;
create function public.report_gmail_processing_retry(
  p_delay_seconds integer,p_connection_id uuid default null,p_transaction_id uuid default null
) returns void language plpgsql security invoker set search_path='' as $$
declare v_connection_id uuid;
begin
  if p_delay_seconds is null or p_delay_seconds<0 or p_delay_seconds>900
    or (p_connection_id is null)=(p_transaction_id is null) then
    raise exception using errcode='22023',message='A bounded retry needs exactly one processing target.';
  end if;
  if p_transaction_id is not null then
    select connection.id into v_connection_id from public.transactions as item
      join public.processed_gmail_messages as message on message.id=item.processed_gmail_message_id
        and message.user_id=item.user_id
      join public.gmail_connections as connection on connection.id=message.gmail_connection_id
        and connection.user_id=item.user_id and connection.status='active'
      where item.id=p_transaction_id and item.source_type='gmail_email'
      for share of item for update of connection;
  else
    select connection.id into v_connection_id from public.gmail_connections as connection
      where connection.id=p_connection_id and connection.status='active' for update;
  end if;
  if v_connection_id is null then
    raise exception using errcode='P0002',message='Gmail connection is not active.';
  end if;
  update public.gmail_connections set sync_retry_until=greatest(sync_retry_until,
    statement_timestamp()+make_interval(secs=>p_delay_seconds)),
    sync_updated_at=statement_timestamp() where id=v_connection_id;
end; $$;
revoke execute on function public.report_gmail_processing_retry(integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.report_gmail_processing_retry(integer,uuid,uuid) to service_role;

create or replace function public.request_gmail_sync(p_user_id uuid, p_connection_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_connection public.gmail_connections%rowtype;
  v_status text;
  v_requested_at timestamptz := statement_timestamp();
begin
  select connection.* into v_connection
    from public.gmail_connections as connection
    where connection.id = p_connection_id
      and connection.user_id = p_user_id
      and connection.status = 'active'
    for update of connection;
  if v_connection.id is null then
    raise exception using errcode = 'P0002', message = 'Gmail connection is not active.';
  end if;

  select status.state into v_status
    from public.gmail_sync_statuses(p_user_id) as status
    where status.connection_id = p_connection_id;
  if v_status in ('queued', 'running') then
    raise exception using errcode = '55000', message = 'A Gmail sync is already running.';
  end if;

  update public.gmail_connections
    set sync_state = 'queued', sync_error = null, sync_retry_until = null,
      sync_requested_at = v_requested_at, sync_updated_at = v_requested_at,
      sync_pending_runs = 1
    where id = p_connection_id;
  return v_requested_at;
end;
$$;

create or replace function public.start_gmail_sync(p_connection_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.gmail_connections
    set sync_state = 'listing', sync_error = null,
      sync_retry_until = case when sync_state in ('queued','listing') then sync_retry_until else null end,
      sync_requested_at = case
        when sync_state in ('queued', 'listing') then coalesce(sync_requested_at, statement_timestamp())
        else statement_timestamp()
      end,
      sync_pending_runs = case
        when sync_state in ('queued', 'listing') then greatest(sync_pending_runs, 1)
        else 1
      end,
      sync_updated_at = statement_timestamp()
    where id = p_connection_id and status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'Gmail connection is not active.';
  end if;
end;
$$;

-- Status waits for both stages. needs_review is terminal and does not strand a sync.
drop function public.gmail_sync_statuses(uuid);
create function public.gmail_sync_statuses(p_user_id uuid)
returns table(connection_id uuid,state text,error text,requested_at timestamptz,
  imported bigint,skipped bigint,failed bigint,in_progress bigint,
  imported_transactions bigint,confirmed_transactions bigint,categorizing bigint,needs_review bigint)
language sql stable security invoker set search_path='' as $$
with run as (
  select connection.*,
    greatest(connection.sync_updated_at,connection.sync_retry_until,
      (select max(coalesce(message.processed_at,message.created_at))
        from public.processed_gmail_messages as message where message.gmail_connection_id=connection.id
          and message.created_at>=connection.sync_requested_at),
      (select max(item.updated_at) from public.transactions as item
        join public.processed_gmail_messages as message on message.id=item.processed_gmail_message_id
        where message.gmail_connection_id=connection.id and message.created_at>=connection.sync_requested_at)
    ) as last_progress_at
  from public.gmail_connections as connection where connection.user_id=p_user_id
), counts as (
  select run.id,
    (select count(*) from public.processed_gmail_messages as m where m.gmail_connection_id=run.id
      and m.created_at>=run.sync_requested_at and m.processing_status='processed') as imported,
    (select count(*) from public.processed_gmail_messages as m where m.gmail_connection_id=run.id
      and m.created_at>=run.sync_requested_at and m.processing_status='skipped') as skipped,
    (select count(*) from public.processed_gmail_messages as m where m.gmail_connection_id=run.id
      and m.created_at>=run.sync_requested_at and m.processing_status='failed') as failed,
    (select count(*) from public.processed_gmail_messages as m where m.gmail_connection_id=run.id
      and m.created_at>=run.sync_requested_at and m.processing_status='processing') as in_progress,
    count(item.id) as imported_transactions,
    count(item.id) filter(where item.review_status='confirmed') as confirmed_transactions,
    count(item.id) filter(where item.gmail_classification_status='pending' and item.deleted_at is null) as categorizing,
    count(item.id) filter(where item.gmail_classification_status in ('needs_review','completed')
      and item.review_status='pending' and item.deleted_at is null) as needs_review
  from run left join public.processed_gmail_messages as source
    on source.gmail_connection_id=run.id and source.created_at>=run.sync_requested_at
  left join public.transactions as item on item.processed_gmail_message_id=source.id
  group by run.id,run.sync_requested_at
)
select run.id,
  case when run.sync_state='idle' then 'idle' when run.sync_state='failed' then 'failed'
    when run.sync_state='listed' and counts.in_progress=0 and counts.categorizing=0 then 'completed'
    when run.last_progress_at<statement_timestamp()-public.gmail_sync_stall_interval() then 'failed'
    when run.sync_state='queued' then 'queued' else 'running' end,
  case when run.sync_state='failed' then run.sync_error
    when run.sync_state in ('queued','listing','listed')
      and not(run.sync_state='listed' and counts.in_progress=0 and counts.categorizing=0)
      and run.last_progress_at<statement_timestamp()-public.gmail_sync_stall_interval() then 'stalled' end,
  run.sync_requested_at,counts.imported,counts.skipped,counts.failed,counts.in_progress,
  counts.imported_transactions,counts.confirmed_transactions,counts.categorizing,counts.needs_review
from run join counts on counts.id=run.id;
$$;
revoke execute on function public.gmail_sync_statuses(uuid) from public,anon,authenticated;
grant execute on function public.gmail_sync_statuses(uuid) to service_role;
