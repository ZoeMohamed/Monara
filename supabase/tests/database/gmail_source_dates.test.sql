begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(12);
set local role service_role;

update public.financial_accounts set institution_key = 'BCA_CC',
  gmail_connection_id = '12000000-0000-4000-8000-000000000001'
  where id = '11000000-0000-4000-8000-000000000001';
create temporary table undated_message on commit drop as
select * from public.claim_gmail_message(
  '12000000-0000-4000-8000-000000000001', 'synthetic-no-source-date', now());
create temporary table undated_import on commit drop as
select * from public.record_gmail_extraction(
  (select processed_message_id from undated_message), 'transactions',
  '[{"kind":"expense","flowDirection":"out","merchantName":"Synthetic undated cafe",
     "money":{"amountMinor":"25000","currency":"IDR"},"occurredOn":null,
     "accountLastFour":"4242","confidence":0.99}]'::jsonb,
  true, 'BCA_CC');
select is((select occurred_on from public.transactions where id =
  (select transaction_ids[1] from undated_import)), null::date,
  'delivery and insertion time do not become a transaction date');
select is((select review_status from public.transactions where id =
  (select transaction_ids[1] from undated_import)), 'pending',
  'an authenticated high-confidence undated expense needs review');
select ok((select not gmail_auto_confirm_pending from public.transactions where id =
  (select transaction_ids[1] from undated_import)),
  'category automation cannot make an undated expense eligible');
select is((select financial_account_id from public.transactions where id =
  (select transaction_ids[1] from undated_import)), '11000000-0000-4000-8000-000000000001'::uuid,
  'an unknown date retains a valid owned source account');
select public.set_imported_category(
  (select transaction_ids[1] from undated_import),
  (select id from public.categories where user_id = '10000000-0000-4000-8000-000000000001'
    and slug = 'resto-cafe'), 'expense', 0.99);
select is((select review_status from public.transactions where id =
  (select transaction_ids[1] from undated_import)), 'pending',
  'classification leaves an undated transaction pending');
select throws_ok($$update public.transactions set review_status = 'confirmed'
  where id = (select transaction_ids[1] from undated_import)$$, '23514', null,
  'direct writes cannot confirm an undated expense');
select throws_ok($$update public.transactions set review_status = 'confirmed',
  transaction_type = 'exclusion', category_id = null
  where id = (select transaction_ids[1] from undated_import)$$, '23514', null,
  'undated exclusions need an actual date too');

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
