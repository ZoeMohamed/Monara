-- Keep original USD cents and persisted IDR reporting values on one owned transaction.
create table public.fx_reference_rates (
  requested_on date primary key,
  rate_date date not null check (rate_date <= requested_on),
  rate numeric not null check (rate > 0 and rate < 100000000 and scale(rate) <= 12),
  source text not null default 'frankfurter_ecb' check (source = 'frankfurter_ecb'),
  created_at timestamptz not null default statement_timestamp()
);
alter table public.fx_reference_rates enable row level security;
revoke all on public.fx_reference_rates from public, anon, authenticated;
revoke update, delete, truncate on public.fx_reference_rates from service_role;
grant select, insert on public.fx_reference_rates to service_role;
comment on table public.fx_reference_rates is 'Immutable public USD/IDR ECB reference rates keyed by requested transaction day. Contains no User or financial records.';

alter table public.transactions
  drop constraint transactions_currency_check,
  drop constraint transactions_confirmed_fields_check,
  add column idr_amount numeric check (idr_amount is null or (idr_amount > 0 and idr_amount < 100000000000000000000 and idr_amount = trunc(idr_amount))),
  add column fx_snapshot jsonb,
  add column original_money jsonb generated always as (gmail_extraction_evidence->'originalMoney') stored,
  add column fx_retry_count integer not null default 0 check (fx_retry_count between 0 and 5),
  add column fx_retry_after timestamptz not null default statement_timestamp(),
  add column fx_auto_confirm_eligible boolean not null default false,
  add constraint transactions_currency_check check (currency is null or currency in ('IDR','USD')),
  add constraint transactions_confirmed_fields_check check (
    review_status <> 'confirmed' or (transaction_type is not null and (
      transaction_type = 'exclusion' or (amount is not null and (currency='IDR' or (currency='USD' and idr_amount is not null)) and occurred_on is not null)
    ))
  );
-- Existing IDR history remains untouched; its amount is already its reporting value.

-- All callers, including authenticated direct writes, derive reporting values from the
-- server-private rate cache. Caller-supplied reporting values and snapshots are ignored.
create function private.value_transaction_currency() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_rate public.fx_reference_rates%rowtype; v_state jsonb; v_same boolean:=false;
begin
  if tg_op='UPDATE' then
    v_same:=(new.amount,new.currency,new.occurred_on) is not distinct from (old.amount,old.currency,old.occurred_on);
    if current_setting('monara.restore_transaction_action_id',true) <> '' then
      select state.operation_state into v_state from public.agent_action_states state
        join public.agent_action_logs log on log.id=state.action_id and log.user_id=state.user_id
        where state.action_id::text=current_setting('monara.restore_transaction_action_id',true)
          and state.user_id=old.user_id and state.consumed_at is null
          and state.expires_at>statement_timestamp() and state.purpose='undo'
          and log.resource_id=old.id and log.resource_type='transaction'
          and log.result_status='succeeded'
          and (state.operation_state->>'expectedUpdatedAt')::timestamptz=old.updated_at;
      if v_state is not null then
        new.idr_amount:=case when v_state ? 'idrMoney' then (v_state->'idrMoney'->>'amountMinor')::numeric
          when new.currency='IDR' then new.amount else null end;
        new.fx_snapshot:=nullif(v_state->'fxSnapshot','null'::jsonb);
        new.fx_auto_confirm_eligible:=false;
        return new;
      end if;
    end if;
    if v_same and current_setting('monara.apply_transaction_fx',true) is distinct from old.id::text then
      new.idr_amount:=old.idr_amount; new.fx_snapshot:=old.fx_snapshot;
    else
      new.idr_amount:=null; new.fx_snapshot:=null;
    end if;
    if not v_same then
      new.fx_retry_count:=0; new.fx_retry_after:=statement_timestamp();
    end if;
    if current_setting('monara.fx_recovery_id',true) is distinct from old.id::text
      and not (old.gmail_classification_status='pending' and new.gmail_classification_status in ('completed','needs_review')) then
      new.fx_auto_confirm_eligible:=false;
    end if;
  else
    new.idr_amount:=null; new.fx_snapshot:=null;
  end if;
  if new.currency='IDR' then
    new.idr_amount:=new.amount; new.fx_snapshot:=null;
  elsif new.currency='USD' and new.amount is not null and new.occurred_on is not null and new.fx_snapshot is null
    and (tg_op='INSERT' or not v_same or current_setting('monara.apply_transaction_fx',true)=new.id::text or new.review_status='confirmed') then
    select * into v_rate from public.fx_reference_rates where requested_on=new.occurred_on;
    if found then
      new.idr_amount:=round(new.amount*v_rate.rate/100);
      if new.idr_amount<=0 or new.idr_amount>=100000000000000000000 then
        new.idr_amount:=null;
      end if;
      new.fx_snapshot:=case when new.idr_amount is null then null else jsonb_build_object('rate',v_rate.rate::text,'rateDate',v_rate.rate_date,
        'requestedOn',v_rate.requested_on,'source',v_rate.source,'rounding','half_up_rupiah') end;
    end if;
  end if;
  if new.currency is distinct from 'IDR' and new.currency is distinct from 'USD' then
    new.idr_amount:=null; new.fx_snapshot:=null;
  end if;
  if new.currency='USD' and new.idr_amount is null and new.transaction_type is distinct from 'exclusion' then
    new.review_status:='pending';
  end if;
  return new;
end; $$;
revoke all on function private.value_transaction_currency() from public,anon,authenticated;
create trigger transactions_aaa_value_currency before insert or update on public.transactions
for each row execute function private.value_transaction_currency();

create index transactions_pending_fx_idx on public.transactions(fx_retry_after,id)
where currency='USD' and idr_amount is null and deleted_at is null and fx_retry_count<5;

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
            and mapped.currency in ('IDR','USD')
            and coalesce((mapped.evidence->>'currencyInferred')::boolean,false)=false
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

create or replace function public.set_imported_category(
  p_transaction_id uuid,p_category_id uuid default null,p_kind text default null,p_confidence numeric default null
) returns table(applied boolean,user_id uuid,review_status text)
language plpgsql security invoker set search_path='' as $$
declare
  v_item public.transactions%rowtype;
  v_category public.categories%rowtype;
  v_holder text;
  v_misc_id uuid;
  v_kind text;
  v_internal boolean:=false;
  v_use_fallback boolean:=false;
  v_active_owned_account boolean:=false;
  v_financial_facts_valid boolean:=false;
  v_confidence_qualified boolean:=false;
  v_extraction_confidence numeric;
  v_review_status text;
begin
  select item.* into v_item from public.transactions as item
    join public.processed_gmail_messages as message on message.id=item.processed_gmail_message_id
      and message.user_id=item.user_id
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
  if p_kind is not null and p_kind not in ('expense','income','exclusion') then
    raise exception using errcode='22023',message='Classification type is invalid.';
  end if;
  v_use_fallback:=p_category_id is null;
  if p_category_id is not null then
    -- Check ownership before recognizing old Misc hints. An owned default Misc
    -- may be archived or typed incorrectly; normalize it to the current rule.
    select category.* into v_category from public.categories as category
      where category.id=p_category_id and category.user_id=v_item.user_id;
    if v_category.id is null then
      raise exception using errcode='22023',message='An active compatible owned Category is required.';
    end if;
    v_use_fallback:=v_category.is_default and (
      (v_category.kind='expense' and (v_category.slug='misc'
        or v_category.slug like 'gmail-fallback-expense-%'))
      or (v_category.kind='income' and (v_category.slug='misc-income'
        or v_category.slug like 'gmail-fallback-income-%'))
      or (v_category.kind='exclusion' and (v_category.slug='misc-exclusion'
        or v_category.slug like 'gmail-fallback-exclusion-%')));
    if not v_use_fallback then
      -- Specific decisions need a stable active category. Do not hold a shared
      -- Misc lock before its resolver's advisory/update locks, which can deadlock
      -- parallel workers normalizing the same archived fallback.
      select category.* into v_category from public.categories as category
        where category.id=p_category_id and category.user_id=v_item.user_id for share;
      if v_category.id is null then
        raise exception using errcode='22023',message='An active compatible owned Category is required.';
      end if;
      v_kind:=coalesce(p_kind,v_item.transaction_type,v_category.kind);
      if v_category.is_archived or v_category.kind<>v_kind
        or (v_kind='expense' and v_item.flow_direction='in')
        or (v_kind='income' and v_item.flow_direction='out') then
        raise exception using errcode='22023',message='An active compatible owned Category is required.';
      end if;
      if v_category.kind='exclusion' and v_category.is_default and v_category.slug='internal' then
        select profile.full_name into v_holder from public.profiles as profile
          where profile.id=v_item.user_id for share;
        v_internal:=private.holder_name_matches(
          v_item.gmail_extraction_evidence ->> 'counterpartyName',v_holder);
        -- Internal uses original names, never the normalized display or labels.
        v_use_fallback:=not coalesce(v_internal,false);
      end if;
      -- A specific category cannot create missing cash direction. Verified
      -- Internal and default Person retain priority while incomplete and pending.
      if v_item.flow_direction is null and not coalesce(v_internal,false)
        and not(v_category.is_default and (
          (v_category.kind='expense' and v_category.slug='person')
          or (v_category.kind='income' and v_category.slug='person-income'))) then
        v_use_fallback:=true;
      end if;
    end if;
  end if;
  if v_use_fallback then
    -- Generic fallback is always Income Misc for clear money in, else Expense
    -- Misc. Original extracted type and old Misc hints never force exclusion.
    v_kind:=case when v_item.flow_direction='in' then 'income' else 'expense' end;
    v_misc_id:=private.gmail_misc_category(v_item.user_id,v_kind);
    select category.* into v_category from public.categories as category
      where category.id=v_misc_id for share;
  end if;
  if v_item.financial_account_id is not null then
    perform 1 from public.financial_accounts as account
      where account.id=v_item.financial_account_id and account.user_id=v_item.user_id
        and account.is_active for share;
    v_active_owned_account:=found;
  end if;
  -- ai_confidence is rounded to three decimals for compatibility. Use original
  -- evidence when present so .4995 cannot round into qualification at .500.
  v_extraction_confidence:=coalesce(
    (v_item.gmail_extraction_evidence ->> 'confidence')::numeric,v_item.ai_confidence);
  -- PostgreSQL LEAST ignores NULL scores and returns NULL if both are absent.
  v_confidence_qualified:=coalesce(
    least(v_extraction_confidence,p_confidence)>=public.gmail_auto_confirm_confidence(),false);
  v_financial_facts_valid:=v_kind in ('expense','income','exclusion')
    and v_item.amount is not null and v_item.idr_amount is not null
    and v_item.currency in ('IDR','USD')
    and coalesce((v_item.gmail_extraction_evidence->>'currencyInferred')::boolean,false)=false
    and v_item.occurred_on is not null and v_item.flow_direction in ('in','out');
  v_review_status:=case
    when coalesce(v_active_owned_account,false) and coalesce(v_financial_facts_valid,false)
      and v_confidence_qualified then 'confirmed'
    else 'pending' end;
  update public.transactions set category_id=v_category.id,
    transaction_type=v_kind,flow_direction=v_item.flow_direction,
    review_status=v_review_status,gmail_auto_confirm_pending=false,
    gmail_classification_confidence=p_confidence,
    fx_auto_confirm_eligible=coalesce(v_active_owned_account and v_confidence_qualified
      and v_item.currency='USD' and v_item.idr_amount is null and v_item.amount is not null
      and v_item.occurred_on is not null and v_item.flow_direction in ('in','out')
      and coalesce((v_item.gmail_extraction_evidence->>'currencyInferred')::boolean,false)=false,false),
    gmail_classification_status=case when v_review_status='confirmed' then 'completed' else 'needs_review' end
    where id=v_item.id;
  return query select true,v_item.user_id,v_review_status;
end; $$;
revoke execute on function public.set_imported_category(uuid,uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.set_imported_category(uuid,uuid,text,numeric) to service_role;


create or replace function private.enforce_transaction_review_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state jsonb;
  v_values jsonb;
  v_expected public.transactions%rowtype;
begin
  if old.review_status='confirmed' and new.review_status='pending'
    and new.currency='USD' and new.idr_amount is null
    and (new.amount,new.currency,new.occurred_on) is distinct from (old.amount,old.currency,old.occurred_on) then
    return new;
  end if;
  if new.review_status is distinct from old.review_status and old.review_status <> 'pending' then
    if old.review_status <> 'confirmed' or new.review_status <> 'pending' then
      raise exception using errcode = '23514', message = 'Only pending transactions may change review status.';
    end if;
    select state.operation_state into v_state
      from public.agent_action_states state
      join public.agent_action_logs log on log.id = state.action_id and log.user_id = state.user_id
      where state.action_id::text = current_setting('monara.restore_transaction_action_id', true)
        and state.user_id = old.user_id and state.purpose = 'undo'
        and state.consumed_at is null and state.expires_at > statement_timestamp()
        and log.resource_type = 'transaction' and log.resource_id = old.id
        and log.result_status = 'succeeded'
        and state.operation_state->>'operation' = 'restore_transaction'
        and state.operation_state->>'reviewStatus' = 'pending'
        and (state.operation_state->>'expectedUpdatedAt')::timestamptz = old.updated_at;
    if v_state is null then
      raise exception using errcode = '23514', message = 'Only pending transactions may change review status.';
    end if;
    v_values := v_state->'values';
    v_expected := jsonb_populate_record(old, jsonb_build_object(
      'transaction_type', v_values->'kind',
      'flow_direction', case
        when v_values ? 'flowDirection' then v_values->'flowDirection'
        when v_values->>'kind' = 'expense' then to_jsonb('out'::text)
        when v_values->>'kind' = 'income' then to_jsonb('in'::text)
        else 'null'::jsonb
      end,
      'merchant_name', v_values->'merchantName',
      'amount', v_values->'money'->'amountMinor', 'currency', v_values->'money'->'currency',
      'occurred_on', v_values->'occurredOn', 'occurred_time', v_values->'occurredTime',
      'description', v_values->'description', 'location', v_values->'location',
      'account_hint', v_values->'accountHint', 'category_id', v_values->'categoryId',
      'financial_account_id', v_values->'financialAccountId', 'review_status', 'pending',
      'idr_amount', case when v_state ? 'idrMoney' then v_state->'idrMoney'->'amountMinor'
        when v_values->'money'->>'currency'='IDR' then v_values->'money'->'amountMinor' else 'null'::jsonb end,
      'fx_snapshot', v_state->'fxSnapshot', 'fx_auto_confirm_eligible', false
    ));
    -- Compare the entire intended row, including immutable provenance. Only the
    -- version timestamp may differ; ordinary timestamp triggers still own it.
    if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(v_expected) - 'updated_at') then
      raise exception using errcode = '23514', message = 'Undo must restore the exact previous transaction.';
    end if;
  end if;
  return new;
end;
$$;


create or replace function public.restore_transaction_from_undo(p_user_id uuid, p_action_id uuid)
returns setof public.transactions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.agent_action_states%rowtype;
  v_resource_id uuid;
  v_current public.transactions%rowtype;
  v_expected public.transactions%rowtype;
  v_restored public.transactions%rowtype;
  v_values jsonb;
  v_review_status text;
  v_previous_context text;
begin
  select state.* into v_state
    from public.agent_action_states state
    join public.agent_action_logs log on log.id = state.action_id and log.user_id = state.user_id
    where state.action_id = p_action_id and state.user_id = p_user_id and state.purpose = 'undo'
      and log.resource_type = 'transaction' and log.result_status = 'succeeded'
    for update of state, log;
  if v_state.action_id is null then
    raise exception using errcode = 'P0002', message = 'That change was not found.';
  end if;
  if v_state.consumed_at is not null or v_state.expires_at <= statement_timestamp() then
    raise exception using errcode = '55000', message = 'That change can no longer be undone.';
  end if;
  v_values := v_state.operation_state->'values';
  v_review_status := v_state.operation_state->>'reviewStatus';
  if v_state.operation_state->>'operation' is distinct from 'restore_transaction'
    or v_review_status is null or v_review_status not in ('pending', 'confirmed')
    or jsonb_typeof(v_values) is distinct from 'object'
    or not (v_values ?& array['kind', 'merchantName', 'money', 'occurredOn', 'occurredTime',
      'description', 'location', 'accountHint', 'categoryId', 'financialAccountId']) then
    raise exception using errcode = '23514', message = 'That change cannot be restored safely.';
  end if;
  select resource_id into v_resource_id from public.agent_action_logs where id = p_action_id;
  select item.* into v_current from public.transactions item
    where item.id = v_resource_id and item.user_id = p_user_id and item.deleted_at is null
    for update;
  if v_current.id is null then
    raise exception using errcode = 'P0002', message = 'That transaction was not found.';
  end if;
  if (v_state.operation_state->>'expectedUpdatedAt')::timestamptz is distinct from v_current.updated_at then
    raise exception using errcode = '55000', message = 'This record changed. Reload it and try again.';
  end if;
  v_expected := jsonb_populate_record(v_current, jsonb_build_object(
    'transaction_type', v_values->'kind',
      'flow_direction', case
        when v_values ? 'flowDirection' then v_values->'flowDirection'
        when v_values->>'kind' = 'expense' then to_jsonb('out'::text)
        when v_values->>'kind' = 'income' then to_jsonb('in'::text)
        else 'null'::jsonb
      end,
      'merchant_name', v_values->'merchantName',
    'amount', v_values->'money'->'amountMinor', 'currency', v_values->'money'->'currency',
    'occurred_on', v_values->'occurredOn', 'occurred_time', v_values->'occurredTime',
    'description', v_values->'description', 'location', v_values->'location',
    'account_hint', v_values->'accountHint', 'category_id', v_values->'categoryId',
    'financial_account_id', v_values->'financialAccountId', 'review_status', v_review_status
  ));
  v_previous_context := current_setting('monara.restore_transaction_action_id', true);
  perform set_config('monara.restore_transaction_action_id', p_action_id::text, true);
  update public.transactions set
    transaction_type = v_expected.transaction_type, flow_direction = v_expected.flow_direction,
    merchant_name = v_expected.merchant_name,
    amount = v_expected.amount, currency = v_expected.currency,
    occurred_on = v_expected.occurred_on, occurred_time = v_expected.occurred_time,
    description = v_expected.description, location = v_expected.location,
    account_hint = v_expected.account_hint, category_id = v_expected.category_id,
    financial_account_id = v_expected.financial_account_id, review_status = v_expected.review_status
    where id = v_current.id and user_id = p_user_id
    returning * into v_restored;
  perform set_config('monara.restore_transaction_action_id', coalesce(v_previous_context, ''), true);
  update public.agent_action_states set consumed_at = statement_timestamp()
    where action_id = p_action_id and user_id = p_user_id;
  update public.agent_action_logs set result_status = 'reversed'
    where id = p_action_id and user_id = p_user_id;
  return next v_restored;
end;
$$;
revoke all on function private.enforce_transaction_review_transition() from public, anon, authenticated;
revoke execute on function public.restore_transaction_from_undo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.restore_transaction_from_undo(uuid, uuid) to service_role;


-- Durable, bounded recovery is independent of Gmail classification and import progress.
create function public.claim_transaction_fx_jobs(p_limit integer default 10)
returns table(transaction_id uuid,user_id uuid,occurred_on date,expected_updated_at timestamptz)
language plpgsql security invoker set search_path='' as $$
declare v_item public.transactions%rowtype; v_claimed public.transactions%rowtype;
begin
  for v_item in select item.* from public.transactions item
    where item.currency='USD' and item.idr_amount is null and item.amount is not null
      and item.occurred_on is not null and item.deleted_at is null
      and item.review_status='pending' and item.fx_retry_count<5
      and item.fx_retry_after<=statement_timestamp()
      and item.gmail_classification_status is distinct from 'pending'
      and public.monara_user_is_active(item.user_id)
      and (item.source_type<>'gmail_email' or exists (
        select 1 from public.processed_gmail_messages message
        join public.gmail_connections connection on connection.id=message.gmail_connection_id
          and connection.user_id=message.user_id and connection.status='active'
        where message.id=item.processed_gmail_message_id and message.user_id=item.user_id
      ))
    order by item.fx_retry_after,item.id limit greatest(1,least(p_limit,10))
    for update of item skip locked
  loop
    perform set_config('monara.fx_recovery_id',v_item.id::text,true);
    update public.transactions item set fx_retry_count=item.fx_retry_count+1,
      fx_retry_after=statement_timestamp()+make_interval(secs=>60*power(2,item.fx_retry_count)::integer)
      where item.id=v_item.id returning item.* into v_claimed;
    perform set_config('monara.fx_recovery_id','',true);
    transaction_id:=v_claimed.id; user_id:=v_claimed.user_id;
    occurred_on:=v_claimed.occurred_on; expected_updated_at:=v_claimed.updated_at;
    return next;
  end loop;
end; $$;

create function public.apply_transaction_fx(p_transaction_id uuid,p_user_id uuid,p_expected_updated_at timestamptz)
returns table(applied boolean,confirmed boolean)
language plpgsql security invoker set search_path='' as $$
declare v_item public.transactions%rowtype; v_confirm boolean:=false; v_saved public.transactions%rowtype;
begin
  select item.* into v_item from public.transactions item where item.id=p_transaction_id
    and item.user_id=p_user_id and item.updated_at=p_expected_updated_at and item.deleted_at is null
    and item.currency='USD' and item.idr_amount is null and item.occurred_on is not null
    and item.review_status='pending' for update;
  if v_item.id is null or not public.monara_user_is_active(p_user_id)
    or not exists(select 1 from public.fx_reference_rates where requested_on=v_item.occurred_on) then
    return query select false,false; return;
  end if;
  if v_item.source_type='gmail_email' and not exists (
    select 1 from public.processed_gmail_messages message join public.gmail_connections connection
      on connection.id=message.gmail_connection_id and connection.user_id=message.user_id
      and connection.status='active' where message.id=v_item.processed_gmail_message_id and message.user_id=p_user_id
  ) then return query select false,false; return; end if;
  v_confirm:=v_item.fx_auto_confirm_eligible
    and exists(select 1 from public.financial_accounts account where account.id=v_item.financial_account_id
      and account.user_id=p_user_id and account.is_active)
    and exists(select 1 from public.categories category where category.id=v_item.category_id
      and category.user_id=p_user_id and category.kind=v_item.transaction_type and not category.is_archived);
  perform set_config('monara.fx_recovery_id',v_item.id::text,true);
  perform set_config('monara.apply_transaction_fx',v_item.id::text,true);
  update public.transactions item set fx_snapshot=null,
    review_status=case when v_confirm then 'confirmed' else 'pending' end,
    fx_auto_confirm_eligible=false,
    gmail_classification_status=case when v_confirm then 'completed' else item.gmail_classification_status end
    where item.id=v_item.id returning item.* into v_saved;
  perform set_config('monara.fx_recovery_id','',true);
  perform set_config('monara.apply_transaction_fx','',true);
  return query select true,v_saved.review_status='confirmed';
end; $$;
revoke all on function public.claim_transaction_fx_jobs(integer) from public,anon,authenticated;
revoke all on function public.apply_transaction_fx(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_transaction_fx_jobs(integer) to service_role;
grant execute on function public.apply_transaction_fx(uuid,uuid,timestamptz) to service_role;
