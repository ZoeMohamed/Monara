-- Undo is a receipt-authorized reversal, not a general review-status transition.
-- The backend invokes this narrow RPC; receipt consumption and restoration commit
-- together so a concurrent retry cannot apply the same reversal twice.
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
      'financial_account_id', v_values->'financialAccountId', 'review_status', 'pending'
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

create function public.restore_transaction_from_undo(p_user_id uuid, p_action_id uuid)
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
