begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
grant usage on schema extensions to authenticated, service_role;
select no_plan();

select has_table('private', 'goal_image_uploads',
  'upload completion metadata lives outside the erased public product graph');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class
    where oid = 'private.goal_image_uploads'::regclass),
  'upload completion metadata forces RLS and grants no browser table access'
);

insert into auth.users (id, email) values
  ('f1930000-0000-4000-8000-000000000001', 'upload-intent-owner@test.monara.local'),
  ('f1930000-0000-4000-8000-000000000002', 'upload-intent-other@test.monara.local');
insert into auth.sessions (id, user_id) values (
  'f1930000-0000-4000-8000-000000000011',
  'f1930000-0000-4000-8000-000000000001'
);
insert into public.financial_goals (
  id, user_id, client_request_id, name, target_amount, target_date
) values
  ('f1940000-0000-4000-8000-000000000001', 'f1930000-0000-4000-8000-000000000001',
    'intent-owner-goal', 'Synthetic goal', 100, '2027-06-01'),
  ('f1940000-0000-4000-8000-000000000002', 'f1930000-0000-4000-8000-000000000002',
    'intent-other-goal', 'Other synthetic goal', 100, '2027-06-01');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f1930000-0000-4000-8000-000000000001","role":"authenticated","session_id":"f1930000-0000-4000-8000-000000000011"}';
select throws_ok($$select * from private.goal_image_uploads$$,
  '42501', null, 'a browser cannot discover opaque unfinished upload paths');
select throws_ok(
  $$select public.begin_goal_image_upload(
    'f1950000-0000-4000-8000-000000000001', 'f1930000-0000-4000-8000-000000000001',
    'f1940000-0000-4000-8000-000000000001',
    'f1930000-0000-4000-8000-000000000001/f1940000-0000-4000-8000-000000000001/f1950000-0000-4000-8000-000000000001.png', now())$$,
  '42501', null, 'a browser cannot register its own replayable upload intent'
);
select throws_ok(
  $$select * from public.list_pending_goal_image_uploads('f1930000-0000-4000-8000-000000000001')$$,
  '42501', null, 'a browser cannot list pending upload paths through the trusted RPC'
);
select throws_ok(
  $$select public.settle_goal_image_upload(
    'f1950000-0000-4000-8000-000000000001', 'f1930000-0000-4000-8000-000000000001')$$,
  '42501', null, 'a browser cannot assert completion of a Storage request'
);
select throws_ok(
  $$select public.cancel_unstarted_goal_image_upload(
    'f1950000-0000-4000-8000-000000000001', 'f1930000-0000-4000-8000-000000000001',
    'f1940000-0000-4000-8000-000000000001',
    'f1930000-0000-4000-8000-000000000001/f1940000-0000-4000-8000-000000000001/f1950000-0000-4000-8000-000000000001.png', now())$$,
  '42501', null, 'a browser cannot claim that an upload request was never started'
);
select throws_ok(
  $$select public.prepare_goal_image_identity_deletion(
    'f1930000-0000-4000-8000-000000000001', 'f1960000-0000-4000-8000-000000000001')$$,
  '42501', null, 'a browser cannot remove trusted upload completion metadata'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('goal-images',
    'f1930000-0000-4000-8000-000000000001/f1940000-0000-4000-8000-000000000001/f1950000-0000-4000-8000-000000000001.png')$$,
  '42501', null, 'an active owned goal alone cannot authorize an unregistered path'
);
reset role;

set local role service_role;
select throws_ok(
  $$select public.begin_goal_image_upload(
    'f1950000-0000-4000-8000-000000000001', 'f1930000-0000-4000-8000-000000000001',
    'f1940000-0000-4000-8000-000000000002',
    'f1930000-0000-4000-8000-000000000001/f1940000-0000-4000-8000-000000000002/f1950000-0000-4000-8000-000000000001.png',
    (select updated_at from public.financial_goals where id = 'f1940000-0000-4000-8000-000000000002'))$$,
  '42501', 'This goal is unavailable.', 'trusted registration still checks goal ownership'
);
select throws_ok(
  $$select public.begin_goal_image_upload(
    'f1950000-0000-4000-8000-000000000001', 'f1930000-0000-4000-8000-000000000001',
    'f1940000-0000-4000-8000-000000000001',
    'f1930000-0000-4000-8000-000000000002/f1940000-0000-4000-8000-000000000001/f1950000-0000-4000-8000-000000000001.png', now())$$,
  '22023', 'A valid owned upload path is required.', 'the path cannot escape its verified owner'
);
select throws_ok(
  $$select public.begin_goal_image_upload(
    'f1950000-0000-4000-8000-000000000001', 'f1930000-0000-4000-8000-000000000001',
    'f1940000-0000-4000-8000-000000000001',
    'f1930000-0000-4000-8000-000000000001/f1940000-0000-4000-8000-000000000001/f1950000-0000-4000-8000-000000000001.png',
    (select updated_at - interval '1 second' from public.financial_goals where id = 'f1940000-0000-4000-8000-000000000001'))$$,
  '40001', 'The goal changed. Refresh before uploading.', 'registration requires the reviewed goal version'
);
select lives_ok(
  $$select public.begin_goal_image_upload(
    'f1950000-0000-4000-8000-000000000001', 'f1930000-0000-4000-8000-000000000001',
    'f1940000-0000-4000-8000-000000000001',
    'f1930000-0000-4000-8000-000000000001/f1940000-0000-4000-8000-000000000001/f1950000-0000-4000-8000-000000000001.png',
    (select updated_at from public.financial_goals where id = 'f1940000-0000-4000-8000-000000000001'))$$,
  'the verified backend registers one opaque upload before sending bytes'
);
select lives_ok(
  $$select public.begin_goal_image_upload(
    'f1950000-0000-4000-8000-000000000001', 'f1930000-0000-4000-8000-000000000001',
    'f1940000-0000-4000-8000-000000000001',
    'f1930000-0000-4000-8000-000000000001/f1940000-0000-4000-8000-000000000001/f1950000-0000-4000-8000-000000000001.png',
    (select updated_at from public.financial_goals where id = 'f1940000-0000-4000-8000-000000000001'))$$,
  'an exact registration retry preserves the original intent'
);
select is((select count(*) from public.list_pending_goal_image_uploads(
  'f1930000-0000-4000-8000-000000000001')), 1::bigint,
  'registration retry creates only one pending completion record');
select lives_ok(
  $$select public.begin_goal_image_upload(
    'f1950000-0000-4000-8000-000000000002', 'f1930000-0000-4000-8000-000000000001',
    'f1940000-0000-4000-8000-000000000001',
    'f1930000-0000-4000-8000-000000000001/f1940000-0000-4000-8000-000000000001/f1950000-0000-4000-8000-000000000002.png',
    (select updated_at from public.financial_goals where id = 'f1940000-0000-4000-8000-000000000001'))$$,
  'a separate request receives its own bounded upload window'
);
select throws_ok(
  $$select public.begin_goal_image_upload(
    'f1950000-0000-4000-8000-000000000001', 'f1930000-0000-4000-8000-000000000001',
    'f1940000-0000-4000-8000-000000000001',
    'f1930000-0000-4000-8000-000000000001/f1940000-0000-4000-8000-000000000001/f1950000-0000-4000-8000-000000000099.png',
    (select updated_at from public.financial_goals where id = 'f1940000-0000-4000-8000-000000000001'))$$,
  '23505', 'That image upload ID was already used.', 'an intent ID cannot acquire a different path'
);
reset role;

set local role authenticated;
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('goal-images',
    'f1930000-0000-4000-8000-000000000001/f1940000-0000-4000-8000-000000000001/f1950000-0000-4000-8000-000000000001.png')$$,
  'the registered exact path passes authenticated Storage authorization'
);
reset role;
set local role service_role;
update private.goal_image_uploads set created_at = now() - interval '90 days'
where upload_id = 'f1950000-0000-4000-8000-000000000002';
reset role;
set local role authenticated;
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('goal-images',
    'f1930000-0000-4000-8000-000000000001/f1940000-0000-4000-8000-000000000001/f1950000-0000-4000-8000-000000000002.png')$$,
  '42501', null, 'Storage rejects an intent after its maximum request window'
);
select lives_ok($$select public.begin_user_deletion('DELETE MY ACCOUNT', true)$$,
  'deletion accepts while an already-started upload is unresolved');
reset role;
select is((select count(*) from public.financial_goals
  where user_id = 'f1930000-0000-4000-8000-000000000001'), 0::bigint,
  'deletion erases the public goal');
select is((select count(*) from private.goal_image_uploads
  where user_id = 'f1930000-0000-4000-8000-000000000001' and settled_at is null), 2::bigint,
  'deletion retains the private unresolved completion identity');
select throws_ok(
  $$delete from auth.users where id = 'f1930000-0000-4000-8000-000000000001'$$,
  '23503', null, 'the Auth foreign key independently prevents erasing an unresolved upload'
);
update public.user_deletions set whatsapp_purged = true,
  lease_token = 'f1960000-0000-4000-8000-000000000001', lease_until = now() + interval '1 hour'
where user_id = 'f1930000-0000-4000-8000-000000000001';
set local role service_role;
select is((select count(*) from public.list_pending_goal_image_uploads(
  'f1930000-0000-4000-8000-000000000001')), 2::bigint,
  'expired requests remain pending until Storage absence is checked');
select is(public.settle_expired_goal_image_upload(
  'f1950000-0000-4000-8000-000000000001', 'f1930000-0000-4000-8000-000000000001'), false,
  'a recent upload cannot be settled by the expiry operation');
select is(public.settle_expired_goal_image_upload(
  'f1950000-0000-4000-8000-000000000002', 'f1930000-0000-4000-8000-000000000001'), true,
  'the trusted cleanup may settle an absent request after its upload window');
select is((select count(*) from public.list_pending_goal_image_uploads(
  'f1930000-0000-4000-8000-000000000001')), 1::bigint,
  'only the verified absent expired request leaves pending inventory');
select throws_ok(
  $$select public.prepare_goal_image_identity_deletion(
    'f1930000-0000-4000-8000-000000000001', 'f1960000-0000-4000-8000-000000000001')$$,
  '55000', 'Image upload completion is still unknown.',
  'even the current deletion lease cannot erase an unresolved outcome'
);
select throws_ok(
  $$select public.begin_goal_image_upload(
    'f1950000-0000-4000-8000-000000000002', 'f1930000-0000-4000-8000-000000000001',
    'f1940000-0000-4000-8000-000000000001',
    'f1930000-0000-4000-8000-000000000001/f1940000-0000-4000-8000-000000000001/f1950000-0000-4000-8000-000000000002.png', now())$$,
  '23514', 'This Monara identity is unavailable.', 'pending deletion prevents any new registered upload'
);
select throws_ok(
  $$select public.settle_goal_image_upload(
    'f1950000-0000-4000-8000-000000000001', 'f1930000-0000-4000-8000-000000000002')$$,
  '42501', 'This upload is unavailable.', 'trusted settlement still checks the bound owner'
);
select lives_ok(
  $$select public.settle_goal_image_upload(
    'f1950000-0000-4000-8000-000000000001', 'f1930000-0000-4000-8000-000000000001')$$,
  'trusted known completion can settle after deletion erased the goal and revoked the User'
);
select lives_ok(
  $$select public.settle_goal_image_upload(
    'f1950000-0000-4000-8000-000000000001', 'f1930000-0000-4000-8000-000000000001')$$,
  'trusted settlement is idempotent'
);
select is((select count(*) from public.list_pending_goal_image_uploads(
  'f1930000-0000-4000-8000-000000000001')), 0::bigint,
  'only trusted completion removes an intent from pending inventory');
select throws_ok($$select * from public.list_pending_goal_image_uploads(null)$$,
  '22023', 'A valid User identity is required.', 'an invalid cleanup identity cannot look complete');
reset role;
select is((select count(*) from storage.objects
  where bucket_id = 'goal-images' and name = 'f1930000-0000-4000-8000-000000000001/f1940000-0000-4000-8000-000000000001/f1950000-0000-4000-8000-000000000001.png'),
  1::bigint, 'settlement changes app metadata without SQL-deleting a Storage object');

-- A settled active intent stays settled on retry; it never grants an overwrite.
set local role service_role;
select public.begin_goal_image_upload(
  'f1950000-0000-4000-8000-000000000003', 'f1930000-0000-4000-8000-000000000002',
  'f1940000-0000-4000-8000-000000000002',
  'f1930000-0000-4000-8000-000000000002/f1940000-0000-4000-8000-000000000002/f1950000-0000-4000-8000-000000000003.webp',
  (select updated_at from public.financial_goals where id = 'f1940000-0000-4000-8000-000000000002')
);
select public.settle_goal_image_upload(
  'f1950000-0000-4000-8000-000000000003', 'f1930000-0000-4000-8000-000000000002'
);
select public.begin_goal_image_upload(
  'f1950000-0000-4000-8000-000000000003', 'f1930000-0000-4000-8000-000000000002',
  'f1940000-0000-4000-8000-000000000002',
  'f1930000-0000-4000-8000-000000000002/f1940000-0000-4000-8000-000000000002/f1950000-0000-4000-8000-000000000003.webp',
  (select updated_at from public.financial_goals where id = 'f1940000-0000-4000-8000-000000000002')
);
select is((select count(*) from public.list_pending_goal_image_uploads(
  'f1930000-0000-4000-8000-000000000002')), 0::bigint,
  'retrying an already-settled registration cannot reopen the upload');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1930000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('goal-images',
    'f1930000-0000-4000-8000-000000000002/f1940000-0000-4000-8000-000000000002/f1950000-0000-4000-8000-000000000003.webp')$$,
  '42501', null, 'a settled registration no longer authorizes Storage writes'
);
reset role;

-- Closing either side of an interrupted registration's commit order must leave
-- an irreversible owner-bound tombstone. No Storage request was attempted.
set local role service_role;
select public.cancel_unstarted_goal_image_upload(
  'f1950000-0000-4000-8000-000000000004', 'f1930000-0000-4000-8000-000000000002',
  'f1940000-0000-4000-8000-000000000002',
  'f1930000-0000-4000-8000-000000000002/f1940000-0000-4000-8000-000000000002/f1950000-0000-4000-8000-000000000004.png',
  (select updated_at from public.financial_goals where id = 'f1940000-0000-4000-8000-000000000002')
);
select public.begin_goal_image_upload(
  'f1950000-0000-4000-8000-000000000004', 'f1930000-0000-4000-8000-000000000002',
  'f1940000-0000-4000-8000-000000000002',
  'f1930000-0000-4000-8000-000000000002/f1940000-0000-4000-8000-000000000002/f1950000-0000-4000-8000-000000000004.png',
  (select updated_at from public.financial_goals where id = 'f1940000-0000-4000-8000-000000000002')
);
select is((select count(*) from public.list_pending_goal_image_uploads(
  'f1930000-0000-4000-8000-000000000002')), 0::bigint,
  'a late registration cannot reopen an upload closed before sending bytes');
select public.begin_goal_image_upload(
  'f1950000-0000-4000-8000-000000000005', 'f1930000-0000-4000-8000-000000000002',
  'f1940000-0000-4000-8000-000000000002',
  'f1930000-0000-4000-8000-000000000002/f1940000-0000-4000-8000-000000000002/f1950000-0000-4000-8000-000000000005.png',
  (select updated_at from public.financial_goals where id = 'f1940000-0000-4000-8000-000000000002')
);
select public.cancel_unstarted_goal_image_upload(
  'f1950000-0000-4000-8000-000000000005', 'f1930000-0000-4000-8000-000000000002',
  'f1940000-0000-4000-8000-000000000002',
  'f1930000-0000-4000-8000-000000000002/f1940000-0000-4000-8000-000000000002/f1950000-0000-4000-8000-000000000005.png',
  (select updated_at from public.financial_goals where id = 'f1940000-0000-4000-8000-000000000002')
);
select is((select count(*) from public.list_pending_goal_image_uploads(
  'f1930000-0000-4000-8000-000000000002')), 0::bigint,
  'closing an already-committed unstarted registration also settles its outcome');
select throws_ok(
  $$select public.cancel_unstarted_goal_image_upload(
    'f1950000-0000-4000-8000-000000000005', 'f1930000-0000-4000-8000-000000000001',
    'f1940000-0000-4000-8000-000000000001',
    'f1930000-0000-4000-8000-000000000001/f1940000-0000-4000-8000-000000000001/f1950000-0000-4000-8000-000000000005.png', now())$$,
  '23505', 'That image upload ID was already used.', 'cancellation cannot acquire another owner intent'
);
reset role;

-- Cleanup batches are bounded without treating a truncated page as empty.
set local role service_role;
select public.begin_goal_image_upload(
  gen_random_uuid(), 'f1930000-0000-4000-8000-000000000002',
  'f1940000-0000-4000-8000-000000000002',
  'f1930000-0000-4000-8000-000000000002/f1940000-0000-4000-8000-000000000002/' || gen_random_uuid()::text || '.png',
  (select updated_at from public.financial_goals where id = 'f1940000-0000-4000-8000-000000000002')
) from generate_series(1, 101);
select is((select count(*) from public.list_pending_goal_image_uploads(
  'f1930000-0000-4000-8000-000000000002')), 100::bigint,
  'cleanup receives a bounded nonempty first page when more requests remain');
reset role;
select is((select count(*) from private.goal_image_uploads
  where user_id = 'f1930000-0000-4000-8000-000000000002' and settled_at is null),
  101::bigint, 'page bounds never discard other unresolved requests');
set local role service_role;
select throws_ok(
  $$select public.prepare_goal_image_identity_deletion(
    'f1930000-0000-4000-8000-000000000001', 'f1960000-0000-4000-8000-000000000099')$$,
  '55000', 'Account cleanup must be retried.', 'a stale lease cannot erase settled metadata'
);
select throws_ok(
  $$select public.prepare_goal_image_identity_deletion(
    'f1930000-0000-4000-8000-000000000002', 'f1960000-0000-4000-8000-000000000001')$$,
  '55000', 'Account cleanup must be retried.', 'another owner cannot borrow a deletion lease'
);
reset role;
update public.user_deletions set lease_until = now() - interval '1 second'
where user_id = 'f1930000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok(
  $$select public.prepare_goal_image_identity_deletion(
    'f1930000-0000-4000-8000-000000000001', 'f1960000-0000-4000-8000-000000000001')$$,
  '55000', 'Account cleanup must be retried.', 'an expired lease cannot prepare Auth erasure'
);
reset role;
update public.user_deletions set lease_until = now() + interval '1 hour', trigger_ids = '{unfinished}'
where user_id = 'f1930000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok(
  $$select public.prepare_goal_image_identity_deletion(
    'f1930000-0000-4000-8000-000000000001', 'f1960000-0000-4000-8000-000000000001')$$,
  '55000', 'Account cleanup must be retried.', 'unfinished provider targets retain completion metadata'
);
reset role;
update public.user_deletions set trigger_ids = '{}'
where user_id = 'f1930000-0000-4000-8000-000000000001';
set local role service_role;
select lives_ok(
  $$select public.prepare_goal_image_identity_deletion(
    'f1930000-0000-4000-8000-000000000001', 'f1960000-0000-4000-8000-000000000001')$$,
  'the current fully cleaned lease can remove settled completion metadata'
);
reset role;
select is((select count(*) from private.goal_image_uploads
  where user_id = 'f1930000-0000-4000-8000-000000000001'), 0::bigint,
  'successful preparation leaves no completion metadata for final Auth erasure');
delete from auth.users where id = 'f1930000-0000-4000-8000-000000000001';
select is((select count(*) from private.goal_image_uploads
  where user_id = 'f1930000-0000-4000-8000-000000000001'), 0::bigint,
  'final Auth deletion succeeds after settled completion metadata was explicitly cleared');

select * from finish();
rollback;
