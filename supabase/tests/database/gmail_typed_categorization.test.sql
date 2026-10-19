begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(50);
set local role service_role;
update public.financial_accounts set institution_key='BCA_CC',
  gmail_connection_id='12000000-0000-4000-8000-000000000001'
where id='11000000-0000-4000-8000-000000000001';

create function pg_temp.category(p_slug text,p_user uuid default '10000000-0000-4000-8000-000000000001')
returns uuid language sql as $$ select id from public.categories where user_id=p_user and slug=p_slug $$;
create function pg_temp.import(p_name text,p_changes jsonb default '{}',p_verified boolean default true)
returns uuid language plpgsql as $$
declare v_claim uuid; v_ids uuid[];
begin
  select processed_message_id into v_claim from public.claim_gmail_message(
    '12000000-0000-4000-8000-000000000001',p_name,statement_timestamp());
  select transaction_ids into v_ids from public.record_gmail_extraction(v_claim,'transactions',
    jsonb_build_array('{"kind":"expense","flowDirection":"out","merchantName":"Synthetic business","money":{"amountMinor":"25000","currency":"IDR"},"occurredOn":"2026-10-19","occurredTime":null,"description":"Synthetic payment","location":null,"accountHint":null,"accountLastFour":"4242","confidence":0.99,"counterpartyName":"Synthetic business","counterpartyType":"business","isTransfer":false,"internalTransfer":false}'::jsonb || p_changes),
    p_verified,'BCA_CC');
  return v_ids[1];
end; $$;
create temporary table examples(name text primary key,id uuid) on commit drop;
insert into examples values('expense',pg_temp.import('typed-expense')),
 ('income',pg_temp.import('typed-income','{"kind":"income","flowDirection":"in"}')),
 ('unknown-date',pg_temp.import('typed-date','{"occurredOn":null}')),
 ('unverified',pg_temp.import('typed-unverified','{}',false)),
 ('low-confidence',pg_temp.import('typed-low','{"confidence":0.94}')),
 ('edited',pg_temp.import('typed-edit')),
 ('duplicate',pg_temp.import('typed-expense')),
 ('internal',pg_temp.import('typed-internal','{"kind":"exclusion","counterpartyName":"Bpk. Daffa Praya","counterpartyType":"person","isTransfer":true,"internalTransfer":true}')),
 ('partial-name',pg_temp.import('typed-partial','{"counterpartyName":"Daffa","counterpartyType":"person","isTransfer":true,"internalTransfer":true}')),
 ('business-name',pg_temp.import('typed-business','{"counterpartyName":"Daffa Praya","counterpartyType":"business","isTransfer":true,"internalTransfer":true}')),
 ('no-transfer',pg_temp.import('typed-no-transfer','{"counterpartyName":"Daffa Praya","counterpartyType":"person","isTransfer":false,"internalTransfer":true}')),
 ('no-direction',pg_temp.import('typed-no-direction','{"kind":"exclusion","flowDirection":null,"counterpartyName":"Daffa Praya","counterpartyType":"person","isTransfer":true,"internalTransfer":true}')),
 ('other-exclusion',pg_temp.import('typed-other-exclusion')),
 ('no-choice',pg_temp.import('typed-no-choice'));
update public.profiles set full_name='Daffa Praya' where id='10000000-0000-4000-8000-000000000001';

select is((select count(*) from public.categories where user_id='10000000-0000-4000-8000-000000000001' and kind='income' and is_default),6::bigint,'six income defaults');
select is((select kind from public.categories where id=pg_temp.category('internal')),'exclusion','Internal has stable exclusion semantics');
select throws_ok($$update public.categories set kind='income' where id=pg_temp.category('resto-cafe')$$,'23514',null,'category kind immutable');
select is((select id from examples where name='expense'),(select id from examples where name='duplicate'),'retry remains idempotent');
select is((select review_status from public.transactions where id=(select id from examples where name='expense')),'pending','new import waits for classification even with merchant history');
select is((select occurred_on from public.transactions where id=(select id from examples where name='unknown-date')),null::date,'missing extracted date stays unknown');
select is(private.normalized_holder_name('BPK. Ｄａｆｆａ   Praya'),'daffa praya','title spacing and Unicode normalization match');
select isnt(private.normalized_holder_name('Ann A'),private.normalized_holder_name('Anna'),'word boundaries cannot collide');
select is((select internal_transfer from public.imported_transaction_for_category((select id from examples where name='internal'))),true,'server verifies full holder match');
select is((select internal_transfer from public.imported_transaction_for_category((select id from examples where name='business-name'))),false,'business identity is not holder evidence');
select throws_ok($$select * from public.set_imported_category((select id from examples where name='expense'),pg_temp.category('salary'),'expense',0.99)$$,'22023',null,'cannot attach income category to expense');
select throws_ok($$select * from public.set_imported_category((select id from examples where name='expense'),pg_temp.category('resto-cafe','10000000-0000-4000-8000-000000000002'),'expense',0.99)$$,'22023',null,'cannot attach another owner category');
select throws_ok($$select * from public.set_imported_category((select id from examples where name='expense'),pg_temp.category('salary'),'income',0.99)$$,'22023',null,'classifier cannot reverse cash direction');
select public.set_imported_category((select id from examples where name='expense'),pg_temp.category('resto-cafe'),'expense',0.99);
select is((select review_status from public.transactions where id=(select id from examples where name='expense')),'confirmed','qualifying expense confirms after classification');
-- A high-confidence expense suggestion is insufficient for ambiguous personal transfers.
insert into examples values
 ('missing-holder-transfer',pg_temp.import('typed-missing-holder','{"counterpartyName":"Daffa Praya","counterpartyType":"person","isTransfer":true}')),
 ('short-name-transfer',pg_temp.import('typed-short-name-expense','{"counterpartyName":"Daffa","counterpartyType":"person","isTransfer":true}')),
 ('unknown-transfer',pg_temp.import('typed-unknown-transfer','{"counterpartyName":null,"counterpartyType":"unknown","isTransfer":true}')),
 ('business-transfer',pg_temp.import('typed-business-transfer','{"counterpartyType":"business","isTransfer":true}'));
update public.profiles set full_name=null where id='10000000-0000-4000-8000-000000000001';
select public.set_imported_category((select id from examples where name='missing-holder-transfer'),pg_temp.category('resto-cafe'),'expense',0.99);
select is((select row(review_status,category_id)::text from public.transactions where id=(select id from examples where name='missing-holder-transfer')),
 row('pending',pg_temp.category('resto-cafe'))::text,'personal transfer with missing holder keeps suggestion pending');
update public.profiles set full_name='Daffa Praya' where id='10000000-0000-4000-8000-000000000001';
select public.set_imported_category((select id from examples where name='short-name-transfer'),pg_temp.category('resto-cafe'),'expense',0.99);
select is((select row(review_status,category_id)::text from public.transactions where id=(select id from examples where name='short-name-transfer')),
 row('pending',pg_temp.category('resto-cafe'))::text,'short-name transfer cannot auto-confirm an expense suggestion');
select public.set_imported_category((select id from examples where name='unknown-transfer'),pg_temp.category('resto-cafe'),'expense',0.99);
select is((select review_status from public.transactions where id=(select id from examples where name='unknown-transfer')),'pending','unknown transfer counterparty requires review');
select public.set_imported_category((select id from examples where name='business-transfer'),pg_temp.category('resto-cafe'),'expense',0.99);
select is((select review_status from public.transactions where id=(select id from examples where name='business-transfer')),'confirmed','clear business transfer can qualify as an expense');
select public.set_imported_category((select id from examples where name='income'),pg_temp.category('salary'),'income',0.99);
select is((select review_status from public.transactions where id=(select id from examples where name='income')),'confirmed','qualifying income confirms');
update public.categories set name='My own transfers' where id=pg_temp.category('internal');
select public.set_imported_category((select id from examples where name='internal'),pg_temp.category('internal'),'exclusion',0.99);
select is((select row(transaction_type,flow_direction,review_status)::text from public.transactions where id=(select id from examples where name='internal')),row('exclusion','out','confirmed')::text,'renamed canonical Internal confirms and preserves outflow');
select is((select amount from public.transactions where id=(select id from examples where name='internal')),25000::numeric,'classification preserves amount');
select ok((select financial_account_id is not null from public.transactions where id=(select id from examples where name='internal')),'Internal retains mapped source account');
select public.set_imported_category((select id from examples where name='partial-name'),pg_temp.category('internal'),'exclusion',1);
select is((select row(transaction_type,category_id,gmail_classification_status)::text from public.transactions where id=(select id from examples where name='partial-name')),row('expense',null::uuid,'needs_review')::text,'partial name cannot silently exclude');
select public.set_imported_category((select id from examples where name='business-name'),pg_temp.category('internal'),'exclusion',1);
select is((select category_id from public.transactions where id=(select id from examples where name='business-name')),null::uuid,'business name cannot become Internal');
select public.set_imported_category((select id from examples where name='no-transfer'),pg_temp.category('internal'),'exclusion',1);
select is((select category_id from public.transactions where id=(select id from examples where name='no-transfer')),null::uuid,'boolean internalTransfer alone is insufficient');
select public.set_imported_category((select id from examples where name='no-direction'),pg_temp.category('internal'),'exclusion',1);
select is((select review_status from public.transactions where id=(select id from examples where name='no-direction')),'pending','missing cash direction prevents automatic Internal');
select public.set_imported_category((select id from examples where name='other-exclusion'),pg_temp.category('repayment'),'exclusion',1);
select is((select review_status from public.transactions where id=(select id from examples where name='other-exclusion')),'pending','other exclusions always need review');
select public.set_imported_category((select id from examples where name='unknown-date'),pg_temp.category('resto-cafe'),'expense',1);
select is((select review_status from public.transactions where id=(select id from examples where name='unknown-date')),'pending','missing original date never auto-confirms');
select public.set_imported_category((select id from examples where name='unverified'),pg_temp.category('resto-cafe'),'expense',1);
select is((select review_status from public.transactions where id=(select id from examples where name='unverified')),'pending','unauthenticated sender never auto-confirms');
select public.set_imported_category((select id from examples where name='low-confidence'),pg_temp.category('resto-cafe'),'expense',1);
select is((select review_status from public.transactions where id=(select id from examples where name='low-confidence')),'pending','low extraction confidence never auto-confirms');
update public.transactions set description='User correction' where id=(select id from examples where name='edited');
select is((select applied from public.set_imported_category((select id from examples where name='edited'),pg_temp.category('resto-cafe'),'expense',1)),false,'atomic apply protects User edit');
select is((select description from public.transactions where id=(select id from examples where name='edited')),'User correction','User correction survives background work');
select public.set_imported_category((select id from examples where name='no-choice'),null::uuid,null::text,null::numeric);
select is((select gmail_classification_status from public.transactions where id=(select id from examples where name='no-choice')),'needs_review','no choice is terminal review');
select public.start_gmail_sync('12000000-0000-4000-8000-000000000001');
update public.gmail_connections set sync_requested_at=statement_timestamp()-interval '1 day' where id='12000000-0000-4000-8000-000000000001';
select public.mark_gmail_connection_synced('12000000-0000-4000-8000-000000000001',statement_timestamp());
select is((select state from public.gmail_sync_statuses('10000000-0000-4000-8000-000000000001') where connection_id='12000000-0000-4000-8000-000000000001'),'completed','terminal review does not strand sync');
select ok((select needs_review>=8 from public.gmail_sync_statuses('10000000-0000-4000-8000-000000000001') where connection_id='12000000-0000-4000-8000-000000000001'),'terminal pending outcomes appear in review count');
select throws_ok($$update public.budgets set category_id=pg_temp.category('salary') where user_id='10000000-0000-4000-8000-000000000001'$$,'23514',null,'budget category must be expense');
select throws_ok($$update public.transactions set category_id=pg_temp.category('salary') where id=(select id from examples where name='expense')$$,'23514',null,'manual transaction write also enforces category kind');
-- A provider delay extends only an active owned processing target, with a hard cap.
insert into public.gmail_connections(id,user_id,gmail_address,composio_connected_account_id,status,
 sync_state,sync_requested_at,sync_updated_at)
values('12900000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 'retry@test.monara.local','synthetic-retry-account','active','listed',
 statement_timestamp()-interval '1 day',statement_timestamp()-interval '30 minutes');
select public.claim_gmail_message('12900000-0000-4000-8000-000000000001','retry-pending',statement_timestamp());
update public.processed_gmail_messages set created_at=statement_timestamp()-interval '30 minutes'
 where gmail_connection_id='12900000-0000-4000-8000-000000000001';
update public.gmail_connections set sync_updated_at=statement_timestamp()-interval '30 minutes'
 where id='12900000-0000-4000-8000-000000000001';
select is((select error from public.gmail_sync_statuses('10000000-0000-4000-8000-000000000001')
 where connection_id='12900000-0000-4000-8000-000000000001'),'stalled','expired real progress is stalled');
select throws_ok($$select public.report_gmail_processing_retry(901,'12900000-0000-4000-8000-000000000001')$$,'22023',null,'retry wait cannot exceed provider delay cap');
select throws_ok($$select public.report_gmail_processing_retry(900,'12900000-0000-4000-8000-000000000001',(select id from examples where name='expense'))$$,'22023',null,'retry target must be exclusive');
select public.report_gmail_processing_retry(900,'12900000-0000-4000-8000-000000000001');
select is((select state from public.gmail_sync_statuses('10000000-0000-4000-8000-000000000001')
 where connection_id='12900000-0000-4000-8000-000000000001'),'running','bounded provider wait is not falsely stalled');
select public.report_gmail_processing_retry(0,'12900000-0000-4000-8000-000000000001');
select ok((select sync_retry_until>=statement_timestamp()+interval '899 seconds' from public.gmail_connections
 where id='12900000-0000-4000-8000-000000000001'),'shorter concurrent wait cannot erase longer deadline');
select public.start_gmail_sync('12900000-0000-4000-8000-000000000001');
select is((select sync_retry_until from public.gmail_connections where id='12900000-0000-4000-8000-000000000001'),null::timestamptz,'new sync clears old retry deadline');
-- Pending unknown types may retain an owned hint, including an undo restore.
insert into public.transactions(id,user_id,client_request_id,source_type,transaction_type,
 review_status,merchant_name,amount,currency,occurred_on,financial_account_id,category_id)
values('13900000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 'unknown-category-hint','manual_form',null,'pending','Synthetic hint',1000,'IDR','2026-10-19',
 '11000000-0000-4000-8000-000000000001',pg_temp.category('salary'));
select is((select transaction_type from public.transactions where id='13900000-0000-4000-8000-000000000001'),null::text,'pending category hint does not guess transaction type');
select throws_ok($$update public.transactions set transaction_type='expense' where id='13900000-0000-4000-8000-000000000001'$$,'23514',null,'known type must match the formerly unknown category hint');
select lives_ok($$update public.transactions set transaction_type='income' where id='13900000-0000-4000-8000-000000000001'$$,'compatible type resolves pending hint');
select lives_ok($$update public.transactions set transaction_type=null,category_id=pg_temp.category('salary') where id='13900000-0000-4000-8000-000000000001'$$,'undo can restore unknown type and its category hint');
select throws_ok($$update public.transactions set review_status='confirmed' where id='13900000-0000-4000-8000-000000000001'$$,'23514',null,'unknown type can never be confirmed');
update public.categories set is_archived=true where id=pg_temp.category('salary');
select lives_ok($$update public.transactions set transaction_type=null,category_id=pg_temp.category('salary'),description='User update' where id='13900000-0000-4000-8000-000000000001'$$,'unchanged archived hint survives pending edits');
select throws_ok($$update public.transactions set transaction_type=null,category_id=pg_temp.category('salary') where id=(select id from examples where name='no-choice')$$,'23514',null,'new archived hint assignments remain forbidden');
select * from finish();
rollback;
