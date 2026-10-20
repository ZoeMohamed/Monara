begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
grant usage on schema extensions to anon, authenticated;
select plan(12);

insert into auth.users(id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'chat-recovery-owner@test.monara.local'),
  ('a1000000-0000-4000-8000-000000000002', 'chat-recovery-other@test.monara.local');
set local role service_role;

select lives_ok($$select public.append_chat_exchange(
  'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001', '2026-10-18T12:00:00Z', 'Coffee', 'Coffee 25k', 'Saved coffee.',
  '{"reply":"Saved coffee.","actions":[],"confirmation":null}', false
)$$, 'a keyed exchange is saved atomically');

select lives_ok($$select public.append_chat_exchange(
  'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001', '2026-10-18T12:00:00Z', 'Coffee', 'Coffee 25k', 'Saved coffee.',
  '{"reply":"Saved coffee.","actions":[],"confirmation":null}', false
)$$, 'retry after a lost commit response is acknowledged');

select is((select count(*)::int from public.chat_messages where conversation_id = 'a2000000-0000-4000-8000-000000000001'),
  2, 'retry never duplicates either side of the exchange');

select throws_ok($$select public.append_chat_exchange(
  'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001', '2026-10-18T12:00:00Z', 'Coffee', 'Coffee 250k', 'Saved coffee.',
  '{"reply":"Saved coffee.","actions":[],"confirmation":null}', false
)$$, '23505', null, 'the same identity cannot overwrite the saved question');

select throws_ok($$select public.append_chat_exchange(
  'a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001', '2026-10-18T12:00:00Z', 'Coffee', 'Coffee 25k', 'Saved coffee.',
  '{"reply":"Saved coffee.","actions":[],"confirmation":null}', false
)$$, '23503', null, 'a retry cannot adopt another User’s conversation');

select throws_ok($$select public.append_chat_exchange(
  'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000002', '2026-10-18T12:00:00Z', 'Coffee', 'Delete coffee', 'Delete it?',
  '{"reply":"Delete it?","actions":[],"confirmation":{"confirmationId":"a4000000-0000-4000-8000-000000000001"}}', true
)$$, '23514', null, 'saved replies cannot renew confirmation authority');

select is((select count(*)::int from public.chat_messages where conversation_id = 'a2000000-0000-4000-8000-000000000001'),
  2, 'a rejected exchange leaves no half-message behind');

select lives_ok($$select public.append_chat_exchange(
  'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000004', '2026-10-18T11:00:00Z',
  'Earlier reply', 'Earlier question recovered later', 'Earlier answer.',
  '{"reply":"Earlier answer.","actions":[],"confirmation":null}', false
)$$, 'an earlier exchange can recover after a later one is already stored');

select is((select text from public.chat_messages
  where conversation_id = 'a2000000-0000-4000-8000-000000000001'
  order by created_at, seq limit 1),
  'Earlier question recovered later', 'saved history retains conversation order after delayed recovery');

select lives_ok($$select public.append_chat_exchange(
  'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
  'Coffee', 'Legacy open tab', 'Hello.', '{"reply":"Hello.","actions":[],"confirmation":null}', false
)$$, 'the old private server signature works during a rolling deployment');

reset role;
set local role authenticated;
select throws_ok($$select public.append_chat_exchange(
  'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000003', '2026-10-18T12:00:00Z', 'Coffee', 'Forged', 'Forged', '{}', false
)$$, '42501', null, 'a browser cannot call the keyed save directly');
reset role;
set local role anon;
select throws_ok($$select public.append_chat_exchange(
  'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000003', '2026-10-18T12:00:00Z', 'Coffee', 'Forged', 'Forged', '{}', false
)$$, '42501', null, 'an anonymous client cannot call the keyed save directly');
reset role;
select * from finish();
rollback;
