begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

grant usage on schema extensions to anon, authenticated;

select plan(35);

-- Seeded synthetic data: User 1 owns active connection 12000000-...-0001, the
-- accounts "Daily bank" (4242) and "Daily wallet" (1234), and default Categories.
-- User 2 owns "Other user account".

set local role authenticated;
select throws_ok(
  $$select * from public.set_imported_category(
      '00000000-0000-4000-8000-000000000099', 'Food & Drinks')$$,
  '42501',
  null,
  'signed-in Users cannot set imported categories directly'
);
select throws_ok(
  $$select * from public.claim_merchant_profile('kopi')$$,
  '42501',
  null,
  'signed-in Users cannot touch the merchant cache'
);
select throws_ok(
  $$select * from public.gmail_institution_discoveries$$,
  '42501',
  null,
  'signed-in Users cannot read discoveries directly'
);
select throws_ok(
  $$select * from public.merchant_profiles$$,
  '42501',
  null,
  'signed-in Users cannot read the merchant cache directly'
);
reset role;

set local role service_role;

select is(
  public.gmail_auto_confirm_confidence(),
  0.5::numeric,
  'Gmail auto-confirm uses the agreed 50 percent confidence boundary'
);

-- Discovery.
select public.start_gmail_discovery('12000000-0000-4000-8000-000000000001');
select is(
  (select discovery_state from public.gmail_connections
    where id = '12000000-0000-4000-8000-000000000001'),
  'running',
  'discovery starts as running'
);
select public.record_gmail_discovery(
  '12000000-0000-4000-8000-000000000001',
  $$[{"institutionKey": "BCA_CC", "emailCount": 3, "lastFours": ["4242"], "lastSeenAt": "2026-10-13T09:00:00+07:00"},
     {"institutionKey": "Jago_App", "emailCount": 1, "lastFours": [], "lastSeenAt": null}]$$::jsonb
);
select is(
  (select row(connection.discovery_state, count(found.*))::text
    from public.gmail_connections as connection
    join public.gmail_institution_discoveries as found on found.gmail_connection_id = connection.id
    where connection.id = '12000000-0000-4000-8000-000000000001'
    group by connection.discovery_state),
  row('completed', 2::bigint)::text,
  'recording findings completes discovery'
);
select public.record_gmail_discovery(
  '12000000-0000-4000-8000-000000000001',
  $$[{"institutionKey": "BCA_CC", "emailCount": 5, "lastFours": [], "lastSeenAt": null}]$$::jsonb
);
select is(
  (select array_agg(row(institution_key, email_count)::text)
    from public.gmail_institution_discoveries
    where gmail_connection_id = '12000000-0000-4000-8000-000000000001'),
  array[row('BCA_CC', 5)::text],
  'a new scan replaces the previous findings'
);
update public.gmail_institution_discoveries
  set dismissed_at = statement_timestamp()
  where gmail_connection_id = '12000000-0000-4000-8000-000000000001'
    and institution_key = 'BCA_CC';
select public.record_gmail_discovery(
  '12000000-0000-4000-8000-000000000001',
  $$[{"institutionKey": "BCA_CC", "emailCount": 6, "lastFours": [], "lastSeenAt": null},
     {"institutionKey": "Jago_App", "emailCount": 1, "lastFours": [], "lastSeenAt": null}]$$::jsonb
);
select is(
  (select array_agg(
      row(found.institution_key, found.dismissed_at is not null,
        found.first_seen_at > connection.discovery_first_completed_at)::text
      order by found.institution_key)
    from public.gmail_institution_discoveries as found
    join public.gmail_connections as connection on connection.id = found.gmail_connection_id
    where found.gmail_connection_id = '12000000-0000-4000-8000-000000000001'),
  array[row('BCA_CC', true, false)::text, row('Jago_App', false, true)::text],
  'a rescan keeps a dismissal and marks only findings after the first scan as new'
);
select public.record_gmail_discovery(
  '12000000-0000-4000-8000-000000000001',
  $$[{"institutionKey": "Jago_App", "emailCount": 2, "lastFours": [], "lastSeenAt": null}]$$::jsonb
);
select ok(
  exists (
    select 1 from public.gmail_institution_discoveries
    where gmail_connection_id = '12000000-0000-4000-8000-000000000001'
      and institution_key = 'BCA_CC'
      and dismissed_at is not null
  ),
  'a dismissed finding stays dismissed when a later scan no longer sees it'
);
select throws_ok(
  $$select public.record_gmail_discovery('12000000-0000-4000-8000-000000000001',
      '[{"institutionKey": "BCA_CC", "emailCount": 1, "lastFours": ["12"], "lastSeenAt": null}]'::jsonb)$$,
  '23514',
  null,
  'only four-digit endings are stored'
);

-- Account mapping from the sender's institution, for accounts fed by this mailbox.
update public.financial_accounts
  set institution_key = 'BCA_CC', gmail_connection_id = '12000000-0000-4000-8000-000000000001'
  where id = '11000000-0000-4000-8000-000000000001';
update public.financial_accounts
  set institution_key = 'BCA_CC'
  where id = '21000000-0000-4000-8000-000000000001';

select public.claim_gmail_messages(
  '12000000-0000-4000-8000-000000000001',
  $$[{"gmailMessageId": "inst-001", "receivedAt": "2026-10-13T09:00:00+07:00"},
     {"gmailMessageId": "inst-002", "receivedAt": "2026-10-13T09:00:00+07:00"},
     {"gmailMessageId": "inst-003", "receivedAt": "2026-10-13T09:00:00+07:00"},
     {"gmailMessageId": "inst-004", "receivedAt": "2026-10-13T09:00:00+07:00"},
     {"gmailMessageId": "inst-005", "receivedAt": "2026-10-13T09:00:00+07:00"},
     {"gmailMessageId": "inst-006", "receivedAt": "2026-10-13T09:00:00+07:00"},
     {"gmailMessageId": "inst-007", "receivedAt": "2026-10-13T09:00:00+07:00"},
     {"gmailMessageId": "inst-008", "receivedAt": "2026-10-13T09:00:00+07:00"},
     {"gmailMessageId": "inst-009", "receivedAt": "2026-10-13T09:00:00+07:00"}]$$::jsonb
);

create temporary table recorded_001 on commit drop as
  select * from public.record_gmail_extraction(
    (select id from public.processed_gmail_messages where gmail_message_id = 'inst-001'),
    'transactions',
    $$[{"kind": "expense", "merchantName": "Kopi Kenangan",
        "money": {"amountMinor": "38000", "currency": "IDR"}, "occurredOn": "2026-10-13",
        "occurredTime": null, "description": null, "location": null,
        "accountHint": "Kartu ****4242", "accountLastFour": "4242", "confidence": 0.95}]$$::jsonb,
    p_sender_verified => true,
    p_institution_key => 'BCA_CC'
  );

select is(
  (select row(item.review_status, account.name, item.gmail_auto_confirm_pending)::text
    from public.transactions as item
    left join public.financial_accounts as account on account.id = item.financial_account_id
    where item.id = (select transaction_ids[1] from recorded_001)),
  row('pending', 'Daily bank', true)::text,
  'a verified sender maps to the owner''s account and qualifies, but waits for a Category'
);
select is(
  (select uncategorized_transaction_ids from recorded_001),
  (select transaction_ids from recorded_001),
  'an item with no history is returned for categorization'
);

select public.record_gmail_extraction(
  (select id from public.processed_gmail_messages where gmail_message_id = 'inst-002'),
  'transactions',
  $$[{"kind": "expense", "merchantName": "Toko Contoh",
      "money": {"amountMinor": "38000", "currency": "IDR"}, "occurredOn": "2026-10-13",
      "occurredTime": null, "description": null, "location": null,
      "accountHint": null, "accountLastFour": null, "confidence": 0.99}]$$::jsonb,
  p_sender_verified => false,
  p_institution_key => 'BCA_CC'
);
select is(
  (select row(item.review_status, item.financial_account_id is not null)::text
    from public.transactions as item
    join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
    where source.gmail_message_id = 'inst-002'),
  row('pending', true)::text,
  'an unverified sender keeps the account but always waits for review'
);

select public.record_gmail_extraction(
  (select id from public.processed_gmail_messages where gmail_message_id = 'inst-003'),
  'transactions',
  $$[{"kind": "expense", "merchantName": "Toko Contoh",
      "money": {"amountMinor": "38000", "currency": "IDR"}, "occurredOn": "2026-10-13",
      "occurredTime": null, "description": null, "location": null,
      "accountHint": "Kartu ****1111", "accountLastFour": "1111", "confidence": 0.99}]$$::jsonb,
  p_sender_verified => true,
  p_institution_key => 'BCA_CC'
);
select is(
  (select row(item.review_status, item.financial_account_id)::text
    from public.transactions as item
    join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
    where source.gmail_message_id = 'inst-003'),
  row('pending', null::uuid)::text,
  'a different card ending than the only account leaves the account empty'
);

-- A second BCA_CC account: only the stated ending tells them apart.
insert into public.financial_accounts (
  id, user_id, client_request_id, name, institution, account_type, last_four, institution_key,
  gmail_connection_id
) values (
  '11000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001',
  'inst-second-card', 'Second card', 'BCA', 'bank', '5555', 'BCA_CC',
  '12000000-0000-4000-8000-000000000001'
);

select public.record_gmail_extraction(
  (select id from public.processed_gmail_messages where gmail_message_id = 'inst-004'),
  'transactions',
  $$[{"kind": "expense", "merchantName": "Toko Contoh",
      "money": {"amountMinor": "10000", "currency": "IDR"}, "occurredOn": "2026-10-13",
      "occurredTime": null, "description": null, "location": null,
      "accountHint": "****5555", "accountLastFour": "5555", "confidence": 0.5},
     {"kind": "expense", "merchantName": "Toko Contoh",
      "money": {"amountMinor": "10000", "currency": "IDR"}, "occurredOn": "2026-10-13",
      "occurredTime": null, "description": null, "location": null,
      "accountHint": null, "accountLastFour": null, "confidence": 0.5},
     {"kind": "exclusion", "flowDirection": "in", "merchantName": null,
      "money": {"amountMinor": "10000", "currency": "IDR"}, "occurredOn": "2026-10-13",
      "occurredTime": null, "description": "Top up", "location": null,
      "accountHint": "****5555", "accountLastFour": "5555", "confidence": 0.99}]$$::jsonb,
  p_sender_verified => true,
  p_institution_key => 'BCA_CC'
);
select is(
  (select array_agg(account.name order by item.source_item_index)
    from public.transactions as item
    join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
    left join public.financial_accounts as account on account.id = item.financial_account_id
    where source.gmail_message_id = 'inst-004'),
  array['Second card', null, 'Second card'],
  'several accounts map by ending only; missing ending stays unmapped while exclusions retain the source account'
);
select is(
  (select cardinality(uncategorized_transaction_ids)
    from public.record_gmail_extraction(
      (select id from public.processed_gmail_messages where gmail_message_id = 'inst-004'),
      'skipped',
      '[]'::jsonb,
      p_sender_verified => false
    )),
  3,
  'every new extraction including exclusions enters categorization'
);
select is(
  (select applied
    from public.set_imported_category(
      (select item.id from public.transactions item
        join public.processed_gmail_messages source on source.id=item.processed_gmail_message_id
        where source.gmail_message_id='inst-004' and item.transaction_type='exclusion'),
      'Food & Drinks')),
  true,
  'a legacy unknown category still applies the automatic typed fallback'
);
select is(
  (select row(item.transaction_type,category.slug)::text from public.transactions item
    join public.processed_gmail_messages source on source.id=item.processed_gmail_message_id
    join public.categories category on category.id=item.category_id
    where source.gmail_message_id='inst-004' and item.source_item_index=2),
  row('income','misc-income')::text,
  'an unknown legacy category uses Income Misc for clear money in'
);

select public.record_gmail_extraction(
  (select id from public.processed_gmail_messages where gmail_message_id = 'inst-005'),
  'transactions',
  $$[{"kind": "expense", "merchantName": "Toko Contoh",
      "money": {"amountMinor": "10000", "currency": "IDR"}, "occurredOn": "2026-10-13",
      "occurredTime": null, "description": null, "location": null,
      "accountHint": null, "accountLastFour": null, "confidence": 0.99}]$$::jsonb,
  p_sender_verified => true,
  p_institution_key => 'Jago_App'
);
select is(
  (select row(item.review_status, item.financial_account_id)::text
    from public.transactions as item
    join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
    where source.gmail_message_id = 'inst-005'),
  row('pending', null::uuid)::text,
  'an institution the owner has no account for maps to nothing and is never confirmed'
);

select public.record_gmail_extraction(
  (select id from public.processed_gmail_messages where gmail_message_id = 'inst-007'),
  'transactions',
  $$[{"kind": "expense", "merchantName": "Boundary Low",
      "money": {"amountMinor": "10000", "currency": "IDR"}, "occurredOn": "2026-10-13",
      "occurredTime": null, "description": null, "location": null,
      "accountHint": "****4242", "accountLastFour": "4242", "confidence": 0.4995}]$$::jsonb,
  p_sender_verified => true,
  p_institution_key => 'BCA_CC'
);
select public.record_gmail_extraction(
  (select id from public.processed_gmail_messages where gmail_message_id = 'inst-008'),
  'transactions',
  $$[{"kind": "income", "merchantName": "Boundary Exact",
      "money": {"amountMinor": "10000", "currency": "IDR"}, "occurredOn": "2026-10-13",
      "occurredTime": null, "description": null, "location": null,
      "accountHint": "****4242", "accountLastFour": "4242", "confidence": 0.5}]$$::jsonb,
  p_sender_verified => true,
  p_institution_key => 'BCA_CC'
);
select public.record_gmail_extraction(
  (select id from public.processed_gmail_messages where gmail_message_id = 'inst-009'),
  'transactions',
  $$[{"kind": "expense", "merchantName": "Incomplete High",
      "money": {"amountMinor": "10000", "currency": "IDR"}, "occurredOn": null,
      "occurredTime": null, "description": null, "location": null,
      "accountHint": "****4242", "accountLastFour": "4242", "confidence": 0.999}]$$::jsonb,
  p_sender_verified => true,
  p_institution_key => 'BCA_CC'
);
select is(
  (select array_agg(
      row(source.gmail_message_id, item.review_status, item.gmail_auto_confirm_pending)::text
      order by source.gmail_message_id)
    from public.transactions as item
    join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
    where source.gmail_message_id in ('inst-007', 'inst-008', 'inst-009')),
  array[
    row('inst-007', 'pending', false)::text,
    row('inst-008', 'pending', true)::text,
    row('inst-009', 'pending', false)::text
  ],
  'below 50 percent and missing original dates never qualify'
);

select is(
  (select row(item.occurred_on, item.flow_direction)::text
    from public.transactions as item
    join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
    where source.gmail_message_id = 'inst-009'),
  row(null::date, 'out')::text,
  'missing email dates remain unknown and expenses retain outflow direction'
);

-- Categorization write-back.
select is(
  (select row(applied, review_status)::text
    from public.set_imported_category((select transaction_ids[1] from recorded_001), (select id from public.categories where user_id='10000000-0000-4000-8000-000000000001' and slug='resto-cafe'), 'expense', 0.99)),
  row(true, 'confirmed')::text,
  'categorization fills an empty category with the owner''s own Category'
);
select is(
  (select row(category.slug, item.gmail_auto_confirm_pending)::text
    from public.transactions as item
    join public.categories as category on category.id = item.category_id
    where item.id = (select transaction_ids[1] from recorded_001)),
  row('resto-cafe', false)::text,
  'the owned Category ID matched and the transaction stopped waiting'
);
select is(
  (select applied from public.set_imported_category((select transaction_ids[1] from recorded_001), 'Transport')),
  false,
  'a second result never replaces a Category'
);

create temporary table edited on commit drop as
  select item.id
    from public.transactions as item
    join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
    where source.gmail_message_id = 'inst-002';
update public.transactions set description = 'Edited by the User'
  where id = (select id from edited);
select is(
  (select applied from public.set_imported_category((select id from edited), 'Food & Drinks')),
  false,
  'a transaction the User edited is never categorized automatically'
);
select is(
  (select applied from public.set_imported_category(
    (select item.id from public.transactions as item
      join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
      where source.gmail_message_id = 'inst-003'),
    'Not a category')),
  true,
  'legacy fallback reports the actual applied result'
);

create temporary table qualified on commit drop as
  select item.id
    from public.transactions as item
    join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
    where source.gmail_message_id = 'inst-008';
select is(
  (select row(applied, review_status)::text
    from public.set_imported_category((select id from qualified), 'Not a category')),
  row(true, 'confirmed')::text,
  'a qualifying transaction without a specific Category uses automatic Misc'
);
update public.transactions set description = 'Edited by the User'
  where id = (select id from qualified);
select is(
  (select row(applied, review_status)::text
    from public.set_imported_category((select id from qualified), 'Food & Drinks')),
  row(false, 'confirmed')::text,
  'a confirmed transaction the User edited is not overwritten by categorization'
);

-- New imports do not learn from previously confirmed history.
select public.record_gmail_extraction(
  (select id from public.processed_gmail_messages where gmail_message_id = 'inst-006'),
  'transactions',
  $$[{"kind": "expense", "merchantName": "  KOPI   kenangan ",
      "money": {"amountMinor": "38000", "currency": "IDR"}, "occurredOn": "2026-10-13",
      "occurredTime": null, "description": null, "location": null,
      "accountHint": null, "accountLastFour": "4242", "confidence": 0.95}]$$::jsonb,
  p_sender_verified => true,
  p_institution_key => 'BCA_CC'
);
select is(
  (select row(category.slug, item.review_status, item.gmail_auto_confirm_pending)::text
    from public.transactions as item
    join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
    left join public.categories as category on category.id = item.category_id
    where source.gmail_message_id = 'inst-006'),
  row(null::text, 'pending', true)::text,
  'merchant history is not used as implicit learning on new imports'
);
select is(
  (select cardinality(uncategorized_transaction_ids) from public.record_gmail_extraction(
    (select id from public.processed_gmail_messages where gmail_message_id = 'inst-006'),
    'skipped', '[]'::jsonb, p_sender_verified => false)),
  1,
  'a recorded message exposes still-pending category work for enqueue recovery'
);

-- Shared merchant cache.
select is(
  (select status from public.claim_merchant_profile('kopi kenangan')),
  'claimed',
  'the first job for a merchant claims the search'
);
select is(
  (select status from public.claim_merchant_profile('kopi kenangan')),
  'busy',
  'other jobs wait while it searches'
);
select public.save_merchant_profile('kopi kenangan', 'Coffee shop chain');
select is(
  (select row(status, summary)::text from public.claim_merchant_profile('kopi kenangan')),
  row('ready', 'Coffee shop chain')::text,
  'a saved search is reused by every User'
);
select public.claim_merchant_profile('toko gagal');
select public.release_merchant_profile('toko gagal');
select is(
  (select status from public.claim_merchant_profile('toko gagal')),
  'claimed',
  'a released claim can be searched again at once'
);

reset role;

select * from finish();

rollback;
