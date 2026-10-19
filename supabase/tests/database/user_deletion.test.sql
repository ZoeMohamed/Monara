begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
grant usage on schema extensions to authenticated;
select no_plan();

insert into auth.users (id, email) values
  ('d1900000-0000-4000-8000-000000000001', 'delete-one@test.monara.local'),
  ('d1900000-0000-4000-8000-000000000002', 'delete-two@test.monara.local');
insert into auth.sessions (id, user_id) values
  ('d1900000-0000-4000-8000-000000000011', 'd1900000-0000-4000-8000-000000000001'),
  ('d1900000-0000-4000-8000-000000000012', 'd1900000-0000-4000-8000-000000000001');
insert into public.financial_accounts (id, user_id, client_request_id, name, account_type) values
  ('d1900000-0000-4000-8000-000000000021', 'd1900000-0000-4000-8000-000000000001', 'cash', 'Cash', 'cash'),
  ('d1900000-0000-4000-8000-000000000022', 'd1900000-0000-4000-8000-000000000002', 'cash', 'Cash', 'cash');
insert into public.gmail_connections (user_id, composio_connected_account_id, gmail_address, status, composio_trigger_id) values
  ('d1900000-0000-4000-8000-000000000001', 'ca_delete_active', 'active@test.monara.local', 'active', 'tr_delete'),
  ('d1900000-0000-4000-8000-000000000001', 'ca_delete_old', 'old@test.monara.local', 'disconnected', null);
insert into public.transactions (user_id, client_request_id, source_type, transaction_type, review_status, financial_account_id, merchant_name, amount, currency, occurred_on)
values ('d1900000-0000-4000-8000-000000000001', 'test', 'manual_form', 'expense', 'confirmed', 'd1900000-0000-4000-8000-000000000021', 'Synthetic merchant', 100, 'IDR', '2026-10-19');
select public.append_chat_exchange(
  'd1900000-0000-4000-8000-000000000001', 'd1900000-0000-4000-8000-000000000031',
  'Synthetic conversation', 'Hello', 'Hello', '{"reply":"Hello","actions":[],"confirmation":null}', false
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"d1900000-0000-4000-8000-000000000001","role":"authenticated","session_id":"d1900000-0000-4000-8000-000000000011"}';
select throws_ok($$select public.begin_user_deletion('DELETE', true)$$, '22023', 'Deletion confirmation is required.', 'the exact phrase is enforced in Postgres');
select throws_ok($$select public.begin_user_deletion('DELETE MY ACCOUNT', false)$$, '22023', 'Deletion confirmation is required.', 'acknowledgement is required in Postgres');
select is(public.monara_session_is_active(), true, 'rejected confirmation leaves account active');
select throws_ok($$select * from public.user_deletions$$, '42501', null, 'cleanup identifiers are never browser-readable');
select throws_ok($$select * from public.claim_user_deletion(null)$$, '42501', null, 'browsers cannot run the cleanup worker');
select lives_ok($$select public.begin_user_deletion('DELETE MY ACCOUNT', true)$$, 'the signed-in User can accept deletion');
select is(public.monara_session_is_active(), false, 'the original signed JWT immediately loses access');
select is((select count(*) from public.financial_accounts), 0::bigint, 'the old JWT cannot read personal records');
select lives_ok($$select public.begin_user_deletion('DELETE MY ACCOUNT', true)$$, 'a lost response can be retried without undoing or duplicating deletion');

reset role;
select is((select count(*) from auth.sessions where user_id = 'd1900000-0000-4000-8000-000000000001'), 0::bigint, 'every device refresh session is revoked');
select ok((select banned_until > now() from auth.users where id = 'd1900000-0000-4000-8000-000000000001'), 'the identity cannot register again while cleanup is pending');
select is((select connected_account_ids from public.user_deletions where user_id = 'd1900000-0000-4000-8000-000000000001'), array['ca_delete_active', 'ca_delete_old'], 'cleanup includes disconnected Gmail records');
select is((select trigger_ids from public.user_deletions where user_id = 'd1900000-0000-4000-8000-000000000001'), array['tr_delete'], 'trigger identifiers survive product-data erasure');

do $$
declare v_table text; v_count bigint;
begin
  for v_table in select distinct table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'user_id' and table_name <> 'user_deletions'
  loop
    execute format('select count(*) from public.%I where user_id = $1', v_table)
      into v_count using 'd1900000-0000-4000-8000-000000000001'::uuid;
    if v_count <> 0 then raise exception 'Owned data survived in %', v_table; end if;
  end loop;
end;
$$;
select is((select count(*) from public.profiles where id = 'd1900000-0000-4000-8000-000000000001'), 0::bigint, 'profile and all owned tables are erased at acceptance');
select is((select count(*) from public.financial_accounts where user_id = 'd1900000-0000-4000-8000-000000000002'), 1::bigint, 'another User keeps their records');

set local role service_role;
select throws_ok(
  $$insert into public.financial_accounts (user_id, client_request_id, name, account_type)
  values ('d1900000-0000-4000-8000-000000000001', 'stale-job', 'Recreated cash', 'cash')$$,
  '23514', 'This Monara identity is unavailable.', 'even service-role jobs cannot recreate deleted records'
);
select is((select count(*) from public.claim_user_deletion('d1900000-0000-4000-8000-000000000001')), 1::bigint, 'the worker can lease cleanup');
select is((select count(*) from public.claim_user_deletion('d1900000-0000-4000-8000-000000000001')), 0::bigint, 'a second worker cannot claim the same unexpired lease');
reset role;
update public.user_deletions set lease_until = now() - interval '1 second' where user_id = 'd1900000-0000-4000-8000-000000000001';
set local role service_role;
select is((select count(*) from public.claim_user_deletion('d1900000-0000-4000-8000-000000000001')), 1::bigint, 'a crashed worker lease is recoverable');
reset role;
update public.user_deletions
  set whatsapp_purged = true, connected_account_ids = '{}', trigger_ids = '{}', lease_until = now() - interval '1 second'
  where user_id = 'd1900000-0000-4000-8000-000000000001';
set local role service_role;
select is((select count(*) from public.claim_user_deletion('d1900000-0000-4000-8000-000000000001')), 0::bigint, 'the final provider inventory waits for earlier consent requests to settle');
reset role;
update public.user_deletions set created_at = now() - interval '3 minutes' where user_id = 'd1900000-0000-4000-8000-000000000001';
set local role service_role;
select is((select count(*) from public.claim_user_deletion('d1900000-0000-4000-8000-000000000001')), 1::bigint, 'final cleanup resumes after the irreversible operational drain window');
reset role;
delete from auth.users where id = 'd1900000-0000-4000-8000-000000000001';
select is((select count(*) from public.user_deletions where user_id = 'd1900000-0000-4000-8000-000000000001'), 0::bigint, 'the final Auth hard delete removes cleanup metadata');
select is(public.monara_user_is_active('d1900000-0000-4000-8000-000000000001'), false, 'a deleted User stays unauthorized after the cleanup row disappears');
insert into auth.users (id, email) values ('d1900000-0000-4000-8000-000000000003', 'delete-one@test.monara.local');
select is(public.monara_user_is_active('d1900000-0000-4000-8000-000000000003'), true, 'the same email may belong to a completely new identity');
select is((select count(*) from public.financial_accounts where user_id = 'd1900000-0000-4000-8000-000000000003'), 0::bigint, 'returning registration restores no Financial Accounts');
select is((select count(*) from public.chat_conversations where user_id = 'd1900000-0000-4000-8000-000000000003'), 0::bigint, 'returning registration restores no chats');

select * from finish();
rollback;
