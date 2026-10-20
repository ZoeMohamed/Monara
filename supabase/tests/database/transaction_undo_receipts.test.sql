begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
grant usage on schema extensions to anon, authenticated;
select plan(27);

insert into auth.users(id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'undo-owner@test.monara.local'),
  ('f1000000-0000-4000-8000-000000000002', 'undo-other@test.monara.local');
insert into public.financial_accounts(id, user_id, client_request_id, name, account_type)
values ('f1100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
  'synthetic-undo-bank', 'Synthetic undo account', 'bank');
insert into public.financial_accounts(id, user_id, client_request_id, name, account_type, is_active)
values ('f1100000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001',
  'synthetic-undo-inactive-bank', 'Synthetic inactive undo account', 'bank', false);
insert into public.gmail_connections(id, user_id, composio_connected_account_id, gmail_address, status)
values ('f1200000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
  'synthetic-undo-connection', 'undo-owner@test.monara.local', 'active');

create function pg_temp.undo_values(item public.transactions) returns jsonb language sql as $$
  select jsonb_build_object('kind', item.transaction_type, 'flowDirection', item.flow_direction, 'merchantName', item.merchant_name,
    'money', case when item.amount is null or item.currency is null then null else
      jsonb_build_object('amountMinor', item.amount::text, 'currency', item.currency) end,
    'occurredOn', item.occurred_on, 'occurredTime', item.occurred_time,
    'description', item.description, 'location', item.location, 'accountHint', item.account_hint,
    'categoryId', item.category_id, 'financialAccountId', item.financial_account_id)
$$;
create function pg_temp.undo_source(item public.transactions) returns jsonb language sql as $$
  select jsonb_build_object('id', item.id, 'userId', item.user_id, 'source', item.source_type,
    'message', item.processed_gmail_message_id, 'itemIndex', item.source_item_index,
    'requestId', item.client_request_id, 'confidence', item.ai_confidence,
    'createdAt', item.created_at, 'deletedAt', item.deleted_at)
$$;
create temporary table undo_cases(label text primary key, item_id uuid, action_id uuid,
  previous_values jsonb, source_values jsonb);
grant select on undo_cases to service_role;
create function pg_temp.prepare_undo(p_label text, p_exclude boolean default false,
  p_incoming_exclusion boolean default false)
returns void language plpgsql as $$
declare
  v_message_id uuid := gen_random_uuid();
  v_action_id uuid := gen_random_uuid();
  v_item public.transactions%rowtype;
  v_values jsonb;
  v_source jsonb;
begin
  insert into public.processed_gmail_messages(id, user_id, gmail_connection_id,
    gmail_message_id, processing_status, received_at, processed_at)
  values(v_message_id, 'f1000000-0000-4000-8000-000000000001',
    'f1200000-0000-4000-8000-000000000001', 'synthetic-undo-' || p_label,
    'processed', now(), now());
  insert into public.transactions(user_id, processed_gmail_message_id, source_item_index,
    source_type, review_status, transaction_type, flow_direction, merchant_name, occurred_time,
    description, location, account_hint, category_id, ai_confidence)
  values('f1000000-0000-4000-8000-000000000001', v_message_id, 0, 'gmail_email',
    'pending', case when p_incoming_exclusion then 'exclusion' else 'expense' end,
    case when p_incoming_exclusion then 'in' else 'out' end, 'Original pending merchant', '12:34:56', 'Original pending details',
    'Original location', 'BCA ****4242', case when p_incoming_exclusion then null else
      (select id from public.categories where user_id = 'f1000000-0000-4000-8000-000000000001'
        and slug = 'resto-cafe' and kind = 'expense') end, 0.55)
  returning * into v_item;
  v_values := pg_temp.undo_values(v_item);
  v_source := pg_temp.undo_source(v_item);
  if p_exclude then
    update public.transactions set transaction_type = 'exclusion', category_id = null,
      occurred_on = '2026-10-18', review_status = 'confirmed' where id = v_item.id returning * into v_item;
  else
    update public.transactions set transaction_type = 'expense', flow_direction = 'out',
      category_id = (select id from public.categories where user_id = v_item.user_id and slug = 'resto-cafe' and kind = 'expense'),
      amount = 25000, currency = 'IDR', occurred_on = current_date,
      financial_account_id = 'f1100000-0000-4000-8000-000000000001',
      merchant_name = 'Confirmed merchant', review_status = 'confirmed'
      where id = v_item.id returning * into v_item;
  end if;
  insert into public.agent_action_logs(id, user_id, channel, event_type, tool_name,
    permission_tier, result_status, resource_type, resource_id, undo_expires_at)
  values(v_action_id, v_item.user_id, 'web', 'tool_call',
    case when p_exclude then 'exclude_pending' else 'confirm_pending' end,
    'T1', 'succeeded', 'transaction', v_item.id, now() + interval '10 minutes');
  insert into public.agent_action_states(action_id, user_id, purpose, operation_state, expires_at)
  values(v_action_id, v_item.user_id, 'undo', jsonb_build_object('operation', 'restore_transaction',
    'expectedUpdatedAt', v_item.updated_at, 'reviewStatus', 'pending', 'values', v_values),
    now() + interval '10 minutes');
  insert into undo_cases values(p_label, v_item.id, v_action_id, v_values, v_source);
end;
$$;
select pg_temp.prepare_undo('confirm');
select pg_temp.prepare_undo('exclude', true);
select pg_temp.prepare_undo('guard', true);
select pg_temp.prepare_undo('stale');
select pg_temp.prepare_undo('expired');
select pg_temp.prepare_undo('consumed');
select pg_temp.prepare_undo('constraint');
select pg_temp.prepare_undo('legacy');
select pg_temp.prepare_undo('incoming', false, true);
update public.agent_action_states set operation_state = jsonb_set(
  operation_state, '{values}', (operation_state->'values') - 'flowDirection'
) where action_id = (select action_id from undo_cases where label = 'legacy');

set local role authenticated;
select throws_ok($$select * from public.restore_transaction_from_undo(
  'f1000000-0000-4000-8000-000000000001', gen_random_uuid())$$,
  '42501', null, 'browser clients cannot invoke receipt restoration directly');
reset role;
set local role service_role;
select throws_ok($$update public.transactions set review_status = 'pending'
  where id = (select item_id from undo_cases where label = 'guard')$$,
  '23514', 'Only pending transactions may change review status.',
  'normal writes cannot roll a confirmed record back to pending');
select set_config('monara.restore_transaction_action_id',
  (select action_id::text from undo_cases where label = 'guard'), true);
select throws_ok($$update public.transactions set review_status = 'pending', transaction_type = 'expense',
  category_id = (select (previous_values->>'categoryId')::uuid from undo_cases where label = 'guard'),
  description = 'Forged replacement'
  where id = (select item_id from undo_cases where label = 'guard')$$,
  '23514', 'Undo must restore the exact previous transaction.',
  'a receipt cannot authorize a different mutable snapshot');
select throws_ok($$update public.transactions set review_status = 'pending', transaction_type = 'expense',
  category_id = (select (previous_values->>'categoryId')::uuid from undo_cases where label = 'guard'),
  ai_confidence = 0.99 where id = (select item_id from undo_cases where label = 'guard')$$,
  '23514', 'Undo must restore the exact previous transaction.',
  'even a matching receipt cannot rewrite import provenance');
select set_config('monara.restore_transaction_action_id', '', true);

select lives_ok($$select * from public.restore_transaction_from_undo(
  'f1000000-0000-4000-8000-000000000001',
  (select action_id from undo_cases where label = 'confirm'))$$, 'confirm Undo restores through its owned receipt');
select is((select pg_temp.undo_values(item) from public.transactions item
  where item.id = (select item_id from undo_cases where label = 'confirm')),
  (select previous_values from undo_cases where label = 'confirm'),
  'confirm Undo restores every previous value, including missing amount, date and account');
select is((select pg_temp.undo_source(item) from public.transactions item
  where item.id = (select item_id from undo_cases where label = 'confirm')),
  (select source_values from undo_cases where label = 'confirm'), 'confirm Undo preserves the original import source');
select ok((select consumed_at is not null from public.agent_action_states
  where action_id = (select action_id from undo_cases where label = 'confirm')), 'successful Undo consumes its receipt atomically');
select throws_ok($$select * from public.restore_transaction_from_undo(
  'f1000000-0000-4000-8000-000000000001', (select action_id from undo_cases where label = 'confirm'))$$,
  'P0002', 'That change was not found.', 'a repeated receipt cannot apply a second reversal');
select lives_ok($$select * from public.restore_transaction_from_undo(
  'f1000000-0000-4000-8000-000000000001',
  (select action_id from undo_cases where label = 'exclude'))$$, 'exclude Undo returns the imported record to pending');
select is((select pg_temp.undo_values(item) from public.transactions item
  where item.id = (select item_id from undo_cases where label = 'exclude')),
  (select previous_values from undo_cases where label = 'exclude'), 'exclude Undo restores the previous type and spending category');
select is((select pg_temp.undo_source(item) from public.transactions item
  where item.id = (select item_id from undo_cases where label = 'exclude')),
  (select source_values from undo_cases where label = 'exclude'), 'exclude Undo preserves import provenance');

update public.transactions set description = 'Changed after the receipt'
  where id = (select item_id from undo_cases where label = 'stale');
select throws_ok($$select * from public.restore_transaction_from_undo(
  'f1000000-0000-4000-8000-000000000001', (select action_id from undo_cases where label = 'stale'))$$,
  '55000', 'This record changed. Reload it and try again.', 'a stale record version cannot be undone');
select ok((select consumed_at is null from public.agent_action_states
  where action_id = (select action_id from undo_cases where label = 'stale')), 'a stale failure leaves the receipt unused');
update public.agent_action_states set created_at = now() - interval '20 minutes',
  expires_at = now() - interval '10 minutes' where action_id = (select action_id from undo_cases where label = 'expired');
select throws_ok($$select * from public.restore_transaction_from_undo(
  'f1000000-0000-4000-8000-000000000001', (select action_id from undo_cases where label = 'expired'))$$,
  '55000', 'That change can no longer be undone.', 'an expired receipt cannot restore a transaction');
update public.agent_action_states set consumed_at = clock_timestamp()
  where action_id = (select action_id from undo_cases where label = 'consumed');
select throws_ok($$select * from public.restore_transaction_from_undo(
  'f1000000-0000-4000-8000-000000000001', (select action_id from undo_cases where label = 'consumed'))$$,
  '55000', 'That change can no longer be undone.', 'an already consumed receipt cannot restore a transaction');
select throws_ok($$select * from public.restore_transaction_from_undo(
  'f1000000-0000-4000-8000-000000000002', (select action_id from undo_cases where label = 'guard'))$$,
  'P0002', 'That change was not found.', 'another user cannot restore the owner''s receipt');
select ok((select consumed_at is null from public.agent_action_states
  where action_id = (select action_id from undo_cases where label = 'guard')), 'cross-owner and tampered attempts leave the receipt unused');
insert into public.agent_action_logs(id, user_id, channel, event_type, tool_name,
  permission_tier, result_status, resource_type, resource_id, undo_expires_at)
select 'f1300000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002',
  'web', 'tool_call', 'confirm_pending', 'T1', 'succeeded', 'transaction', item_id,
  now() + interval '10 minutes' from undo_cases where label = 'guard';
insert into public.agent_action_states(action_id, user_id, purpose, operation_state, expires_at)
select 'f1300000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002',
  'undo', operation_state, now() + interval '10 minutes' from public.agent_action_states
  where action_id = (select action_id from undo_cases where label = 'guard');
select throws_ok($$select * from public.restore_transaction_from_undo(
  'f1000000-0000-4000-8000-000000000002', 'f1300000-0000-4000-8000-000000000001')$$,
  'P0002', 'That transaction was not found.', 'even an owned receipt cannot point to another user''s transaction');
select ok((select consumed_at is null from public.agent_action_states
  where action_id = 'f1300000-0000-4000-8000-000000000001'), 'a cross-owner record reference cannot consume a receipt');
select is((select result_status from public.agent_action_logs
  where id = (select action_id from undo_cases where label = 'confirm')), 'reversed', 'successful Undo updates its audit status');

-- A related row can become unavailable between the original change and Undo.
-- This receipt restores confirmed values, forcing the normal active-account guard.
update public.agent_action_states set operation_state = jsonb_set(
  jsonb_set(operation_state, '{reviewStatus}', '"confirmed"'), '{values}',
  (select jsonb_set(pg_temp.undo_values(item), '{financialAccountId}',
      '"f1100000-0000-4000-8000-000000000002"') from public.transactions item
    where item.id = (select item_id from undo_cases where label = 'constraint')))
  where action_id = (select action_id from undo_cases where label = 'constraint');
select throws_ok($$select * from public.restore_transaction_from_undo(
  'f1000000-0000-4000-8000-000000000001', (select action_id from undo_cases where label = 'constraint'))$$,
  '23514', 'Confirmed transactions require active Financial Accounts.', 'normal restoration constraints still apply');
select ok((select consumed_at is null from public.agent_action_states
  where action_id = (select action_id from undo_cases where label = 'constraint')), 'a constraint failure rolls back receipt consumption');
select is((select review_status from public.transactions
  where id = (select item_id from undo_cases where label = 'constraint')), 'confirmed', 'a failed restoration leaves the current record intact');
select is((select flow_direction from public.restore_transaction_from_undo(
  'f1000000-0000-4000-8000-000000000001',
  (select action_id from undo_cases where label = 'legacy'))), 'out',
  'legacy expense receipts restore the known outgoing direction without a new field');
select is((select flow_direction from public.restore_transaction_from_undo(
  'f1000000-0000-4000-8000-000000000001',
  (select action_id from undo_cases where label = 'incoming'))), 'in',
  'Undo restores an incoming exclusion direction after confirming it as an expense');
select is(current_setting('monara.restore_transaction_action_id', true), '', 'receipt context does not leak beyond an Undo operation');
reset role;
select * from finish();
rollback;
