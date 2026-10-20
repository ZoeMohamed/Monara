begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
set local role service_role;
update public.financial_accounts set institution_key='BCA_CC',
  gmail_connection_id='12000000-0000-4000-8000-000000000001'
where id='11000000-0000-4000-8000-000000000001';

create function pg_temp.category(p_slug text,p_user uuid default '10000000-0000-4000-8000-000000000001')
returns uuid language sql as $$ select id from public.categories where user_id=p_user and slug=p_slug $$;
create function pg_temp.import(p_name text,p_confidence numeric default 0.99,p_verified boolean default true,
  p_changes jsonb default '{}',p_institution text default 'BCA_CC') returns uuid language plpgsql as $$
declare v_claim uuid; v_ids uuid[];
begin
  select processed_message_id into v_claim from public.claim_gmail_message(
    '12000000-0000-4000-8000-000000000001',p_name,statement_timestamp());
  select transaction_ids into v_ids from public.record_gmail_extraction(v_claim,'transactions',
    jsonb_build_array('{"kind":"expense","flowDirection":"out","merchantName":"Synthetic business","money":{"amountMinor":"25000","currency":"IDR"},"occurredOn":"2026-10-19","occurredTime":null,"description":"Synthetic payment","location":null,"accountHint":null,"accountLastFour":"4242","confidence":0.99,"counterpartyName":"Synthetic business","counterpartyType":"business","isTransfer":false,"internalTransfer":false}'::jsonb || p_changes || jsonb_build_object('confidence',p_confidence)),
    p_verified,p_institution);
  return v_ids[1];
end; $$;
create temporary table cases(name text primary key,id uuid) on commit drop;
insert into cases values
 ('boundary',pg_temp.import('confidence-boundary',0.5)),
 ('unverified',pg_temp.import('confidence-unverified',0.99,false)),
 ('personal-transfer',pg_temp.import('confidence-personal-transfer',0.99,true,
   '{"counterpartyName":"Rina Putri","counterpartyType":"person","isTransfer":true,"description":"Rent"}')),
 ('other-exclusion',pg_temp.import('confidence-other-exclusion',0.99,true,'{"kind":"exclusion","flowDirection":"out"}')),
 ('low-extraction',pg_temp.import('confidence-low-extraction',0.49)),
 ('low-classification',pg_temp.import('confidence-low-classification')),
 ('missing-extraction',pg_temp.import('confidence-missing-extraction',null)),
 ('missing-classification',pg_temp.import('confidence-missing-classification',0.5)),
 ('both-missing',pg_temp.import('confidence-both-missing',null)),
 ('round-extraction',pg_temp.import('confidence-round-extraction',0.4995)),
 ('round-classification',pg_temp.import('confidence-round-classification')),
 ('fallback-expense',pg_temp.import('confidence-fallback-expense')),
 ('fallback-income',pg_temp.import('confidence-fallback-income',0.99,true,'{"kind":"income","flowDirection":"in"}')),
 ('fallback-exclusion',pg_temp.import('confidence-fallback-exclusion',0.99,true,'{"kind":"exclusion","flowDirection":"out"}')),
 ('fallback-low',pg_temp.import('confidence-fallback-low')),
 ('unknown',pg_temp.import('confidence-unknown',0.99,true,'{"kind":null,"flowDirection":"in"}')),
 ('unknown-out-fallback',pg_temp.import('confidence-unknown-out-fallback',0.99,true,'{"kind":null,"flowDirection":"out"}')),
 ('unknown-no-direction',pg_temp.import('confidence-unknown-no-direction',0.99,true,'{"kind":null,"flowDirection":null}')),
 ('unknown-in-no-amount',pg_temp.import('confidence-unknown-in-no-amount',0.99,true,'{"kind":null,"flowDirection":"in","money":null}')),
 ('wrong-misc-in',pg_temp.import('confidence-wrong-misc-in',0.99,true,'{"kind":null,"flowDirection":"in"}')),
 ('wrong-misc-out',pg_temp.import('confidence-wrong-misc-out',0.99,true,'{"kind":null,"flowDirection":"out"}')),
 ('no-direction-specific',pg_temp.import('confidence-no-direction-specific',0.99,true,'{"kind":null,"flowDirection":null}')),
 ('archived-misc-in',pg_temp.import('confidence-archived-misc-in',0.99,true,'{"kind":null,"flowDirection":"in"}')),
 ('archived-misc-out',pg_temp.import('confidence-archived-misc-out',0.99,true,'{"kind":null,"flowDirection":"out"}')),
 ('archived-misc-no-direction',pg_temp.import('confidence-archived-misc-no-direction',0.99,true,'{"kind":null,"flowDirection":null}')),
 ('unknown-model-type',pg_temp.import('confidence-unknown-model-type',0.99,true,'{"kind":null,"flowDirection":"out"}')),
 ('missing-direction-person-income',pg_temp.import('confidence-missing-direction-person-income',0.99,true,'{"kind":null,"flowDirection":null}')),
 ('missing-income-fallback',pg_temp.import('confidence-missing-income-fallback',0.99,true,'{"kind":null,"flowDirection":"in"}')),
 ('missing-direction-model-type',pg_temp.import('confidence-missing-direction-model-type',0.99,true,'{"kind":"exclusion","flowDirection":null}')),
 ('unknown-hint',pg_temp.import('confidence-unknown-hint',0.99,true,'{"kind":null,"flowDirection":"out"}')),
 ('unknown-invalid-hint',pg_temp.import('confidence-unknown-invalid-hint',0.99,true,'{"kind":null,"flowDirection":null}')),
 ('missing-amount',pg_temp.import('confidence-missing-amount',0.99,true,'{"kind":"exclusion","money":null}')),
 ('missing-date',pg_temp.import('confidence-missing-date',0.99,true,'{"kind":"exclusion","occurredOn":null}')),
 ('missing-direction',pg_temp.import('confidence-missing-direction',0.99,true,'{"kind":"exclusion","flowDirection":null}')),
 ('missing-account',pg_temp.import('confidence-missing-account',0.99,true,'{}',null)),
 ('edited',pg_temp.import('confidence-edited')),
 ('inactive-account',pg_temp.import('confidence-inactive-account')),
 ('category-owner',pg_temp.import('confidence-category-owner')),
 ('category-type',pg_temp.import('confidence-category-type')),
 ('category-archived',pg_temp.import('confidence-category-archived')),
 ('normalized',pg_temp.import('confidence-normalized',0.99,true,
   '{"merchantName":"PT MEDIA DOKTER INVESTAMA / HALODOC","counterpartyName":"PT MEDIA DOKTER INVESTAMA / HALODOC","normalizedDisplayName":"Halodoc (PT Media Dokter Investama)"}')),
 ('raw-internal',pg_temp.import('confidence-raw-internal',0.99,true,
   '{"counterpartyName":"Rina Putri","normalizedDisplayName":"Satria Wibowo"}')),
 ('archived-fallback',pg_temp.import('confidence-archived-fallback')),
 ('custom-collision',pg_temp.import('confidence-custom-collision'));

select is(public.gmail_auto_confirm_confidence(),0.5::numeric,'review cutoff is 50 percent');
select public.set_imported_category((select id from cases where name='boundary'),pg_temp.category('resto-cafe'),'expense',0.5);
select is((select review_status from public.transactions where id=(select id from cases where name='boundary')),
  'confirmed','both scores exactly 50 percent qualify');
select public.set_imported_category((select id from cases where name='unverified'),pg_temp.category('resto-cafe'),'expense',0.99);
select is((select review_status from public.transactions where id=(select id from cases where name='unverified')),
  'confirmed','sender authentication does not add a review gate');
select public.set_imported_category((select id from cases where name='personal-transfer'),pg_temp.category('person'),'expense',0.99);
select is((select row(review_status,category_id)::text from public.transactions where id=(select id from cases where name='personal-transfer')),
  row('confirmed',pg_temp.category('person'))::text,'Person can confirm despite rent description and transfer flag');
select public.set_imported_category((select id from cases where name='other-exclusion'),pg_temp.category('repayment'),'exclusion',0.99);
select is((select review_status from public.transactions where id=(select id from cases where name='other-exclusion')),
  'confirmed','a complete compatible non-Internal exclusion qualifies');
select public.set_imported_category((select id from cases where name='low-extraction'),pg_temp.category('resto-cafe'),'expense',0.99);
select is((select row(review_status,gmail_classification_status)::text from public.transactions where id=(select id from cases where name='low-extraction')),
  row('pending','needs_review')::text,'49 percent extraction requires terminal review');
select public.set_imported_category((select id from cases where name='low-classification'),pg_temp.category('resto-cafe'),'expense',0.49);
select is((select row(review_status,gmail_classification_status)::text from public.transactions where id=(select id from cases where name='low-classification')),
  row('pending','needs_review')::text,'49 percent categorization requires terminal review');
select public.set_imported_category((select id from cases where name='missing-extraction'),pg_temp.category('resto-cafe'),'expense',0.5);
select is((select review_status from public.transactions where id=(select id from cases where name='missing-extraction')),
  'confirmed','missing extraction uses the known category score');
select public.set_imported_category((select id from cases where name='missing-classification'),pg_temp.category('resto-cafe'),'expense',null);
select is((select review_status from public.transactions where id=(select id from cases where name='missing-classification')),
  'confirmed','missing category score uses the known extraction score');
select public.set_imported_category((select id from cases where name='both-missing'),null::uuid,null::text,null::numeric);
select is((select row(review_status,gmail_classification_status,category_id)::text from public.transactions where id=(select id from cases where name='both-missing')),
  row('pending','needs_review',pg_temp.category('misc'))::text,'both missing scores retain Misc in terminal review');
select public.set_imported_category((select id from cases where name='round-extraction'),pg_temp.category('resto-cafe'),'expense',1);
select is((select row(ai_confidence,review_status)::text from public.transactions where id=(select id from cases where name='round-extraction')),
  row(0.500::numeric,'pending')::text,'rounding .4995 to stored .500 never confirms below the raw cutoff');
select public.set_imported_category((select id from cases where name='round-classification'),pg_temp.category('resto-cafe'),'expense',0.4999);
select is((select review_status from public.transactions where id=(select id from cases where name='round-classification')),
  'pending','unrounded category score below 50 percent requires review');

select public.set_imported_category(id,null::uuid,null::text,null::numeric) from cases
  where name in ('fallback-expense','fallback-income','fallback-exclusion','unknown');
select is((select row(category_id,review_status,gmail_classification_confidence)::text from public.transactions where id=(select id from cases where name='fallback-expense')),
  row(pg_temp.category('misc'),'confirmed',null::numeric)::text,'missing model decision automatically uses expense Misc without fabricating confidence');
select is((select category_id from public.transactions where id=(select id from cases where name='fallback-income')),
  pg_temp.category('misc-income'),'income receives its own typed Misc');
select is((select category_id from public.transactions where id=(select id from cases where name='fallback-exclusion')),
  pg_temp.category('misc'),'unclassified exclusion outflow receives expense Misc');
select public.set_imported_category((select id from cases where name='fallback-low'),null::uuid,null::text,0.2);
select is((select row(category_id,review_status,gmail_classification_confidence)::text from public.transactions where id=(select id from cases where name='fallback-low')),
  row(pg_temp.category('misc'),'pending',0.2::numeric)::text,'Misc preserves a known low classification score');
select is((select row(transaction_type,flow_direction,review_status,category_id)::text from public.transactions where id=(select id from cases where name='unknown')),
  row('income','in','confirmed',pg_temp.category('misc-income'))::text,'clear inflow resolves unknown type to Income Misc and qualifies');
select public.set_imported_category((select id from cases where name='unknown-model-type'),pg_temp.category('person'),'expense',0.99);
select is((select row(transaction_type,category_id,review_status)::text from public.transactions where id=(select id from cases where name='unknown-model-type')),
  row('expense',pg_temp.category('person'),'confirmed')::text,'a compatible Person decision resolves unknown type before generic Misc');
select public.set_imported_category((select id from cases where name='missing-direction-model-type'),pg_temp.category('person'),'expense',0.99);
select is((select row(transaction_type,flow_direction,category_id,review_status,gmail_classification_status)::text from public.transactions where id=(select id from cases where name='missing-direction-model-type')),
  row('expense',null::text,pg_temp.category('person'),'pending','needs_review')::text,'Person retains priority with missing direction and settles review without invented outflow');
select public.set_imported_category((select id from cases where name='missing-direction-person-income'),pg_temp.category('person-income'),'income',0.99);
select is((select row(transaction_type,flow_direction,category_id,review_status)::text from public.transactions where id=(select id from cases where name='missing-direction-person-income')),
  row('income',null::text,pg_temp.category('person-income'),'pending')::text,'income Person also retains priority without inventing missing direction');
select public.set_imported_category((select id from cases where name='unknown-hint'),pg_temp.category('misc'),null::text,0.99);
select is((select row(transaction_type,review_status,category_id)::text from public.transactions where id=(select id from cases where name='unknown-hint')),
  row('expense','confirmed',pg_temp.category('misc'))::text,'owned expense Misc hint resolves clear outflow and qualifies');
select public.set_imported_category((select id from cases where name='unknown-invalid-hint'),pg_temp.category('salary'),null::text,1);
select is((select row(transaction_type,category_id,flow_direction,review_status)::text from public.transactions where id=(select id from cases where name='unknown-invalid-hint')),
  row('expense',pg_temp.category('misc'),null::text,'pending')::text,'a missing-direction specific hint becomes Expense Misc in review');
select public.set_imported_category(id,null::uuid,null::text,null::numeric) from cases
  where name in ('unknown-out-fallback','unknown-no-direction','unknown-in-no-amount');
select is((select row(transaction_type,category_id,flow_direction,review_status)::text from public.transactions where id=(select id from cases where name='unknown-out-fallback')),
  row('expense',pg_temp.category('misc'),'out','confirmed')::text,'clear outflow without a model decision finalizes as Expense Misc');
select is((select row(transaction_type,category_id,flow_direction,review_status,gmail_classification_status)::text from public.transactions where id=(select id from cases where name='unknown-no-direction')),
  row('expense',pg_temp.category('misc'),null::text,'pending','needs_review')::text,'no cash direction finalizes as Expense Misc without inventing outflow');
select is((select row(transaction_type,category_id,amount,review_status)::text from public.transactions where id=(select id from cases where name='unknown-in-no-amount')),
  row('income',pg_temp.category('misc-income'),null::numeric,'pending')::text,'clear inflow with missing amount finalizes as Income Misc in review');
select public.set_imported_category((select id from cases where name='wrong-misc-in'),pg_temp.category('misc'),'expense',0.2);
select is((select row(transaction_type,category_id,gmail_classification_confidence,review_status)::text from public.transactions where id=(select id from cases where name='wrong-misc-in')),
  row('income',pg_temp.category('misc-income'),0.2::numeric,'pending')::text,'old wrong-typed Misc normalizes to inflow and preserves known low score');
select public.set_imported_category((select id from cases where name='wrong-misc-out'),pg_temp.category('misc-exclusion'),'exclusion',1);
select is((select row(transaction_type,category_id,review_status)::text from public.transactions where id=(select id from cases where name='wrong-misc-out')),
  row('expense',pg_temp.category('misc'),'confirmed')::text,'old exclusion Misc hint cannot exclude a generic outflow');
select public.set_imported_category((select id from cases where name='no-direction-specific'),pg_temp.category('resto-cafe'),'expense',1);
select is((select row(transaction_type,category_id,flow_direction,review_status)::text from public.transactions where id=(select id from cases where name='no-direction-specific')),
  row('expense',pg_temp.category('misc'),null::text,'pending')::text,'non-Person specific decision without direction becomes Expense Misc in review');
select public.set_imported_category(id,null::uuid,null::text,1) from cases
  where name in ('missing-amount','missing-direction','missing-account');
select is((select count(*) from public.transactions where id in(select id from cases where name in ('missing-amount','missing-direction','missing-account'))
  and review_status='pending' and gmail_classification_status='needs_review'),3::bigint,
  'missing amount direction or account retains review even for high-score exclusions');

update public.transactions set description='User correction' where id=(select id from cases where name='edited');
select is((select applied from public.set_imported_category((select id from cases where name='edited'),pg_temp.category('resto-cafe'),'expense',1)),
  false,'background classification cannot overwrite a User edit');
select is((select description from public.transactions where id=(select id from cases where name='edited')),
  'User correction','User correction survives background classification');
update public.financial_accounts set is_active=false where id='11000000-0000-4000-8000-000000000001';
select public.set_imported_category((select id from cases where name='inactive-account'),null::uuid,null::text,1);
select is((select review_status from public.transactions where id=(select id from cases where name='inactive-account')),
  'pending','an account deactivated during classification cannot qualify');
update public.financial_accounts set is_active=true where id='11000000-0000-4000-8000-000000000001';
select throws_ok($$select * from public.set_imported_category((select id from cases where name='category-owner'),pg_temp.category('resto-cafe','20000000-0000-4000-8000-000000000002'),'expense',1)$$,
  '22023',null,'another owner category remains rejected');
select throws_ok($$select * from public.set_imported_category((select id from cases where name='category-type'),pg_temp.category('salary'),'expense',1)$$,
  '22023',null,'category type mismatch remains rejected');
update public.categories set is_archived=true where id=pg_temp.category('housing');
select throws_ok($$select * from public.set_imported_category((select id from cases where name='category-archived'),pg_temp.category('housing'),'expense',1)$$,
  '22023',null,'an explicit archived category remains rejected');
select is((select applied from public.set_imported_category((select id from cases where name='boundary'),null::uuid,null::text,0)),
  false,'a duplicate classification cannot change a settled transaction');

select is((select merchant_name from public.transactions where id=(select id from cases where name='normalized')),
  'Halodoc (PT Media Dokter Investama)','normalized name is the display value');
select is((select gmail_extraction_evidence ->> 'merchantName' from public.transactions where id=(select id from cases where name='normalized')),
  'PT MEDIA DOKTER INVESTAMA / HALODOC','original merchant name remains structured evidence');
select is((select gmail_extraction_evidence ->> 'counterpartyName' from public.transactions where id=(select id from cases where name='normalized')),
  'PT MEDIA DOKTER INVESTAMA / HALODOC','original counterparty name remains structured evidence');
update public.profiles set full_name='Satria Wibowo' where id='10000000-0000-4000-8000-000000000001';
select is((select internal_transfer from public.imported_transaction_for_category((select id from cases where name='raw-internal'))),
  false,'matching display name never substitutes for original Internal evidence');
select public.set_imported_category((select id from cases where name='raw-internal'),pg_temp.category('internal'),'exclusion',1);
select is((select row(category_id,transaction_type)::text from public.transactions where id=(select id from cases where name='raw-internal')),
  row(pg_temp.category('misc'),'expense')::text,'invalid Internal suggestion falls back without excluding another person');
select throws_ok($$select pg_temp.import('confidence-name-too-long',1,true,jsonb_build_object('normalizedDisplayName',repeat('A',81)))$$,
  '22023',null,'database rejects display names longer than 80 characters');

update public.categories set is_archived=true where id=pg_temp.category('misc');
select public.set_imported_category((select id from cases where name='archived-fallback'),null::uuid,null::text,null::numeric);
select is((select row(item.category_id,category.is_archived)::text from public.transactions item join public.categories category on category.id=item.category_id
  where item.id=(select id from cases where name='archived-fallback')),
  row(pg_temp.category('misc'),false)::text,'future classification reactivates only its canonical typed Misc');
select is((select is_archived from public.categories where id=pg_temp.category('housing')),true,
  'reactivating Misc never reactivates other archived categories');
update public.categories set is_archived=true where id=pg_temp.category('misc');
select public.set_imported_category((select id from cases where name='archived-misc-in'),pg_temp.category('misc'),null::text,1);
select is((select row(transaction_type,category_id,review_status,gmail_classification_status)::text from public.transactions where id=(select id from cases where name='archived-misc-in')),
  row('income',pg_temp.category('misc-income'),'confirmed','completed')::text,'archived expense Misc hint with clear inflow immediately settles as Income Misc');
select public.set_imported_category((select id from cases where name='archived-misc-out'),pg_temp.category('misc'),null::text,1);
select is((select row(transaction_type,category_id,review_status,gmail_classification_status)::text from public.transactions where id=(select id from cases where name='archived-misc-out')),
  row('expense',pg_temp.category('misc'),'confirmed','completed')::text,'archived expense Misc with clear outflow is repaired and immediately settles');
update public.categories set is_archived=true where id=pg_temp.category('misc');
select public.set_imported_category((select id from cases where name='archived-misc-no-direction'),pg_temp.category('misc'),null::text,1);
select is((select row(transaction_type,category_id,flow_direction,review_status,gmail_classification_status)::text from public.transactions where id=(select id from cases where name='archived-misc-no-direction')),
  row('expense',pg_temp.category('misc'),null::text,'pending','needs_review')::text,'archived expense Misc with no direction repairs and settles review immediately');
update public.categories set is_default=false,name='Custom category',color='#123456' where id=pg_temp.category('misc');
select public.set_imported_category((select id from cases where name='custom-collision'),null::uuid,null::text,null::numeric);
select is((select row(name,color,is_default)::text from public.categories where id=pg_temp.category('misc')),
  row('Custom category','#123456',false)::text,'fallback preserves custom category metadata occupying a default slug');
select ok((select category.name='Misc' and category.is_default and category.kind='expense' and not category.is_archived
  and category.id<>pg_temp.category('misc') from public.transactions item join public.categories category on category.id=item.category_id
  where item.id=(select id from cases where name='custom-collision')),
  'custom slug collision receives a separate active typed fallback');
-- Simulate a removed canonical income fallback without deleting its history.
update public.categories set slug='historical-misc-income',is_default=false
  where id=pg_temp.category('misc-income');
select public.set_imported_category((select id from cases where name='missing-income-fallback'),null::uuid,null::text,0.2);
select is((select row(item.transaction_type,category.slug,category.is_default,item.gmail_classification_confidence,item.review_status,item.gmail_classification_status)::text
  from public.transactions item join public.categories category on category.id=item.category_id
  where item.id=(select id from cases where name='missing-income-fallback')),
  row('income','misc-income',true,0.2::numeric,'pending','needs_review')::text,'missing Income Misc is created immediately while preserving a known low score');
select ok((select bool_and(transaction_type is not null and category_id is not null)
  from public.transactions where id in(select id from cases where name<>'edited')
    and gmail_classification_status in ('completed','needs_review')),
  'every finalized imported record has a type and a category');
-- Explicit User confirmation keeps the established type-derived direction behavior.
update public.transactions set transaction_type='expense',review_status='confirmed'
  where id=(select id from cases where name='unknown-no-direction');
select is((select row(transaction_type,flow_direction,review_status)::text from public.transactions where id=(select id from cases where name='unknown-no-direction')),
  row('expense','out','confirmed')::text,'manual confirmation can derive outflow from an explicitly confirmed expense');
select ok(not has_function_privilege('authenticated','private.gmail_misc_category(uuid,text)','EXECUTE'),
  'clients cannot create fallbacks through the private backend helper');
select * from finish();
rollback;
