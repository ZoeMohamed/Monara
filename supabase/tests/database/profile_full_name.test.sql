begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

grant usage on schema extensions to anon, authenticated;

select plan(8);

insert into auth.users (id, email, raw_user_meta_data)
values ('c0000000-0000-4000-8000-000000000003', 'named@test.monara.local', '{"full_name":"Google Name"}');

select has_column('public', 'profiles', 'full_name', 'profiles stores the full name');

select is(
  (select full_name from public.profiles where id = 'c0000000-0000-4000-8000-000000000003'),
  null,
  'the full name is empty until the User answers'
);

set local role service_role;

select lives_ok(
  $$update public.profiles
    set full_name = 'Synthetic Full Name'
    where id = 'c0000000-0000-4000-8000-000000000003'$$,
  'the backend can store a full name'
);

select is(
  (select full_name from public.profiles where id = 'c0000000-0000-4000-8000-000000000003'),
  'Synthetic Full Name',
  'the stored full name is kept next to the Google display name'
);

select throws_ok(
  $$update public.profiles
    set full_name = '   '
    where id = 'c0000000-0000-4000-8000-000000000003'$$,
  '23514',
  null,
  'a blank full name is rejected'
);

select throws_ok(
  $$update public.profiles
    set full_name = repeat('x', 151)
    where id = 'c0000000-0000-4000-8000-000000000003'$$,
  '23514',
  null,
  'an overlong full name is rejected'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000003';

select is(
  (select full_name from public.profiles where id = 'c0000000-0000-4000-8000-000000000003'),
  'Synthetic Full Name',
  'a signed-in User can read their own full name'
);

select throws_ok(
  $$update public.profiles
    set full_name = 'Forged browser update'
    where id = 'c0000000-0000-4000-8000-000000000003'$$,
  '42501',
  null,
  'a signed-in browser cannot write its own full name directly'
);

select * from finish();
rollback;
