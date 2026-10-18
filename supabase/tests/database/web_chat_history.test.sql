begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

grant usage on schema extensions to anon, authenticated;

select plan(13);

insert into auth.users (id, email)
values
  ('d0000000-0000-4000-8000-000000000001', 'chat-one@test.monara.local'),
  ('d0000000-0000-4000-8000-000000000002', 'chat-two@test.monara.local');

select ok(
  (
    select bool_and(c.relrowsecurity and c.relforcerowsecurity)
    from pg_class c
    where c.oid in ('public.chat_conversations'::regclass, 'public.chat_messages'::regclass)
  ),
  'chat tables enable and force RLS'
);

set local role service_role;

select lives_ok(
  $$select public.append_chat_exchange(
    'd0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'Coffee 25k',
    'Coffee 25k',
    'Saved it.',
    '{"reply":"Saved it.","actions":[],"confirmation":null}',
    false
  )$$,
  'the backend saves an exchange and creates the conversation'
);

select lives_ok(
  $$select public.append_chat_exchange(
    'd0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'Ignored later title',
    'Delete it',
    'Delete this payment?',
    '{"reply":"Delete this payment?","actions":[],"confirmation":null}',
    true
  )$$,
  'a second exchange joins the same conversation'
);

select is(
  (select title from public.chat_conversations
   where id = 'e0000000-0000-4000-8000-000000000001'),
  'Coffee 25k',
  'the title is fixed by the first exchange'
);

select is(
  (select array_agg(role order by seq) from public.chat_messages
   where conversation_id = 'e0000000-0000-4000-8000-000000000001'),
  array['user', 'agent', 'user', 'agent'],
  'messages keep arrival order'
);

select is(
  (select closed_confirmation from public.chat_messages
   where conversation_id = 'e0000000-0000-4000-8000-000000000001' and role = 'agent'
   order by seq desc limit 1),
  true,
  'an unanswered confirmation is remembered as closed'
);

select throws_ok(
  $$select public.append_chat_exchange(
    'd0000000-0000-4000-8000-000000000002',
    'e0000000-0000-4000-8000-000000000001',
    'Hijack',
    'Hello',
    'Hi',
    null,
    false
  )$$,
  '23503',
  null,
  'another User cannot add to a conversation they do not own'
);

select throws_ok(
  $$insert into public.chat_messages (conversation_id, user_id, role, text, result)
    values (
      'e0000000-0000-4000-8000-000000000001',
      'd0000000-0000-4000-8000-000000000001',
      'user',
      'Pretend result',
      '{}'
    )$$,
  '23514',
  null,
  'a User message carries no Agent result'
);

select throws_ok(
  $$insert into public.chat_messages (conversation_id, user_id, role, text)
    values (
      'e0000000-0000-4000-8000-000000000001',
      'd0000000-0000-4000-8000-000000000001',
      'agent',
      '   '
    )$$,
  '23514',
  null,
  'a blank message is rejected'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';

select throws_ok(
  $$select count(*) from public.chat_messages$$,
  '42501',
  null,
  'a signed-in browser cannot read chat messages directly'
);

select throws_ok(
  $$insert into public.chat_conversations (id, user_id, title)
    values (
      'e0000000-0000-4000-8000-000000000009',
      'd0000000-0000-4000-8000-000000000001',
      'Forged'
    )$$,
  '42501',
  null,
  'a signed-in browser cannot write a conversation directly'
);

select throws_ok(
  $$select public.append_chat_exchange(
    'd0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'x', 'x', 'x', null, false
  )$$,
  '42501',
  null,
  'a signed-in browser cannot call the save function'
);

reset role;
delete from auth.users where id = 'd0000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::int from public.chat_messages
   where conversation_id = 'e0000000-0000-4000-8000-000000000001'),
  0,
  'deleting a User removes their chats'
);

select * from finish();
rollback;
