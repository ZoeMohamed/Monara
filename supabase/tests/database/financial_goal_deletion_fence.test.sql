begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
grant usage on schema extensions to authenticated, service_role;
select no_plan();

select has_trigger(
  'public', 'financial_goals', 'aa_require_live_user',
  'later goal writes use the existing deletion fence'
);
select ok(
  exists (
    select 1 from pg_policy
    where polrelid = 'public.financial_goals'::regclass
      and polname = 'live_session_only' and not polpermissive
  ),
  'the goal live-session policy is restrictive rather than an ownership alternative'
);
select ok(
  (select provolatile = 'v' and prosecdef from pg_proc
    where oid = 'private.can_upload_goal_image(text)'::regprocedure),
  'the private upload gate refreshes its snapshot after acquiring the deletion lock'
);
select ok(
  not has_function_privilege('anon', 'private.can_upload_goal_image(text)', 'execute'),
  'anonymous callers cannot invoke the upload gate'
);

insert into auth.users (id, email) values
  ('f1900000-0000-4000-8000-000000000001', 'goal-fence-owner@test.monara.local'),
  ('f1900000-0000-4000-8000-000000000002', 'goal-fence-other@test.monara.local'),
  ('f1900000-0000-4000-8000-000000000003', 'goal-fence-pending@test.monara.local'),
  ('f1900000-0000-4000-8000-000000000004', 'goal-fence-deleted@test.monara.local');
insert into auth.sessions (id, user_id) values (
  'f1900000-0000-4000-8000-000000000011',
  'f1900000-0000-4000-8000-000000000001'
);
insert into public.financial_goals (
  id, user_id, client_request_id, name, target_amount, saved_amount, target_date
) values
  ('f1910000-0000-4000-8000-000000000001', 'f1900000-0000-4000-8000-000000000001',
    'goal-fence-owner', 'Synthetic owner goal', 100, 20, '2027-06-01'),
  ('f1910000-0000-4000-8000-000000000002', 'f1900000-0000-4000-8000-000000000002',
    'goal-fence-other', 'Synthetic other goal', 100, 30, '2027-06-01'),
  ('f1910000-0000-4000-8000-000000000003', 'f1900000-0000-4000-8000-000000000003',
    'goal-fence-pending', 'Synthetic retained fixture', 100, 40, '2027-06-01');

set local role service_role;
select public.begin_goal_image_upload(
  'f1920000-0000-4000-8000-000000000001',
  'f1900000-0000-4000-8000-000000000001',
  'f1910000-0000-4000-8000-000000000001',
  'f1900000-0000-4000-8000-000000000001/f1910000-0000-4000-8000-000000000001/f1920000-0000-4000-8000-000000000001.png',
  (select updated_at from public.financial_goals where id = 'f1910000-0000-4000-8000-000000000001')
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f1900000-0000-4000-8000-000000000001","role":"authenticated","session_id":"f1900000-0000-4000-8000-000000000011"}';
select is((select count(*) from public.financial_goals), 1::bigint,
  'an active owner reads only their own goal');
select is((select count(*) from public.financial_goals
  where user_id = 'f1900000-0000-4000-8000-000000000002'), 0::bigint,
  'another User goal remains private');
select throws_ok(
  $$insert into public.financial_goals
    (user_id, client_request_id, name, target_amount, target_date)
    values ('f1900000-0000-4000-8000-000000000002', 'forged-goal', 'Forged', 100, '2027-06-01')$$,
  '42501', null, 'a browser cannot bypass backend ownership with a goal write'
);
-- These are rollback-only Storage metadata fixtures, not uploaded provider
-- files. Actual bytes are created/deleted only through the Storage API.
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('goal-images',
    'f1900000-0000-4000-8000-000000000001/f1910000-0000-4000-8000-000000000001/f1920000-0000-4000-8000-000000000001.png')$$,
  'an authenticated active owner can insert a uniquely named image for their live goal'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('goal-images',
    'f1900000-0000-4000-8000-000000000002/f1910000-0000-4000-8000-000000000002/f1920000-0000-4000-8000-000000000002.png')$$,
  '42501', null, 'another owner prefix cannot be supplied by the caller'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('goal-images',
    'f1900000-0000-4000-8000-000000000001/f1910000-0000-4000-8000-000000000002/f1920000-0000-4000-8000-000000000003.jpg')$$,
  '42501', null, 'an owner prefix does not authorize another User goal'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('goal-images',
    'f1900000-0000-4000-8000-000000000001/not-a-goal-uuid/f1920000-0000-4000-8000-000000000004.webp')$$,
  '42501', null, 'malformed path segments fail the policy before any UUID cast'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('goal-images',
    'f1900000-0000-4000-8000-000000000001/f1910000-0000-4000-8000-000000000001/../image.png')$$,
  '42501', null, 'image paths cannot contain traversal or arbitrary file names'
);
with changed as (
  update storage.objects set name = 'changed.png'
  where bucket_id = 'goal-images' returning id
)
select is(count(*), 0::bigint,
  'the INSERT policy does not permit overwriting existing image metadata') from changed;
reset role;
update public.financial_goals set deleted_at = now()
where id = 'f1910000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('goal-images',
    'f1900000-0000-4000-8000-000000000001/f1910000-0000-4000-8000-000000000001/f1920000-0000-4000-8000-000000000005.png')$$,
  '42501', null, 'a soft-deleted goal cannot receive another upload'
);
reset role;
update public.financial_goals set deleted_at = null
where id = 'f1910000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$select public.begin_user_deletion('DELETE MY ACCOUNT', true)$$,
  'actual deletion accepts the owning signed-in User');
select is(public.monara_session_is_active(), false,
  'a formerly valid signed session loses activity immediately');
select is((select count(*) from public.financial_goals), 0::bigint,
  'the old signed session cannot read goals after acceptance');
reset role;
select is((select count(*) from public.financial_goals
  where user_id = 'f1900000-0000-4000-8000-000000000001'), 0::bigint,
  'acceptance erases the goal rather than merely hiding it');
select is((select count(*) from public.financial_goals
  where user_id = 'f1900000-0000-4000-8000-000000000002'), 1::bigint,
  'deleting one owner preserves another User goal');

-- Retain one privileged fixture row while marking its owner pending. This
-- proves the read fence itself works rather than relying only on row erasure.
delete from public.categories where user_id = 'f1900000-0000-4000-8000-000000000003';
insert into public.user_deletions (user_id)
values ('f1900000-0000-4000-8000-000000000003');
select is((select count(*) from public.financial_goals
  where user_id = 'f1900000-0000-4000-8000-000000000003'), 1::bigint,
  'the pending read test has a real retained fixture row');
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1900000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*) from public.financial_goals), 0::bigint,
  'a pending-deletion owner cannot read even a retained goal');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('goal-images',
    'f1900000-0000-4000-8000-000000000003/f1910000-0000-4000-8000-000000000003/f1920000-0000-4000-8000-000000000006.png')$$,
  '42501', null, 'pending deletion blocks a late image even while its fixture goal exists'
);
reset role;

set local role service_role;
select throws_ok(
  $$insert into public.financial_goals
    (user_id, client_request_id, name, target_amount, target_date)
    values ('f1900000-0000-4000-8000-000000000001', 'stale-accepted-goal', 'Stale', 100, '2027-06-01')$$,
  '23514', 'This Monara identity is unavailable.',
  'a stale service job cannot recreate an erased goal'
);
select throws_ok(
  $$insert into public.financial_goals
    (user_id, client_request_id, name, target_amount, target_date)
    values ('f1900000-0000-4000-8000-000000000003', 'stale-pending-goal', 'Stale', 100, '2027-06-01')$$,
  '23514', 'This Monara identity is unavailable.',
  'a pending owner cannot gain another goal through a service-role insert'
);
select throws_ok(
  $$update public.financial_goals set saved_amount = 50
    where id = 'f1910000-0000-4000-8000-000000000003'$$,
  '23514', 'This Monara identity is unavailable.',
  'a pending owner cannot gain a late service-role goal update'
);
select lives_ok(
  $$update public.financial_goals set saved_amount = 50
    where id = 'f1910000-0000-4000-8000-000000000002'$$,
  'the fence preserves writes for an active User'
);
reset role;

delete from auth.users where id = 'f1900000-0000-4000-8000-000000000004';
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1900000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('goal-images',
    'f1900000-0000-4000-8000-000000000004/f1910000-0000-4000-8000-000000000004/f1920000-0000-4000-8000-000000000007.png')$$,
  '42501', null, 'a stale signed identity remains unable to upload after final Auth deletion'
);
reset role;
set local role service_role;
select throws_ok(
  $$insert into public.financial_goals
    (user_id, client_request_id, name, target_amount, target_date)
    values ('f1900000-0000-4000-8000-000000000004', 'stale-deleted-goal', 'Stale', 100, '2027-06-01')$$,
  '23514', 'This Monara identity is unavailable.',
  'the final Auth delete also fences later goal creation'
);
reset role;

select * from finish();
rollback;
