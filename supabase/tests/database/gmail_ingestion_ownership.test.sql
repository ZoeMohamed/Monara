begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

grant usage on schema extensions to anon, authenticated;

select plan(19);

-- Seeded synthetic data: User 1 owns active connection 12000000-...-0001.

set local role authenticated;
select throws_ok(
  $$select * from public.claim_gmail_message(
      '12000000-0000-4000-8000-000000000001', 'm-denied', now())$$,
  '42501',
  null,
  'signed-in Users cannot call the agent-only claim function'
);
reset role;

set local role anon;
select throws_ok(
  $$select * from public.record_gmail_extraction(
      '13000000-0000-4000-8000-000000000001', 'skipped', '[]'::jsonb,
      false, null)$$,
  '42501',
  null,
  'anonymous callers cannot record extractions'
);
reset role;

set local role service_role;

create temporary table claimed on commit drop as
  select *
  from public.claim_gmail_message(
    '12000000-0000-4000-8000-000000000001',
    'synthetic-ingest-001',
    '2026-10-13T09:00:00+07:00'
  );

select is(
  (select already_finished from claimed),
  false,
  'a new message is claimed unfinished'
);

select is(
  (
    select processed_message_id
    from public.claim_gmail_message(
      '12000000-0000-4000-8000-000000000001',
      'synthetic-ingest-001',
      '2026-10-13T09:00:00+07:00'
    )
  ),
  (select processed_message_id from claimed),
  'claiming the same message again returns the same row'
);

create temporary table recorded on commit drop as
  select *
  from public.record_gmail_extraction(
    (select processed_message_id from claimed),
    'transactions',
    $$[
      {"kind": "expense", "merchantName": "Synthetic Kopi", "money": {"amountMinor": "25000", "currency": "IDR"},
       "occurredOn": "2026-10-13", "occurredTime": "08:45", "description": null, "location": "Kemang",
       "accountHint": "BCA ****1234", "categoryName": "food & drinks", "confidence": 0.8125},
      {"kind": null, "merchantName": null, "money": null, "occurredOn": null, "occurredTime": null,
       "description": null, "location": null, "accountHint": null, "categoryName": "Not a category",
       "confidence": null}
    ]$$::jsonb,
    p_sender_verified => false,
    p_institution_key => null
  );

select is(
  (select cardinality(transaction_ids) from recorded),
  2,
  'one transaction is created per extracted item'
);

select is(
  (
    select array_agg(source_item_index order by source_item_index)
    from public.transactions
    where processed_gmail_message_id = (select processed_message_id from claimed)
  ),
  array[0, 1],
  'items keep their order as source_item_index'
);

select ok(
  (
    select bool_and(
      review_status = 'pending'
      and source_type = 'gmail_email'
      and user_id = '10000000-0000-4000-8000-000000000001'
      and client_request_id is null
      and financial_account_id is null
    )
    from public.transactions
    where processed_gmail_message_id = (select processed_message_id from claimed)
  ),
  'imported transactions are pending, owned by the connection owner, and unmapped to accounts'
);

select is(
  (
    select category_id
    from public.transactions
    where processed_gmail_message_id = (select processed_message_id from claimed)
      and source_item_index = 0
  ),
  null,
  'untrusted model category names are not written directly'
);

select is(
  (
    select category_id
    from public.transactions
    where processed_gmail_message_id = (select processed_message_id from claimed)
      and source_item_index = 1
  ),
  null,
  'an unknown category name leaves the category empty'
);

select is(
  (
    select occurred_on
    from public.transactions
    where processed_gmail_message_id = (select processed_message_id from claimed)
      and source_item_index = 1
  ),
  date '2026-10-13',
  'an item without a date takes the day its email arrived in Jakarta'
);

select is(
  (
    select row(already_finished, transaction_ids)::text
    from public.record_gmail_extraction(
      (select processed_message_id from claimed),
      'skipped',
      '[]'::jsonb,
      p_sender_verified => false,
      p_institution_key => null
    )
  ),
  (select row(true, transaction_ids)::text from recorded),
  'recording a finished message again changes nothing and returns the same ids'
);

select is(
  (
    select already_finished
    from public.claim_gmail_message(
      '12000000-0000-4000-8000-000000000001',
      'synthetic-ingest-001',
      '2026-10-13T09:00:00+07:00'
    )
  ),
  true,
  'a processed message is never read again'
);

select is(
  (
    select row(imported, imported_transactions)::text
    from public.gmail_connection_sync_counts(
      '10000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000001'
    )
  ),
  (
    select row(
      (select count(*) from public.processed_gmail_messages
        where gmail_connection_id = '12000000-0000-4000-8000-000000000001'
          and processing_status = 'processed'),
      (select count(*) from public.transactions as item
        join public.processed_gmail_messages as source
          on source.id = item.processed_gmail_message_id
        where source.gmail_connection_id = '12000000-0000-4000-8000-000000000001')
    )::text
  ),
  'sync counts report processed emails and the transactions they created'
);

select is_empty(
  $$select * from public.gmail_connection_sync_counts(
      '20000000-0000-4000-8000-000000000002',
      '12000000-0000-4000-8000-000000000001')$$,
  'another User gets no counts for a connection they do not own'
);

select throws_ok(
  $$select * from public.record_gmail_extraction(
      (select processed_message_id from claimed), 'transactions', '[]'::jsonb,
      false, null)$$,
  '22023',
  null,
  'a transactions outcome needs items'
);

select public.mark_gmail_connection_synced(
  '12000000-0000-4000-8000-000000000001',
  '2026-10-13T10:00:00+07:00'
);
select public.mark_gmail_connection_synced(
  '12000000-0000-4000-8000-000000000001',
  '2026-10-13T09:00:00+07:00'
);
select is(
  (
    select last_synced_at
    from public.gmail_connections
    where id = '12000000-0000-4000-8000-000000000001'
  ),
  '2026-10-13T10:00:00+07:00'::timestamptz,
  'a late older sync never moves last_synced_at backwards'
);

update public.gmail_connections
  set status = 'disconnected'
  where id = '12000000-0000-4000-8000-000000000001';

select throws_ok(
  $$select * from public.claim_gmail_message(
      '12000000-0000-4000-8000-000000000001', 'synthetic-ingest-002', now())$$,
  'P0002',
  null,
  'an inactive connection cannot claim messages'
);

select throws_ok(
  $$select * from public.record_gmail_extraction(
      (select processed_message_id from claimed), 'skipped', '[]'::jsonb,
      false, null)$$,
  'P0002',
  null,
  'an inactive connection cannot record extractions'
);

select throws_ok(
  $$select public.mark_gmail_connection_synced(
      '12000000-0000-4000-8000-000000000001', now())$$,
  'P0002',
  null,
  'an inactive connection is not marked synced'
);

reset role;

select * from finish();

rollback;
