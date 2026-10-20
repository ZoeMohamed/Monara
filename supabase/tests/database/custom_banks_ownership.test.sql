begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
grant usage on schema extensions to authenticated;
select no_plan();
insert into auth.users(id, email) values
 ('d7000000-0000-4000-8000-000000000011', 'custom-one@test.monara.local'),
 ('d7000000-0000-4000-8000-000000000012', 'custom-two@test.monara.local');
insert into auth.sessions(id, user_id) values
 ('d7000000-0000-4000-8000-000000000021', 'd7000000-0000-4000-8000-000000000011');

create function pg_temp.bank_values(p_sender text, p_name text default 'Local Bank') returns jsonb
language sql as $$ select jsonb_build_object('name', p_name, 'platform', 'BANKING_APP', 'logo', null,
 'senderEmails', jsonb_build_array(p_sender), 'accountName', 'Savings', 'lastFour', '1234', 'gmailConnectionId', null) $$;

set local role service_role;
select lives_ok($$select public.create_custom_bank_account(
 'd7000000-0000-4000-8000-000000000011', 'd7000000-0000-4000-8000-000000000001', 'custom-first',
 pg_temp.bank_values(' Alerts@LocalBank.Example '))$$, 'a bank and its first account are created together');
select is((select count(*) from public.financial_accounts where user_id='d7000000-0000-4000-8000-000000000011'), 1::bigint, 'exactly one first account');
select is((select sender_email from public.custom_bank_senders where custom_bank_id='d7000000-0000-4000-8000-000000000001'), 'alerts@localbank.example', 'sender normalization is durable');
select is((select institution_key from public.financial_accounts where custom_bank_id='d7000000-0000-4000-8000-000000000001'), 'custom_d7000000000040008000000000000001', 'account and bank share stable identity');
select lives_ok($$select public.create_custom_bank_account(
 'd7000000-0000-4000-8000-000000000011', 'd7000000-0000-4000-8000-000000000001', 'custom-first',
 pg_temp.bank_values(' Alerts@LocalBank.Example '))$$, 'the same request is safely replayed');
select is((select count(*) from public.financial_accounts where user_id='d7000000-0000-4000-8000-000000000011'), 1::bigint, 'a replay never duplicates the account');
select throws_ok($$select public.create_custom_bank_account(
 'd7000000-0000-4000-8000-000000000011', 'd7000000-0000-4000-8000-000000000001', 'custom-first',
 pg_temp.bank_values('different@localbank.example'))$$, '23505', null, 'changed payload cannot reuse a request ID');
select throws_ok($$select public.create_custom_bank_account(
 'd7000000-0000-4000-8000-000000000011', 'd7000000-0000-4000-8000-000000000002', 'duplicate-sender',
 pg_temp.bank_values('alerts@localbank.example'))$$, '23505', null, 'one sender maps to one bank per User');
select is((select count(*) from public.custom_banks where id='d7000000-0000-4000-8000-000000000002'), 0::bigint, 'sender conflict rolls back the bank');
select throws_ok($$select public.create_custom_bank_account(
 'd7000000-0000-4000-8000-000000000011', 'd7000000-0000-4000-8000-000000000002', 'invalid-account',
 pg_temp.bank_values('other@localbank.example') || '{"lastFour":"12"}'::jsonb)$$, '23514', null, 'invalid first account fails');
select is((select count(*) from public.custom_banks where id='d7000000-0000-4000-8000-000000000002'), 0::bigint, 'account failure rolls back bank and senders');
select lives_ok($$select public.create_custom_bank_account(
 'd7000000-0000-4000-8000-000000000012', 'd7000000-0000-4000-8000-000000000002', 'other-user-bank',
 pg_temp.bank_values('alerts@localbank.example'))$$, 'another User can configure the same sender privately');
select throws_ok($$insert into public.financial_accounts(user_id, client_request_id, name, account_type, institution_key)
 values('d7000000-0000-4000-8000-000000000012','foreign-bank','Forged','bank','custom_d7000000000040008000000000000001')$$,
 '23503', null, 'an account cannot reference another User bank');
select throws_ok($$select public.update_custom_bank('d7000000-0000-4000-8000-000000000012','d7000000-0000-4000-8000-000000000001',now(),
 '{"name":"Forged","logo":null,"senderEmails":["forged@localbank.example"]}')$$, 'P0002', null, 'bank edits enforce owner identity');
select throws_ok($$select public.update_custom_bank('d7000000-0000-4000-8000-000000000011','d7000000-0000-4000-8000-000000000001','2000-01-01T00:00:00Z',
 '{"name":"Stale","logo":null,"senderEmails":["new@localbank.example"]}')$$, '40001', null, 'stale edits fail');
select lives_ok($$select public.update_custom_bank('d7000000-0000-4000-8000-000000000011','d7000000-0000-4000-8000-000000000001',
 (select updated_at from public.custom_banks where id='d7000000-0000-4000-8000-000000000001'),
 '{"name":"Corrected Bank","logo":"si:bankofamerica","senderEmails":["new@localbank.example"]}')$$, 'metadata can be corrected');
select is((select sender_email from public.custom_bank_senders where custom_bank_id='d7000000-0000-4000-8000-000000000001'), 'new@localbank.example', 'sender edit replaces old configuration');
select is((select name from public.financial_accounts where custom_bank_id='d7000000-0000-4000-8000-000000000001'), 'Savings', 'bank editing preserves the account nickname');
set constraints financial_accounts_custom_bank_owner_fkey immediate;
select throws_ok($$delete from public.custom_banks where id='d7000000-0000-4000-8000-000000000001'$$, '23503', null, 'a referenced bank cannot be hard deleted');
set constraints financial_accounts_custom_bank_owner_fkey deferred;

-- Custom keys participate in the existing strict mailbox/account mapper.
insert into public.gmail_connections(id,user_id,composio_connected_account_id,gmail_address) values
 ('d7000000-0000-4000-8000-000000000031','d7000000-0000-4000-8000-000000000011','custom-test-one','one@custom.test'),
 ('d7000000-0000-4000-8000-000000000032','d7000000-0000-4000-8000-000000000012','custom-test-two','two@custom.test');
update public.financial_accounts set gmail_connection_id='d7000000-0000-4000-8000-000000000031'
 where custom_bank_id='d7000000-0000-4000-8000-000000000001';
select is(public.gmail_item_account('d7000000-0000-4000-8000-000000000011','d7000000-0000-4000-8000-000000000031',
 'custom_d7000000000040008000000000000001','expense','1234'),
 (select id from public.financial_accounts where custom_bank_id='d7000000-0000-4000-8000-000000000001'),
 'a custom sender key maps to its owned mailbox account');
select is(public.gmail_item_account('d7000000-0000-4000-8000-000000000011','d7000000-0000-4000-8000-000000000032',
 'custom_d7000000000040008000000000000001','expense','1234'),null::uuid,'another mailbox never receives that account mapping');
select is(public.gmail_item_account('d7000000-0000-4000-8000-000000000011','d7000000-0000-4000-8000-000000000031',
 'custom_d7000000000040008000000000000001','expense','9999'),null::uuid,'a mismatched account ending stays unknown');
update public.financial_accounts set is_active=false where custom_bank_id='d7000000-0000-4000-8000-000000000001';
select is(public.gmail_item_account('d7000000-0000-4000-8000-000000000011','d7000000-0000-4000-8000-000000000031',
 'custom_d7000000000040008000000000000001','expense','1234'),null::uuid,'deactivating the account stops new custom-bank mapping');
update public.financial_accounts set is_active=true,gmail_connection_id=null where custom_bank_id='d7000000-0000-4000-8000-000000000001';
select is(public.gmail_item_account('d7000000-0000-4000-8000-000000000011','d7000000-0000-4000-8000-000000000031',
 'custom_d7000000000040008000000000000001','expense','1234'),null::uuid,'unlinking Gmail also stops custom-bank mapping');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d7000000-0000-4000-8000-000000000011","role":"authenticated","session_id":"d7000000-0000-4000-8000-000000000021"}';
select is((select count(*) from public.custom_banks),1::bigint,'RLS shows only the owner bank');
select is((select count(*) from public.custom_bank_senders),1::bigint,'RLS shows only the owner senders');
select throws_ok($$select public.create_custom_bank_account('d7000000-0000-4000-8000-000000000012','d7000000-0000-4000-8000-000000000003','forged-owner',pg_temp.bank_values('x@localbank.example'))$$,'42501',null,'browsers cannot supply an owner to the service RPC');
select throws_ok($$update public.custom_banks set name='Browser write'$$,'42501',null,'browsers cannot bypass server validation');
select lives_ok($$select public.begin_user_deletion('DELETE MY ACCOUNT',true)$$,'full User Deletion still clears the owned graph');
select is((select count(*) from public.custom_banks),0::bigint,'a deleting session sees no bank data');
reset role;
select is((select count(*) from public.custom_banks where user_id='d7000000-0000-4000-8000-000000000011'),0::bigint,'User Deletion removes custom banks');
select is((select count(*) from public.custom_bank_senders where user_id='d7000000-0000-4000-8000-000000000011'),0::bigint,'User Deletion removes sender addresses');
select is((select count(*) from public.custom_banks where user_id='d7000000-0000-4000-8000-000000000012'),1::bigint,'another User is preserved');
set local role service_role;
select throws_ok($$select public.create_custom_bank_account('d7000000-0000-4000-8000-000000000011','d7000000-0000-4000-8000-000000000003','after-deletion',pg_temp.bank_values('x@localbank.example'))$$,'23514',null,'in-flight writes cannot resurrect deleted data');
reset role;
select * from finish();
rollback;
