-- Run only against a disposable local DB at 20261019100000, before migration up.
-- The schema contains synthetic expected values and is dropped by the after fixture.
create schema category_upgrade_fixture;
insert into public.categories(id,user_id,name,slug,icon,color,is_default,is_archived,created_at,updated_at)
values('93000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'Shared historic label','upgrade-shared','dot','#123456',false,false,'2026-01-01','2026-01-01'),
 ('93000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
  'Archived historic label','upgrade-archived','dot','#654321',false,true,'2026-01-01','2026-01-01');
insert into public.transactions(id,user_id,client_request_id,source_type,review_status,
  transaction_type,flow_direction,merchant_name,amount,currency,occurred_on,description,
  financial_account_id,category_id,created_at,updated_at)
select ('94000000-0000-4000-8000-'||lpad(sequence::text,12,'0'))::uuid,
 '10000000-0000-4000-8000-000000000001','upgrade-'||sequence,'manual_form',status,
 kind,direction,'Synthetic fixture',25000+sequence,'IDR','2026-01-02','Preserve financial facts',
 '11000000-0000-4000-8000-000000000001',category_id,'2026-01-01','2026-01-01'
from (values
 (1,'expense','out','confirmed','93000000-0000-4000-8000-000000000001'::uuid),
 (2,'income','in','pending','93000000-0000-4000-8000-000000000001'::uuid),
 (3,'exclusion','out','confirmed','93000000-0000-4000-8000-000000000001'::uuid),
 (4,'income','in','pending','93000000-0000-4000-8000-000000000002'::uuid),
 (5,'expense','out','confirmed',(select id from public.categories where user_id='10000000-0000-4000-8000-000000000001' and slug='internal')),
 (6,'exclusion','out','confirmed',(select id from public.categories where user_id='10000000-0000-4000-8000-000000000001' and slug='internal')),
 (7,null,null,'pending','93000000-0000-4000-8000-000000000001'::uuid),
 (8,null,null,'pending','93000000-0000-4000-8000-000000000002'::uuid)
) as fixture(sequence,kind,direction,status,category_id);
insert into public.budgets(id,user_id,category_id,client_request_id,name,cadence,limit_amount,
 currency,starts_on,created_at,updated_at)
values('95000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 (select id from public.categories where user_id='10000000-0000-4000-8000-000000000001' and slug='internal'),
 'upgrade-budget','Preserved budget','monthly',500000,'IDR','2026-01-01','2026-01-01','2026-01-01');
insert into public.agent_action_logs(id,user_id,channel,event_type,tool_name,permission_tier,result_status,resource_type,resource_id)
values('96000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','web','tool_call','edit_transaction','T1','succeeded','transaction','94000000-0000-4000-8000-000000000002'),
 ('96000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','web','tool_call','update_budget','T1','succeeded','budget','95000000-0000-4000-8000-000000000001');
insert into public.agent_action_states(action_id,user_id,purpose,operation_state,expires_at)
values('96000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','undo',
 jsonb_build_object('operation','restore_transaction','expectedUpdatedAt','2026-01-01T00:00:00Z','reviewStatus','pending',
   'values',jsonb_build_object('kind','income','categoryId','93000000-0000-4000-8000-000000000001','money',jsonb_build_object('amountMinor','25002','currency','IDR'))),
 statement_timestamp()+interval '1 hour'),
 ('96000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','undo',
 jsonb_build_object('operation','restore_budget','expectedUpdatedAt','2026-01-01T00:00:00Z',
   'values',jsonb_build_object('categoryId',(select category_id from public.budgets where id='95000000-0000-4000-8000-000000000001'),'limit',jsonb_build_object('amountMinor','500000','currency','IDR'))::text),
 statement_timestamp()+interval '1 hour');
insert into public.agent_action_logs(id,user_id,channel,event_type,tool_name,permission_tier,result_status,resource_type,resource_id)
values('96000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','web','tool_call','edit_pending','T1','succeeded','transaction','94000000-0000-4000-8000-000000000007');
insert into public.agent_action_states(action_id,user_id,purpose,operation_state,expires_at)
values('96000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','undo',
 jsonb_build_object('operation','restore_transaction','expectedUpdatedAt','2026-01-01T00:00:00Z','reviewStatus','pending',
   'values',jsonb_build_object('kind',null::text,'categoryId','93000000-0000-4000-8000-000000000001','money',jsonb_build_object('amountMinor','25007','currency','IDR'))),
 statement_timestamp()+interval '1 hour');
create table category_upgrade_fixture.transactions as
select item.id,to_jsonb(item)-'category_id' as facts,category.name as category_name,category.is_archived
from public.transactions as item join public.categories as category on category.id=item.category_id
where item.client_request_id like 'upgrade-%';
create table category_upgrade_fixture.budgets as
select budget.id,to_jsonb(budget)-'category_id' as facts,category.name as category_name
from public.budgets as budget join public.categories as category on category.id=budget.category_id
where budget.client_request_id='upgrade-budget';
create table category_upgrade_fixture.undo as
select action_id,operation_state,created_at,expires_at from public.agent_action_states
where action_id in ('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002','96000000-0000-4000-8000-000000000003');

-- Keep the real irreversible-deletion lifecycle in the upgrade input. Auth remains
-- until external cleanup finishes, while the accepted product graph is erased.
insert into auth.users(id,email,raw_user_meta_data) values
 ('97000000-0000-4000-8000-000000000001','upgrade-deleting@test.monara.local','{"full_name":"Synthetic Deleting User"}'),
 ('97000000-0000-4000-8000-000000000002','upgrade-active@test.monara.local','{"full_name":"Synthetic Active User"}');
insert into auth.sessions(id,user_id) values
 ('98000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001');
insert into public.gmail_connections(user_id,composio_connected_account_id,gmail_address,status,composio_trigger_id)
values('97000000-0000-4000-8000-000000000001','synthetic_upgrade_cleanup_account',
 'upgrade-deleting@test.monara.local','active','synthetic_upgrade_cleanup_trigger');
begin;
set local role authenticated;
set local request.jwt.claims='{"sub":"97000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"98000000-0000-4000-8000-000000000001"}';
select public.begin_user_deletion('DELETE MY ACCOUNT',true);
commit;
-- Local role and claims ended with the transaction. The migration runs without
-- a deleted User's JWT, so the fixture distinguishes identity state from claims.
create table category_upgrade_fixture.pending_deletion as
select identity.id,identity.email,identity.banned_until,identity.created_at,identity.updated_at,
 to_jsonb(deletion) as deletion_facts
from auth.users as identity join public.user_deletions as deletion on deletion.user_id=identity.id
where identity.id='97000000-0000-4000-8000-000000000001';
create table category_upgrade_fixture.active_users as
select id from auth.users where public.monara_user_is_active(id);
do $$
begin
 if (select count(*) from category_upgrade_fixture.pending_deletion)<>1
   or public.monara_user_is_active('97000000-0000-4000-8000-000000000001')
   or exists(select 1 from auth.sessions where user_id='97000000-0000-4000-8000-000000000001')
   or exists(select 1 from public.categories where user_id='97000000-0000-4000-8000-000000000001')
   or exists(select 1 from public.profiles where id='97000000-0000-4000-8000-000000000001')
 then raise exception 'Real deletion acceptance did not leave the intended pending-cleanup identity.'; end if;
 if not public.monara_user_is_active('97000000-0000-4000-8000-000000000002')
 then raise exception 'Synthetic active control identity is unavailable.'; end if;
end; $$;
