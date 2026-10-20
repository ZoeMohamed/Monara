begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(4);

insert into auth.users (id, email)
values
  ('c0000000-0000-4000-8000-000000000041', 'bills-one@test.monara.local'),
  ('c0000000-0000-4000-8000-000000000042', 'bills-two@test.monara.local');

set local role service_role;

select lives_ok(
  $$insert into public.recurring_bills
      (user_id, client_request_id, merchant_name, expected_amount, interval_count, interval_unit, next_due_on, status)
    values ('c0000000-0000-4000-8000-000000000041', 'bill-1', 'Streamly', 149000, 1, 'month', '2026-11-10', 'active')$$,
  'the backend can save a tracked bill'
);

select throws_ok(
  $$insert into public.recurring_bills
      (user_id, client_request_id, merchant_name, expected_amount, interval_count, interval_unit, next_due_on, status)
    values ('c0000000-0000-4000-8000-000000000041', 'bill-2', '  STREAMLY ', 149000, 1, 'month', '2026-11-10', 'dismissed')$$,
  '23505',
  null,
  'a second decision for the same merchant is refused, ignoring case and spacing'
);

select lives_ok(
  $$insert into public.recurring_bills
      (user_id, client_request_id, merchant_name, expected_amount, interval_count, interval_unit, next_due_on, status)
    values ('c0000000-0000-4000-8000-000000000042', 'bill-1', 'Streamly', 149000, 1, 'month', '2026-11-10', 'active')$$,
  'another User can track the same merchant'
);

update public.recurring_bills
set deleted_at = statement_timestamp()
where user_id = 'c0000000-0000-4000-8000-000000000041';

select lives_ok(
  $$insert into public.recurring_bills
      (user_id, client_request_id, merchant_name, expected_amount, interval_count, interval_unit, next_due_on, status)
    values ('c0000000-0000-4000-8000-000000000041', 'bill-3', 'Streamly', 155000, 1, 'month', '2026-11-10', 'active')$$,
  'a deleted bill frees the merchant'
);

select * from finish();
rollback;
