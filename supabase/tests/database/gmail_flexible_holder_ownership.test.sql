begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(49);
set local role service_role;

update public.financial_accounts set institution_key='BCA_CC',
  gmail_connection_id='12000000-0000-4000-8000-000000000001'
where id='11000000-0000-4000-8000-000000000001';
update public.profiles set full_name='Satria Wibowo'
where id='10000000-0000-4000-8000-000000000001';

create function pg_temp.flex_import(p_name text,p_counterparty text,p_changes jsonb default '{}')
returns uuid language plpgsql as $$
declare v_message uuid; v_ids uuid[];
begin
  select processed_message_id into v_message from public.claim_gmail_message(
    '12000000-0000-4000-8000-000000000001',p_name,statement_timestamp());
  select transaction_ids into v_ids from public.record_gmail_extraction(v_message,'transactions',
    jsonb_build_array('{"kind":"expense","flowDirection":"out","merchantName":null,"money":{"amountMinor":"25000","currency":"IDR"},"occurredOn":"2026-10-19","occurredTime":null,"description":"Synthetic transfer","location":null,"accountHint":null,"accountLastFour":"4242","confidence":0.99,"counterpartyType":"person","isTransfer":true,"internalTransfer":false}'::jsonb
      || jsonb_build_object('counterpartyName',p_counterparty) || p_changes),true,'BCA_CC');
  return v_ids[1];
end; $$;
create temporary table flexible_examples(name text primary key,id uuid) on commit drop;
insert into flexible_examples values
 ('subset',pg_temp.flex_import('flex-subset','SATRIA WIBOWO PRATAMA')),
 ('typos',pg_temp.flex_import('flex-typos','SATRIO WIBOWA PRATAMA')),
 ('business',pg_temp.flex_import('flex-business','SATRIA WIBOWO PRATAMA','{"counterpartyType":"business"}')),
 ('purchase',pg_temp.flex_import('flex-purchase','SATRIA WIBOWO PRATAMA','{"isTransfer":false}')),
 ('no-direction',pg_temp.flex_import('flex-no-direction','SATRIA WIBOWO PRATAMA','{"kind":null,"flowDirection":null}')),
 ('single-word',pg_temp.flex_import('flex-single-word','SATRIA'));

select is((select internal_transfer from public.imported_transaction_for_category(
  (select id from flexible_examples where name='subset'))),true,'two complete profile words match a longer counterparty');
select is((select internal_transfer from public.imported_transaction_for_category(
  (select id from flexible_examples where name='typos'))),true,'one character typo in each of two words still matches');

select public.set_imported_category(example.id,category.id,'exclusion',1)
from flexible_examples example cross join public.categories category
where example.name in ('subset','typos','business','purchase','no-direction') and category.user_id='10000000-0000-4000-8000-000000000001'
  and category.is_default and category.slug='internal';
select is((select review_status from public.transactions where id=(select id from flexible_examples where name='subset')),
 'confirmed','server applies Internal for a qualifying subset');
select is((select transaction_type from public.transactions where id=(select id from flexible_examples where name='subset')),
 'exclusion','qualifying subset is excluded from totals');
select is((select review_status from public.transactions where id=(select id from flexible_examples where name='typos')),
 'confirmed','server applies Internal for two bounded word typos');
select is((select flow_direction from public.transactions where id=(select id from flexible_examples where name='typos')),
 'out','flexible Internal preserves cash direction');
select is((select internal_transfer from public.imported_transaction_for_category(
  (select id from flexible_examples where name='business'))),true,'a business label does not veto the matching holder name');
select is((select internal_transfer from public.imported_transaction_for_category(
  (select id from flexible_examples where name='purchase'))),true,'a matching name establishes Internal without a transfer label');
select is((select internal_transfer from public.imported_transaction_for_category(
  (select id from flexible_examples where name='no-direction'))),true,'a matching name establishes Internal with unknown direction');
select is((select internal_transfer from public.imported_transaction_for_category(
  (select id from flexible_examples where name='single-word'))),false,'single shared word cannot become Internal');


select is((select transaction_type from public.transactions where id=(select id from flexible_examples where name='business')),
 'exclusion','matching name overrides business label');
select is((select review_status from public.transactions where id=(select id from flexible_examples where name='business')),
 'confirmed','matching business-labelled counterparty can qualify for confirmation');
select is((select transaction_type from public.transactions where id=(select id from flexible_examples where name='purchase')),
 'exclusion','matching name overrides a purchase description and non-transfer flag');
select is((select review_status from public.transactions where id=(select id from flexible_examples where name='purchase')),
 'confirmed','matching non-transfer counterparty can qualify for confirmation');
select is((select transaction_type from public.transactions where id=(select id from flexible_examples where name='no-direction')),
 'exclusion','name match assigns Internal even with unknown original type and direction');
select is((select flow_direction from public.transactions where id=(select id from flexible_examples where name='no-direction')),
 null::text,'classification never invents missing cash direction');
select is((select review_status from public.transactions where id=(select id from flexible_examples where name='no-direction')),
 'pending','assigning Internal does not bypass original extraction eligibility');

-- Same synthetic boundary cases as the worker matcher, checked at the server seam.
select is(private.holder_name_matches(counterparty,holder),expected,'server matcher: '||label)
from (values
 ('exact','SATRIA WIBOWO PRATAMA','Satria Wibowo Pratama',true),
 ('unicode titles','Bpk. ＳＡＴＲＩＡ Wibowo Pratama','Satria Wibowo Pratama',true),
 ('subset','Satria Wibowo','Satria Wibowo Pratama',true),
 ('reverse subset','Satria Wibowo Pratama','Satria Wibowo',true),
 ('reordered subset','Pratama Satria','Satria Wibowo Pratama',true),
 ('two substitutions','Satria Wibowa Pratamo','Satria Wibowo Pratama',true),
 ('substitution deletion','Satrio Wibow','Satria Wibowo Pratama',true),
 ('insertion deletion','Sattria Wibwo','Satria Wibowo Pratama',true),
 ('alternative assignment','Maria Marie','Maria Mara',true),
 ('three typos','Satrio Wibowa Pratamo','Satria Wibowo Pratama',false),
 ('different word','Satrio Wawawa','Satria Wibowo Pratama',false),
 ('initial','Satria W','Satria Wibowo Pratama',false),
 ('one word','Satria','Satria Wibowo Pratama',false),
 ('repeated word','Satria Satria','Satria Wibowo Pratama',false),
 ('reuse target','Satria Satrio','Satria Wibowo Pratama',false),
 ('conflicting surname','Satria Wibowo Santos','Satria Wibowo Pratama',false),
 ('different person','Budi Pratama','Satria Wibowo Pratama',false),
 ('one deletion','Satria Wibwo','Satria Wibowo',true),
 ('transposition is two edits','Satria Wiobwo','Satria Wibowo',false),
 ('one substantive word','Muhammad Al','Muhammad Al Farisi',false),
 ('short exact name','Li An','Li An',true),
 ('short subset','Li An','Li An Santos',false),
 ('single exact name','Sukarno','SUKARNO',true),
 ('single word subset','Sukarno Putra','Sukarno',false),
 ('numeric identifier','1234 5678','1234 5678 Pratama',false),
 ('empty','','',false),
 ('only titles','Bpk.','Ibu',false)
) as names(label,counterparty,holder,expected);
select is(private.holder_name_matches(null,'Satria Wibowo'),false,'null counterparty does not match');
select is(private.holder_name_matches('Satria Wibowo',null),false,'null profile does not match');
select ok(not has_function_privilege('anon','private.holder_name_matches(text,text)','EXECUTE'),'anonymous cannot call private matcher');
select ok(not has_function_privilege('authenticated','private.holder_name_matches(text,text)','EXECUTE'),'clients cannot bypass backend through matcher');
select ok(has_function_privilege('service_role','private.holder_name_matches(text,text)','EXECUTE'),'backend can call private matcher');

select * from finish();
rollback;
