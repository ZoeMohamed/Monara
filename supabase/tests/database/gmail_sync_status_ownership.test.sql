begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

grant usage on schema extensions to anon, authenticated;

select plan(25);

-- Seeded synthetic data: User 1 owns active connection 12000000-...-0001 and the
-- accounts "Daily bank" (4242) and "Daily wallet" (1234). User 2 owns neither.

set local role authenticated;
select throws_ok(
  $$select public.request_gmail_sync(
      '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'signed-in Users cannot mark syncs directly'
);
select throws_ok(
  $$select * from public.gmail_sync_statuses('10000000-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'signed-in Users cannot read sync statuses directly'
);
reset role;

set local role service_role;

update public.financial_accounts
  set institution_key = 'BCA_CC', gmail_connection_id = '12000000-0000-4000-8000-000000000001'
  where id = '11000000-0000-4000-8000-000000000001';

select is(
  (
    select state
    from public.gmail_sync_statuses('10000000-0000-4000-8000-000000000001')
    where connection_id = '12000000-0000-4000-8000-000000000001'
  ),
  'idle',
  'a connection that never synced is idle'
);

select throws_ok(
  $$select public.request_gmail_sync(
      '20000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000001')$$,
  'P0002',
  null,
  'another User cannot request a sync of a connection they do not own'
);

select is_empty(
  $$select * from public.gmail_sync_statuses('20000000-0000-4000-8000-000000000002')
      where connection_id = '12000000-0000-4000-8000-000000000001'$$,
  'another User never sees the connection''s sync status'
);

create temporary table requested on commit drop as
  select public.request_gmail_sync(
    '10000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000001'
  ) as requested_at;

select is(
  (
    select state
    from public.gmail_sync_statuses('10000000-0000-4000-8000-000000000001')
    where connection_id = '12000000-0000-4000-8000-000000000001'
  ),
  'queued',
  'a requested sync is queued'
);

select throws_ok(
  $$select public.request_gmail_sync(
      '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001')$$,
  '55000',
  null,
  'a second request while one is queued is refused'
);

select public.start_gmail_sync('12000000-0000-4000-8000-000000000001');

select is(
  public.claim_gmail_messages(
    '12000000-0000-4000-8000-000000000001',
    $$[
      {"gmailMessageId": "sync-001", "receivedAt": "2026-10-13T09:00:00+07:00"},
      {"gmailMessageId": "sync-002", "receivedAt": "2026-10-13T09:05:00+07:00"},
      {"gmailMessageId": "sync-003", "receivedAt": "2026-10-13T09:10:00+07:00"},
      {"gmailMessageId": "sync-004", "receivedAt": "2026-10-13T09:15:00+07:00"}
    ]$$::jsonb
  ),
  4,
  'claiming a listed page reports every new message as pending'
);

select public.mark_gmail_connection_synced(
  '12000000-0000-4000-8000-000000000001',
  '2026-10-13T10:00:00+07:00'
);

select is(
  (
    select row(state, in_progress)::text
    from public.gmail_sync_statuses('10000000-0000-4000-8000-000000000001')
    where connection_id = '12000000-0000-4000-8000-000000000001'
  ),
  row('running', 4::bigint)::text,
  'a listed sync keeps running while its messages are being extracted'
);

-- A confident, complete expense naming one of the owner's accounts.
select public.record_gmail_extraction(
  (select id from public.processed_gmail_messages where gmail_message_id = 'sync-001'),
  'transactions',
  $$[{"kind": "expense", "merchantName": "Synthetic Kopi",
      "money": {"amountMinor": "25000", "currency": "IDR"}, "occurredOn": "2026-10-13",
      "occurredTime": null, "description": null, "location": null,
      "accountHint": "Demo Bank ****4242", "accountLastFour": "4242",
      "categoryName": null, "confidence": 0.95}]$$::jsonb,
  p_sender_verified => true,
  p_institution_key => 'BCA_CC'
);

select is(
  (
    select row(item.review_status, account.name, item.gmail_auto_confirm_pending)::text
    from public.transactions as item
    join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
    left join public.financial_accounts as account on account.id = item.financial_account_id
    where source.gmail_message_id = 'sync-001'
  ),
  row('pending', 'Daily bank', true)::text,
  'a confident complete item maps its account and confirms once categorization gives it a Category'
);

-- The same item below the confidence threshold.
select public.record_gmail_extraction(
  (select id from public.processed_gmail_messages where gmail_message_id = 'sync-002'),
  'transactions',
  $$[{"kind": "expense", "merchantName": "Synthetic Kopi",
      "money": {"amountMinor": "25000", "currency": "IDR"}, "occurredOn": "2026-10-13",
      "occurredTime": null, "description": null, "location": null,
      "accountHint": "Demo Bank ****4242", "accountLastFour": "4242",
      "categoryName": null, "confidence": 0.89}]$$::jsonb,
  p_sender_verified => true,
  p_institution_key => 'BCA_CC'
);

select is(
  (
    select row(item.review_status, item.financial_account_id is not null)::text
    from public.transactions as item
    join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
    where source.gmail_message_id = 'sync-002'
  ),
  row('pending', true)::text,
  'below the threshold the account is kept but the item waits for review'
);

-- Confident, but no account, and an exclusion naming an account.
select public.record_gmail_extraction(
  (select id from public.processed_gmail_messages where gmail_message_id = 'sync-003'),
  'transactions',
  $$[{"kind": "expense", "merchantName": "Synthetic Kopi",
      "money": {"amountMinor": "25000", "currency": "IDR"}, "occurredOn": "2026-10-13",
      "occurredTime": null, "description": null, "location": null,
      "accountHint": null, "accountLastFour": null,
      "categoryName": null, "confidence": 0.99},
     {"kind": "exclusion", "merchantName": null,
      "money": {"amountMinor": "50000", "currency": "IDR"}, "occurredOn": "2026-10-13",
      "occurredTime": null, "description": "Top up", "location": null,
      "accountHint": null, "accountLastFour": null,
      "categoryName": null, "confidence": 0.99}]$$::jsonb,
  p_sender_verified => true,
  p_institution_key => 'UNKNOWN_BANK'
);

select is(
  (
    select array_agg(row(item.review_status, item.financial_account_id)::text
      order by item.source_item_index)
    from public.transactions as item
    join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
    where source.gmail_message_id = 'sync-003'
  ),
  array[row('pending', null::uuid)::text, row('pending', null::uuid)::text],
  'another User''s account never maps, and exclusions are never mapped or auto-confirmed'
);

select lives_ok(
  $$update public.transactions as item
    set review_status = 'confirmed'
    from public.processed_gmail_messages as source
    where source.id = item.processed_gmail_message_id
      and source.gmail_message_id = 'sync-003'
      and item.transaction_type = 'exclusion'$$::text,
  'a reviewed Gmail exclusion can be confirmed without becoming a financial transaction'
);

-- Categorization gives the qualifying item its Category, which confirms it.
select public.set_imported_category(
  (select item.id
    from public.transactions as item
    join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
    where source.gmail_message_id = 'sync-001'),
  'Food & Drinks'
);

select is(
  (
    select row(state, imported, imported_transactions, confirmed_transactions, in_progress)::text
    from public.gmail_sync_statuses('10000000-0000-4000-8000-000000000001')
    where connection_id = '12000000-0000-4000-8000-000000000001'
  ),
  row('running', 3::bigint, 4::bigint, 1::bigint, 1::bigint)::text,
  'counts cover this sync and separate confirmed transactions'
);

select public.record_gmail_extraction(
  (select id from public.processed_gmail_messages where gmail_message_id = 'sync-004'),
  'skipped',
  '[]'::jsonb,
  p_sender_verified => false,
  p_institution_key => null
);

select is(
  (
    select row(state, error, skipped, in_progress)::text
    from public.gmail_sync_statuses('10000000-0000-4000-8000-000000000001')
    where connection_id = '12000000-0000-4000-8000-000000000001'
  ),
  row('completed', null::text, 1::bigint, 0::bigint)::text,
  'a listed sync with nothing left to extract is completed'
);

select is(
  public.claim_gmail_messages(
    '12000000-0000-4000-8000-000000000001',
    $$[{"gmailMessageId": "sync-001", "receivedAt": "2026-10-13T09:00:00+07:00"}]$$::jsonb
  ),
  0,
  'claiming an already processed message leaves it finished'
);

select lives_ok(
  $$select public.request_gmail_sync(
      '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001')$$,
  'a completed sync can be requested again'
);

-- An older request failing late never overwrites the newer one.
select public.fail_gmail_sync(
  '12000000-0000-4000-8000-000000000001',
  'agent_unavailable',
  (select requested_at from requested)
);
select is(
  (
    select state
    from public.gmail_sync_statuses('10000000-0000-4000-8000-000000000001')
    where connection_id = '12000000-0000-4000-8000-000000000001'
  ),
  'queued',
  'a stale failure does not overwrite a newer request'
);

-- Age the queued request and every message it could count as progress.
update public.processed_gmail_messages
  set created_at = statement_timestamp() - interval '1 day',
    processed_at = statement_timestamp() - interval '1 day'
  where gmail_connection_id = '12000000-0000-4000-8000-000000000001'
    and processing_status <> 'processing';
update public.gmail_connections
  set sync_updated_at = statement_timestamp() - interval '11 minutes',
    sync_requested_at = statement_timestamp() - interval '11 minutes'
  where id = '12000000-0000-4000-8000-000000000001';

select is(
  (
    select row(state, error)::text
    from public.gmail_sync_statuses('10000000-0000-4000-8000-000000000001')
    where connection_id = '12000000-0000-4000-8000-000000000001'
  ),
  row('failed', 'stalled')::text,
  'a sync with no progress for too long is reported as stalled'
);

select lives_ok(
  $$select public.request_gmail_sync(
      '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001')$$,
  'a stalled sync can be requested again'
);

select public.fail_gmail_sync('12000000-0000-4000-8000-000000000001', 'gmail_unavailable');
select is(
  (
    select row(state, error)::text
    from public.gmail_sync_statuses('10000000-0000-4000-8000-000000000001')
    where connection_id = '12000000-0000-4000-8000-000000000001'
  ),
  row('failed', 'gmail_unavailable')::text,
  'an agent failure is reported with its reason'
);

select throws_ok(
  $$select public.fail_gmail_sync('12000000-0000-4000-8000-000000000001', 'anything')$$,
  '23514',
  null,
  'only known sync errors are stored'
);

update public.gmail_connections
  set status = 'disconnected'
  where id = '12000000-0000-4000-8000-000000000001';

select throws_ok(
  $$select public.start_gmail_sync('12000000-0000-4000-8000-000000000001')$$,
  'P0002',
  null,
  'an inactive connection cannot start a sync'
);

select throws_ok(
  $$select public.claim_gmail_messages('12000000-0000-4000-8000-000000000001', '[]'::jsonb)$$,
  'P0002',
  null,
  'an inactive connection cannot claim messages'
);

select throws_ok(
  $$select public.request_gmail_sync(
      '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001')$$,
  'P0002',
  null,
  'an inactive connection cannot be synced'
);

reset role;

select * from finish();

rollback;
