begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(41);
set local role service_role;

insert into public.fx_reference_rates(requested_on,rate_date,rate)
values ('2026-10-11','2026-10-09',16500.123456);
insert into public.transactions(id,user_id,client_request_id,source_type,review_status,
  transaction_type,merchant_name,amount,currency,occurred_on,financial_account_id,category_id)
values ('cf000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'synthetic-usd-cents','manual_form','confirmed','expense','Synthetic USD subscription',1999,'USD','2026-10-11',
  '11000000-0000-4000-8000-000000000001',
  (select id from public.categories where user_id='10000000-0000-4000-8000-000000000001' and slug='resto-cafe'));
select is((select amount from public.transactions where id='cf000000-0000-4000-8000-000000000001'),1999::numeric,'original USD cents remain exact');
select is((select idr_amount from public.transactions where id='cf000000-0000-4000-8000-000000000001'),329837::numeric,'USD uses exact persisted whole-rupiah rounding');
select is((select fx_snapshot->>'rateDate' from public.transactions where id='cf000000-0000-4000-8000-000000000001'),'2026-10-09','weekend rate retains the actual reference day');
select is((select currency from public.financial_accounts where id='11000000-0000-4000-8000-000000000001'),'IDR','USD purchase does not need a USD bank account');
update public.transactions set idr_amount=1,fx_snapshot='{}'::jsonb,merchant_name='Synthetic renamed subscription'
where id='cf000000-0000-4000-8000-000000000001';
select is((select idr_amount from public.transactions where id='cf000000-0000-4000-8000-000000000001'),329837::numeric,'unrelated edits cannot forge reporting money');
select is((select fx_snapshot->>'rate' from public.transactions where id='cf000000-0000-4000-8000-000000000001'),'16500.123456','unrelated edits preserve the rate snapshot');

update public.financial_accounts set institution_key='BCA_CC',gmail_connection_id='12000000-0000-4000-8000-000000000001'
where id='11000000-0000-4000-8000-000000000001';
create temporary table fx_message on commit drop as select * from public.claim_gmail_message(
  '12000000-0000-4000-8000-000000000001','synthetic-usd-no-rate','2026-10-12T06:00:00Z');
create temporary table fx_import on commit drop as select * from public.record_gmail_extraction(
  (select processed_message_id from fx_message),'transactions',
  '[{"kind":"expense","flowDirection":"out","merchantName":"Synthetic USD payment","money":{"amountMinor":"2000","currency":"USD"},"occurredOn":"2026-10-12","accountLastFour":"4242","confidence":0.99}]',true,'BCA_CC');
select is((select amount from public.transactions where id=(select transaction_ids[1] from fx_import)),2000::numeric,'unavailable FX still stores the original USD transaction');
select is((select idr_amount from public.transactions where id=(select transaction_ids[1] from fx_import)),null::numeric,'unavailable conversion is null, never zero or a fixed rate');
select is((select gmail_classification_status from public.transactions where id=(select transaction_ids[1] from fx_import)),'pending','recording USD does not settle classification prematurely');
select public.set_imported_category((select transaction_ids[1] from fx_import),
  (select id from public.categories where user_id='10000000-0000-4000-8000-000000000001' and slug='resto-cafe'),'expense',0.99);
select is((select review_status from public.transactions where id=(select transaction_ids[1] from fx_import)),'pending','unconverted expense stays out of confirmed totals');
select is((select gmail_classification_status from public.transactions where id=(select transaction_ids[1] from fx_import)),'needs_review','unavailable FX does not keep import classification running');
select ok((select fx_auto_confirm_eligible from public.transactions where id=(select transaction_ids[1] from fx_import)),'recovery retains qualified automatic-confirmation eligibility');
create temporary table fx_jobs on commit drop as select * from public.claim_transaction_fx_jobs(10);
select is((select count(*) from fx_jobs),1::bigint,'a durable job is discoverable after classification finishes');
insert into public.fx_reference_rates(requested_on,rate_date,rate) values ('2026-10-12','2026-10-12',16499.9);
select ok((select applied from public.apply_transaction_fx((select transaction_id from fx_jobs),(select user_id from fx_jobs),(select expected_updated_at from fx_jobs))),'first valid conversion applies with the exact claimed version');
select is((select idr_amount from public.transactions where id=(select transaction_ids[1] from fx_import)),329998::numeric,'recovery persists the correctly converted IDR amount');
select is((select review_status from public.transactions where id=(select transaction_ids[1] from fx_import)),'confirmed','qualified Gmail import confirms after conversion');
select is((select applied from public.apply_transaction_fx((select transaction_id from fx_jobs),(select user_id from fx_jobs),(select expected_updated_at from fx_jobs))),false,'retry cannot overwrite an already valued transaction');
select ok((select already_finished from public.record_gmail_extraction((select processed_message_id from fx_message),'transactions',
  '[{"kind":"expense","money":{"amountMinor":"9999","currency":"USD"},"occurredOn":"2026-10-12"}]',true,'BCA_CC')),'duplicate email processing remains finished');
select is((select amount from public.transactions where id=(select transaction_ids[1] from fx_import)),2000::numeric,'a duplicate extraction cannot rewrite original money');

create temporary table original_fx on commit drop as select * from public.transactions where id='cf000000-0000-4000-8000-000000000001';
update public.transactions set amount=2500,occurred_on='2026-10-13' where id='cf000000-0000-4000-8000-000000000001';
select is((select review_status from public.transactions where id='cf000000-0000-4000-8000-000000000001'),'pending','an edited USD expense with unavailable replacement FX becomes pending');
select is((select idr_amount from public.transactions where id='cf000000-0000-4000-8000-000000000001'),null::numeric,'amount/date edits cannot retain stale IDR totals');
insert into public.agent_action_logs(id,user_id,channel,event_type,tool_name,permission_tier,result_status,resource_type,resource_id,undo_expires_at)
values ('cf100000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','web','tool_call','edit_transaction','T1','succeeded','transaction','cf000000-0000-4000-8000-000000000001',now()+interval '10 minutes');
insert into public.agent_action_states(action_id,user_id,purpose,operation_state,expires_at)
select 'cf100000-0000-4000-8000-000000000001',item.user_id,'undo',jsonb_build_object(
  'operation','restore_transaction','expectedUpdatedAt',current_item.updated_at,'reviewStatus',item.review_status,
  'idrMoney',jsonb_build_object('amountMinor',item.idr_amount::text,'currency','IDR'),'fxSnapshot',item.fx_snapshot,
  'values',jsonb_build_object('kind',item.transaction_type,'flowDirection',item.flow_direction,'merchantName',item.merchant_name,
    'money',jsonb_build_object('amountMinor',item.amount::text,'currency',item.currency),'occurredOn',item.occurred_on,
    'occurredTime',item.occurred_time,'description',item.description,'location',item.location,'accountHint',item.account_hint,
    'categoryId',item.category_id,'financialAccountId',item.financial_account_id)),now()+interval '10 minutes'
from original_fx item join public.transactions current_item on current_item.id=item.id;
select public.restore_transaction_from_undo('10000000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000001');
select is((select amount from public.transactions where id='cf000000-0000-4000-8000-000000000001'),1999::numeric,'undo restores original USD cents');
select is((select idr_amount from public.transactions where id='cf000000-0000-4000-8000-000000000001'),329837::numeric,'undo restores the previous IDR reporting amount');
select is((select fx_snapshot from public.transactions where id='cf000000-0000-4000-8000-000000000001'),(select fx_snapshot from original_fx),'undo restores the exact saved reference snapshot');
select ok(not has_table_privilege('authenticated','public.fx_reference_rates','INSERT'),'authenticated clients cannot seed arbitrary FX rates');
select ok(not has_function_privilege('authenticated','public.apply_transaction_fx(uuid,uuid,timestamptz)','EXECUTE'),'recovery is unavailable to browser callers');
select ok(not has_function_privilege('anon','public.claim_transaction_fx_jobs(integer)','EXECUTE'),'anonymous callers cannot claim private transactions');

create temporary table inferred_message on commit drop as select * from public.claim_gmail_message(
  '12000000-0000-4000-8000-000000000001','synthetic-default-currency','2026-10-12T06:00:00Z');
create temporary table inferred_import on commit drop as select * from public.record_gmail_extraction(
  (select processed_message_id from inferred_message),'transactions',
  '[{"kind":"expense","flowDirection":"out","merchantName":"Synthetic unmarked payment","money":{"amountMinor":"20","currency":"IDR"},"currencyInferred":true,"occurredOn":"2026-10-12","accountLastFour":"4242","confidence":0.99}]',true,'BCA_CC');
select public.set_imported_category((select transaction_ids[1] from inferred_import),
  (select id from public.categories where user_id='10000000-0000-4000-8000-000000000001' and slug='resto-cafe'),'expense',0.99);
select is((select review_status from public.transactions where id=(select transaction_ids[1] from inferred_import)),'pending','a currency default stays pending despite high model confidence');
select is((select idr_amount from public.transactions where id=(select transaction_ids[1] from inferred_import)),20::numeric,'unmarked amount retains its IDR fallback value');

insert into public.transactions(id,user_id,client_request_id,source_type,review_status,transaction_type,merchant_name,amount,currency,occurred_on,financial_account_id)
values ('cf000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','synthetic-fx-edit-race','manual_form','pending','expense','Synthetic race',3000,'USD','2026-10-14','11000000-0000-4000-8000-000000000001');
create temporary table race_job on commit drop as select * from public.claim_transaction_fx_jobs(10);
update public.transactions set amount=4000 where id='cf000000-0000-4000-8000-000000000003';
insert into public.fx_reference_rates(requested_on,rate_date,rate) values ('2026-10-14','2026-10-14',16500);
select is((select applied from public.apply_transaction_fx((select transaction_id from race_job),(select user_id from race_job),(select expected_updated_at from race_job))),false,'a stale provider result cannot overwrite a newer amount edit');
select is((select amount from public.transactions where id='cf000000-0000-4000-8000-000000000003'),4000::numeric,'the newer USD edit is preserved');
select is((select idr_amount from public.transactions where id='cf000000-0000-4000-8000-000000000003'),null::numeric,'stale recovery does not install a conversion for different source facts');
create temporary table current_race_job on commit drop as select * from public.claim_transaction_fx_jobs(10);
select ok((select applied from public.apply_transaction_fx((select transaction_id from current_race_job),(select user_id from current_race_job),(select expected_updated_at from current_race_job))),'a new lease values the current source facts');
select is((select idr_amount from public.transactions where id='cf000000-0000-4000-8000-000000000003'),660000::numeric,'replacement recovery uses the new USD amount');
select is((select review_status from public.transactions where id='cf000000-0000-4000-8000-000000000003'),'pending','conversion alone never confirms a manual pending draft');
select is((select applied from public.apply_transaction_fx('cf000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002',(select updated_at from public.transactions where id='cf000000-0000-4000-8000-000000000003'))),false,'conversion recovery cannot cross ownership');


insert into public.transactions(id,user_id,client_request_id,source_type,review_status,transaction_type,merchant_name,amount,currency,occurred_on,financial_account_id)
values ('cf000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','synthetic-explicit-fx-retry','manual_form','pending','expense','Synthetic confirmation retry',2000,'USD','2026-10-15','11000000-0000-4000-8000-000000000001');
insert into public.fx_reference_rates(requested_on,rate_date,rate) values ('2026-10-15','2026-10-15',16500);
update public.transactions set review_status='confirmed' where id='cf000000-0000-4000-8000-000000000004';
select is((select idr_amount from public.transactions where id='cf000000-0000-4000-8000-000000000004'),330000::numeric,'explicit confirmation can apply a newly available rate without changing original source facts');
select is((select review_status from public.transactions where id='cf000000-0000-4000-8000-000000000004'),'confirmed','an explicit confirmation succeeds after FX recovers');


insert into public.transactions(id,user_id,client_request_id,source_type,review_status,transaction_type,merchant_name,amount,currency,occurred_on,financial_account_id)
values ('cf000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','synthetic-overflow-fx','manual_form','confirmed','expense','Synthetic oversized original amount',99999999999999999999,'USD','2026-10-11','11000000-0000-4000-8000-000000000001');
select is((select review_status from public.transactions where id='cf000000-0000-4000-8000-000000000005'),'pending','a reporting-range overflow saves the original transaction for review');
select is((select idr_amount from public.transactions where id='cf000000-0000-4000-8000-000000000005'),null::numeric,'an out-of-range conversion never corrupts reporting money');
update public.transactions set fx_retry_count=5 where id='cf000000-0000-4000-8000-000000000005';
select is((select count(*) from public.claim_transaction_fx_jobs(10)),0::bigint,'five attempts is a durable limit, with no endless recovery loop');

select * from finish();
rollback;
