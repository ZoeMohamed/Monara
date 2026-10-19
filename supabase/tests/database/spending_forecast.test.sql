begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

grant usage on schema extensions to anon, authenticated;

select plan(15);

insert into auth.users (id, email)
values
  ('f0000000-0000-4000-8000-000000000001', 'forecast-one@test.monara.local'),
  ('f0000000-0000-4000-8000-000000000002', 'forecast-two@test.monara.local');

select ok(
  (
    select bool_and(c.relrowsecurity and c.relforcerowsecurity)
    from pg_class c
    where c.oid in ('public.forecast_runs'::regclass, 'public.forecast_items'::regclass)
  ),
  'forecast tables enable and force RLS'
);

set local role service_role;

select lives_ok(
  $$select public.replace_forecast(
    'f0000000-0000-4000-8000-000000000001',
    '{"source":"manual","month":"2026-10","threshold":0.7,"usedModel":true,"candidateCount":3,"discardedCount":1}',
    '[
      {"predictedOn":"2026-10-15","merchantName":"Spotify","categoryId":null,"amount":"54990","amountLow":"54990","amountHigh":"54990","confidence":0.93,"pattern":"monthly","reason":"Paid on the 15th for 3 months"},
      {"predictedOn":"2026-10-20","merchantName":"YouTube Premium","categoryId":null,"amount":"59000","amountLow":"59000","amountHigh":"59000","confidence":0.9,"pattern":"monthly","reason":"Paid on the 20th for 3 months"}
    ]'
  )$$,
  'the backend saves a forecast with its items'
);

select is(
  (select count(*)::int from public.forecast_items
   where user_id = 'f0000000-0000-4000-8000-000000000001'),
  2,
  'both items are stored'
);

select lives_ok(
  $$select public.replace_forecast(
    'f0000000-0000-4000-8000-000000000001',
    '{"source":"weekly","month":"2026-10","threshold":0.7,"usedModel":false,"candidateCount":1,"discardedCount":0}',
    '[
      {"predictedOn":"2026-10-19","merchantName":"Ayam Geprek","categoryId":null,"amount":"25000","amountLow":"22000","amountHigh":"28000","confidence":0.8,"pattern":"weekly","reason":"Bought on Mondays"}
    ]'
  )$$,
  'a refresh replaces the earlier forecast'
);

select is(
  (select count(*)::int from public.forecast_runs
   where user_id = 'f0000000-0000-4000-8000-000000000001'),
  1,
  'a User keeps only the latest run'
);

select is(
  (select count(*)::int from public.forecast_items
   where user_id = 'f0000000-0000-4000-8000-000000000001'),
  1,
  'the older run took its items with it'
);

select throws_ok(
  $$insert into public.forecast_items
    (run_id, user_id, predicted_on, merchant_name, amount, amount_low, amount_high, confidence, pattern, reason)
    select id, 'f0000000-0000-4000-8000-000000000002', '2026-10-25', 'Hijack', 1000, 1000, 1000, 0.9, 'monthly', 'x'
    from public.forecast_runs where user_id = 'f0000000-0000-4000-8000-000000000001'$$,
  '23503',
  null,
  'an item cannot point at another User''s run'
);

select throws_ok(
  $$select public.replace_forecast(
    'f0000000-0000-4000-8000-000000000002',
    '{"source":"manual","month":"2026-10","threshold":0.7,"usedModel":true,"candidateCount":1,"discardedCount":0}',
    '[{"predictedOn":"2026-10-25","merchantName":"Bad","categoryId":null,"amount":"1000.5","amountLow":"1000","amountHigh":"1001","confidence":0.9,"pattern":"monthly","reason":"fractional"}]'
  )$$,
  '23514',
  null,
  'a fractional rupiah amount is rejected'
);

select throws_ok(
  $$select public.replace_forecast(
    'f0000000-0000-4000-8000-000000000002',
    '{"source":"manual","month":"2026-10","threshold":0.7,"usedModel":true,"candidateCount":1,"discardedCount":0}',
    '[{"predictedOn":"2026-10-25","merchantName":"Bad","categoryId":null,"amount":"1000","amountLow":"2000","amountHigh":"3000","confidence":0.9,"pattern":"monthly","reason":"range excludes amount"}]'
  )$$,
  '23514',
  null,
  'an amount outside its own range is rejected'
);

reset role;
insert into public.categories (id, user_id, name, slug, icon, color, kind)
values (
  'f1000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000001',
  'Forecast category', 'forecast-category', 'tag', '#3171FD', 'expense'
);

set local role service_role;
select lives_ok(
  $$select public.replace_forecast(
    'f0000000-0000-4000-8000-000000000001',
    '{"source":"manual","month":"2026-10","threshold":0.7,"usedModel":true,"candidateCount":1,"discardedCount":0}',
    '[{"predictedOn":"2026-10-25","merchantName":"Spotify","categoryId":"f1000000-0000-4000-8000-000000000001","amount":"54990","amountLow":"54990","amountHigh":"54990","confidence":0.9,"pattern":"monthly","reason":"Paid on the 25th"}]'
  )$$,
  'an item can carry one of the User''s Categories'
);

reset role;
delete from public.categories where id = 'f1000000-0000-4000-8000-000000000001';

select is(
  (select category_id from public.forecast_items
   where user_id = 'f0000000-0000-4000-8000-000000000001'),
  null,
  'deleting a Category clears it from the forecast instead of being blocked'
);

select is(
  (select count(*)::int from public.forecast_items
   where user_id = 'f0000000-0000-4000-8000-000000000001'),
  1,
  'the forecast item itself stays'
);

insert into public.categories (id, user_id, name, slug, icon, color, kind)
values (
  'f1000000-0000-4000-8000-000000000002',
  'f0000000-0000-4000-8000-000000000001',
  'Second category', 'second-category', 'tag', '#3171FD', 'expense'
);
update public.forecast_items
set category_id = 'f1000000-0000-4000-8000-000000000002'
where user_id = 'f0000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';

select throws_ok(
  $$select count(*) from public.forecast_items$$,
  '42501',
  null,
  'a signed-in browser cannot read forecasts directly'
);

select throws_ok(
  $$select public.replace_forecast(
    'f0000000-0000-4000-8000-000000000001',
    '{"source":"manual","month":"2026-10","threshold":0.7,"usedModel":true,"candidateCount":0,"discardedCount":0}',
    '[]'
  )$$,
  '42501',
  null,
  'a signed-in browser cannot call the save function'
);

reset role;
delete from auth.users where id = 'f0000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::int from public.forecast_runs
   where user_id = 'f0000000-0000-4000-8000-000000000001'),
  0,
  'deleting a User removes their forecasts'
);

select * from finish();
rollback;
