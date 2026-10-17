begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

grant usage on schema extensions to anon, authenticated;

select plan(10);

-- Seeded synthetic data: User 1 owns active connection 12000000-...-0001 and the
-- accounts "Daily bank" (11000000-...-0001, 4242) and "Daily wallet". User 2 owns
-- account 21000000-...-0001. Two more synthetic mailboxes are added here.

set local role service_role;

insert into public.gmail_connections (id, user_id, composio_connected_account_id, gmail_address)
values
  ('12000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   'mailbox-test-second', 'second.mailbox@monara.local'),
  ('22000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
   'mailbox-test-other-user', 'other.user@monara.local');

select throws_ok(
  $$update public.financial_accounts
      set gmail_connection_id = '22000000-0000-4000-8000-000000000001'
      where id = '11000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'an account can never be linked to another User''s mailbox'
);

update public.gmail_connections set status = 'error'
  where id = '12000000-0000-4000-8000-000000000002';
select throws_ok(
  $$update public.financial_accounts
      set gmail_connection_id = '12000000-0000-4000-8000-000000000002'
      where id = '11000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'an account can only be linked to an active mailbox'
);
update public.gmail_connections set status = 'active'
  where id = '12000000-0000-4000-8000-000000000002';

-- "Daily bank" is fed by the first mailbox; a second BCA card by the second mailbox.
update public.financial_accounts
  set institution_key = 'BCA_CC', gmail_connection_id = '12000000-0000-4000-8000-000000000001'
  where id = '11000000-0000-4000-8000-000000000001';
insert into public.financial_accounts (
  id, user_id, client_request_id, name, institution, account_type, last_four,
  institution_key, gmail_connection_id
) values (
  '11000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001',
  'mailbox-second-card', 'Second mailbox card', 'BCA', 'bank', '9999', 'BCA_CC',
  '12000000-0000-4000-8000-000000000002'
);

select is(
  public.gmail_item_account(
    '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001',
    'BCA_CC', 'expense', null
  ),
  '11000000-0000-4000-8000-000000000001'::uuid,
  'an email maps only to the account fed by its own mailbox'
);
select is(
  public.gmail_item_account(
    '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002',
    'BCA_CC', 'expense', '4242'
  ),
  null::uuid,
  'another mailbox''s account never matches, even by its card ending'
);

-- Recording an email from the second mailbox maps to the second mailbox's card.
select public.claim_gmail_messages(
  '12000000-0000-4000-8000-000000000002',
  $$[{"gmailMessageId": "mailbox-001", "receivedAt": "2026-10-13T09:00:00+07:00"}]$$::jsonb
);
select public.record_gmail_extraction(
  (select id from public.processed_gmail_messages where gmail_message_id = 'mailbox-001'),
  'transactions',
  $$[{"kind": "expense", "merchantName": "Toko Contoh",
      "money": {"amountMinor": "10000", "currency": "IDR"}, "occurredOn": "2026-10-13",
      "occurredTime": null, "description": null, "location": null,
      "accountHint": null, "accountLastFour": null, "confidence": 0.5}]$$::jsonb,
  p_sender_verified => true,
  p_institution_key => 'BCA_CC'
);
select is(
  (select item.financial_account_id
    from public.transactions as item
    join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
    where source.gmail_message_id = 'mailbox-001'),
  '11000000-0000-4000-8000-000000000010'::uuid,
  'a recorded email takes the account of the mailbox it came from'
);

-- An errored connection keeps its links; disconnecting unlinks them.
update public.gmail_connections set status = 'error'
  where id = '12000000-0000-4000-8000-000000000002';
select is(
  (select gmail_connection_id from public.financial_accounts
    where id = '11000000-0000-4000-8000-000000000010'),
  '12000000-0000-4000-8000-000000000002'::uuid,
  'a mailbox in error keeps its accounts linked until it is reconnected'
);
update public.gmail_connections set status = 'disconnected'
  where id = '12000000-0000-4000-8000-000000000002';
select is(
  (select row(gmail_connection_id, is_active)::text from public.financial_accounts
    where id = '11000000-0000-4000-8000-000000000010'),
  row(null::uuid, true)::text,
  'disconnecting a mailbox unlinks its accounts and keeps them'
);
select is(
  (select count(*) from public.transactions as item
    join public.processed_gmail_messages as source on source.id = item.processed_gmail_message_id
    where source.gmail_message_id = 'mailbox-001'),
  1::bigint,
  'transactions imported from a disconnected mailbox stay'
);
select lives_ok(
  $$update public.financial_accounts set gmail_connection_id = null
      where id = '11000000-0000-4000-8000-000000000001'$$,
  'an account can always be made manual-only'
);

reset role;

set local role authenticated;
select throws_ok(
  $$select composio_trigger_id from public.gmail_connections$$,
  '42501',
  null,
  'signed-in Users cannot read mailbox trigger ids'
);
reset role;

select * from finish();

rollback;
