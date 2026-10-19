begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
grant usage on schema extensions to anon, authenticated;

select plan(14);
select has_table('public', 'financial_goals', 'financial goals table exists');
select col_type_is('public', 'financial_goals', 'target_amount', 'numeric', 'target is exact numeric');
select col_type_is('public', 'financial_goals', 'saved_amount', 'numeric', 'saved amount is exact numeric');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.financial_goals'::regclass), 'financial goals force RLS');
select ok((select not public from storage.buckets where id = 'goal-images'), 'goal images use a private bucket');

insert into auth.users (id, email) values
  ('f0000000-0000-4000-8000-000000000001', 'goal-one@test.monara.local'),
  ('f0000000-0000-4000-8000-000000000002', 'goal-two@test.monara.local');
set local role service_role;
insert into public.financial_goals (id, user_id, client_request_id, name, target_amount, saved_amount, target_date)
values ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'goal-phone', 'New phone', 15000000, 4000000, '2027-06-01');
select is((select status from public.financial_goals where id = 'f1000000-0000-4000-8000-000000000001'), 'active', 'incomplete goal is active');
update public.financial_goals set saved_amount = target_amount where id = 'f1000000-0000-4000-8000-000000000001';
select is((select status from public.financial_goals where id = 'f1000000-0000-4000-8000-000000000001'), 'completed', 'target completes goal');
select throws_ok($$update public.financial_goals set saved_amount = target_amount + 1 where id = 'f1000000-0000-4000-8000-000000000001'$$, '23514', null, 'saved cannot exceed target');
select throws_ok($$update public.financial_goals set image_path = 'f0000000-0000-4000-8000-000000000002/f1000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.jpg' where id = 'f1000000-0000-4000-8000-000000000001'$$, '23514', null, 'image cannot name another owner');
update public.financial_goals set image_path = 'f0000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.webp' where id = 'f1000000-0000-4000-8000-000000000001';
select ok((select image_path is not null from public.financial_goals where id = 'f1000000-0000-4000-8000-000000000001'), 'scoped image accepted');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.financial_goals), 1, 'owner reads goal');
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.financial_goals), 0, 'other user cannot read goal');
select throws_ok($$insert into public.financial_goals (user_id, client_request_id, name, target_amount, target_date) values ('f0000000-0000-4000-8000-000000000002', 'browser-write', 'Forged', 1, '2027-01-01')$$, '42501', null, 'browser cannot write goals');
reset role;
delete from auth.users where id = 'f0000000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.financial_goals where user_id = 'f0000000-0000-4000-8000-000000000001'), 0, 'deleting user removes goals');
select * from finish();
rollback;
