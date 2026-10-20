begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(15);
set local role service_role;

update public.financial_accounts set institution_key = 'BCA_CC',
  gmail_connection_id = '12000000-0000-4000-8000-000000000001'
  where id = '11000000-0000-4000-8000-000000000001';
create temporary table undated_message on commit drop as
select * from public.claim_gmail_message(
  '12000000-0000-4000-8000-000000000001', 'synthetic-no-source-date',
  '2026-10-16T18:30:00Z');
create temporary table undated_import on commit drop as
select * from public.record_gmail_extraction(
  (select processed_message_id from undated_message), 'transactions',
  '[{"kind":"expense","flowDirection":"out","merchantName":"Synthetic undated cafe",
     "money":{"amountMinor":"25000","currency":"IDR"},"occurredOn":null,
     "accountLastFour":"4242","confidence":0.99}]'::jsonb,
  true, 'BCA_CC');
select is((select occurred_on from public.transactions where id =
  (select transaction_ids[1] from undated_import)), '2026-10-17'::date,
  'an undated Gmail import uses its source email arrival day in Jakarta');
select is((select review_status from public.transactions where id =
  (select transaction_ids[1] from undated_import)), 'pending',
  'an import still waits for its classification before confirmation');
select ok((select gmail_auto_confirm_pending from public.transactions where id =
  (select transaction_ids[1] from undated_import)),
  'the source email arrival date satisfies extraction date eligibility');
select is((select financial_account_id from public.transactions where id =
  (select transaction_ids[1] from undated_import)), '11000000-0000-4000-8000-000000000001'::uuid,
  'a fallback date retains the valid owned source account');
select public.set_imported_category(
  (select transaction_ids[1] from undated_import),
  (select id from public.categories where user_id = '10000000-0000-4000-8000-000000000001'
    and slug = 'resto-cafe'), 'expense', 0.99);
select is((select review_status from public.transactions where id =
  (select transaction_ids[1] from undated_import)), 'confirmed',
  'a complete confident Gmail transaction confirms with the source email arrival date');

create temporary table directionless_message on commit drop as
select * from public.claim_gmail_message(
  '12000000-0000-4000-8000-000000000001', 'synthetic-no-cash-direction',
  '2026-10-16T18:30:00Z');
create temporary table directionless_import on commit drop as
select * from public.record_gmail_extraction(
  (select processed_message_id from directionless_message), 'transactions',
  '[{"kind":null,"flowDirection":null,"merchantName":"Synthetic directionless payment",
     "money":{"amountMinor":"25000","currency":"IDR"},"occurredOn":null,
     "accountLastFour":"4242","confidence":0.99}]'::jsonb,
  true, 'BCA_CC');
select public.set_imported_category(
  (select transaction_ids[1] from directionless_import), null::uuid, null::text, 0.99);
select is((select occurred_on from public.transactions where id =
  (select transaction_ids[1] from directionless_import)), '2026-10-17'::date,
  'an incomplete Gmail transaction also keeps the source email arrival date');
select is((select transaction_type from public.transactions where id =
  (select transaction_ids[1] from directionless_import)), 'expense',
  'a missing cash direction can keep the latest Expense Misc fallback');
select is((select flow_direction from public.transactions where id =
  (select transaction_ids[1] from directionless_import)), null::text,
  'Expense Misc never manufactures a missing Gmail cash direction');
select is((select review_status from public.transactions where id =
  (select transaction_ids[1] from directionless_import)), 'pending',
  'the source email arrival date does not bypass missing cash direction review');
select is((select gmail_classification_status from public.transactions where id =
  (select transaction_ids[1] from directionless_import)), 'needs_review',
  'an incomplete import terminates classification instead of keeping progress running');

insert into public.transactions(id, user_id, client_request_id, source_type,
  review_status, transaction_type, flow_direction, occurred_on, merchant_name,
  financial_account_id)
values ('13990000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  'synthetic-undated-receipt', 'whatsapp_receipt', 'pending', null, 'in', null, 'Synthetic receipt',
  '11000000-0000-4000-8000-000000000001'),
  ('13990000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
  'synthetic-undated-manual', 'manual_form', 'pending', 'expense', 'out', null, 'Synthetic draft',
  '11000000-0000-4000-8000-000000000001');
select is((select occurred_on from public.transactions where id =
  '13990000-0000-4000-8000-000000000001'), null::date,
  'a receipt without a readable date stays unknown');
select is((select flow_direction from public.transactions where id =
  '13990000-0000-4000-8000-000000000001'), 'in',
  'an unknown kind retains its explicit cash direction');
select is((select occurred_on from public.transactions where id =
  '13990000-0000-4000-8000-000000000002'), null::date,
  'manual pending drafts do not receive an invented date');
update public.transactions set occurred_on = '2026-10-15' where id =
  '13990000-0000-4000-8000-000000000002';
update public.transactions set occurred_on = null where id =
  '13990000-0000-4000-8000-000000000002';
select is((select occurred_on from public.transactions where id =
  '13990000-0000-4000-8000-000000000002'), null::date,
  'clearing an uncertain draft date does not restore the old value');
select throws_ok($$update public.transactions set transaction_type = 'income', review_status = 'confirmed'
  where id = '13990000-0000-4000-8000-000000000001'$$, '23514', null,
  'undated incoming receipts cannot be confirmed through a direct write');
reset role;
select * from finish();
rollback;
