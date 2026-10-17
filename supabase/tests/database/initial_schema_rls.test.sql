begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

grant usage on schema extensions to anon, authenticated;

select plan(55);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'financial_accounts', 'financial_accounts exists');
select has_table('public', 'categories', 'categories exists');
select has_table('public', 'gmail_connections', 'gmail_connections exists');
select has_table('public', 'processed_gmail_messages', 'processed_gmail_messages exists');
select has_table('public', 'transactions', 'transactions exists');
select has_table('public', 'budgets', 'budgets exists');
select has_table('public', 'recurring_bills', 'recurring_bills exists');
select has_table('public', 'reminder_preferences', 'reminder_preferences exists');
select has_table('public', 'reminders', 'reminders exists');
select has_table('public', 'reminder_deliveries', 'reminder_deliveries exists');
select has_table('public', 'whatsapp_links', 'whatsapp_links exists');
select has_table('public', 'agent_action_logs', 'agent_action_logs exists');
select has_table('public', 'agent_action_states', 'agent_action_states exists');

select is(
  (
    select count(*)
    from pg_constraint
    where conname = any(array[
      'processed_gmail_messages_gmail_connection_id_user_id_fkey',
      'transactions_processed_gmail_message_id_user_id_fkey',
      'transactions_financial_account_id_user_id_fkey',
      'transactions_category_id_user_id_fkey',
      'transactions_recurring_bill_id_user_id_fkey',
      'budgets_category_id_user_id_fkey',
      'recurring_bills_financial_account_id_user_id_fkey',
      'reminders_budget_id_user_id_fkey',
      'reminders_recurring_bill_id_user_id_fkey',
      'agent_action_logs_reversed_action_id_user_id_fkey'
    ])
      and condeferrable
      and condeferred
  ),
  10::bigint,
  'owned composite references defer checks until the cascade transaction ends'
);

select is(
  (
    select count(*)
    from auth.users
    where id in (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002'
    )
  ),
  2::bigint,
  'both synthetic Auth users are seeded'
);

select is(
  (
    select count(*)
    from auth.users
    where id in (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002'
    )
      and (
        confirmation_token is null
        or recovery_token is null
        or email_change is null
        or email_change_token_new is null
        or email_change_token_current is null
        or phone_change is null
        or phone_change_token is null
      )
  ),
  0::bigint,
  'seeded Auth users use non-null GoTrue token placeholders'
);

select col_type_is('public', 'transactions', 'amount', 'numeric', 'transaction amount uses exact numeric');
select col_type_is('public', 'budgets', 'limit_amount', 'numeric', 'budget amount uses exact numeric');
select col_type_is('public', 'recurring_bills', 'expected_amount', 'numeric', 'bill amount uses exact numeric');
select hasnt_column('public', 'financial_accounts', 'balance', 'accounts do not store balance');
select hasnt_column('public', 'processed_gmail_messages', 'raw_body', 'raw email bodies are not stored');
select hasnt_column('public', 'processed_gmail_messages', 'subject', 'email subjects are not stored');

select ok(
  (
    select bool_and(c.relrowsecurity and c.relforcerowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(array[
        'profiles',
        'financial_accounts',
        'categories',
        'gmail_connections',
        'processed_gmail_messages',
        'transactions',
        'budgets',
        'recurring_bills',
        'reminder_preferences',
        'reminders',
        'reminder_deliveries',
        'whatsapp_links',
        'agent_action_logs',
        'agent_action_states'
      ])
  ),
  'every public product table enables and forces RLS'
);

select ok(
  (
    select bool_and(not has_table_privilege('authenticated', c.oid, 'select'))
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(array[
        'gmail_connections',
        'processed_gmail_messages',
        'reminder_deliveries',
        'whatsapp_links',
        'agent_action_logs',
        'agent_action_states'
      ])
  ),
  'authenticated clients cannot read backend-only connection and action tables'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_gmail_message(uuid,text,timestamp with time zone)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.record_gmail_extraction(uuid,text,jsonb,boolean,text)',
    'execute'
  )
  and to_regprocedure('public.record_gmail_extraction(uuid,text,jsonb)') is null
  and not has_function_privilege(
    'authenticated',
    'public.mark_gmail_connection_synced(uuid,timestamp with time zone)',
    'execute'
  ),
  'authenticated clients cannot execute Gmail ingestion operations and the unverified overload is absent'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a0000000-0000-4000-8000-000000000001', 'owner@test.monara.local', '{"full_name":"Owner"}'),
  ('b0000000-0000-4000-8000-000000000002', 'stranger@test.monara.local', '{"full_name":"Stranger"}');

select is(
  (select count(*)::integer from public.categories where user_id = 'a0000000-0000-4000-8000-000000000001'),
  15,
  'new users receive 15 default categories'
);

select is(
  (select display_name from public.profiles where id = 'a0000000-0000-4000-8000-000000000001'),
  'Owner',
  'new users receive a profile'
);

select is(
  (select whatsapp_enabled from public.reminder_preferences where user_id = 'a0000000-0000-4000-8000-000000000001'),
  false,
  'WhatsApp reminders default to opt-out'
);

insert into public.financial_accounts (
  id,
  user_id,
  client_request_id,
  name,
  account_type
)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'account-a-bank',
    'Owner bank',
    'bank'
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    'account-a-wallet',
    'Owner wallet',
    'wallet'
  ),
  (
    'b1000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002',
    'account-b-cash',
    'Stranger cash',
    'cash'
  );

insert into public.gmail_connections (
  id,
  user_id,
  composio_connected_account_id,
  gmail_address
)
values (
  'a2000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'composio-test-owner-1',
  'owner-1@test.monara.local'
);

insert into public.processed_gmail_messages (
  id,
  user_id,
  gmail_connection_id,
  gmail_message_id,
  processing_status,
  received_at,
  processed_at
)
values (
  'a3000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'gmail-test-message-1',
  'processed',
  '2026-10-12T07:00:00+07:00',
  '2026-10-12T07:00:05+07:00'
);

insert into public.transactions (
  id,
  user_id,
  client_request_id,
  financial_account_id,
  category_id,
  source_type,
  transaction_type,
  merchant_name,
  amount,
  currency,
  occurred_on,
  review_status
)
values (
  'a4000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'transaction-owner-confirmed',
  'a1000000-0000-4000-8000-000000000001',
  (select id from public.categories where user_id = 'a0000000-0000-4000-8000-000000000001' and slug = 'food-drinks'),
  'manual_form',
  'expense',
  'Synthetic merchant',
  28000,
  'IDR',
  '2026-10-12',
  'confirmed'
);

insert into public.transactions (
  id,
  user_id,
  processed_gmail_message_id,
  source_item_index,
  source_type,
  transaction_type,
  amount,
  currency,
  occurred_on,
  review_status
)
values (
  'a4000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  0,
  'gmail_email',
  'expense',
  186000,
  'IDR',
  '2026-10-12',
  'pending'
);

set local role anon;

select throws_ok(
  $$select * from public.transactions$$::text,
  '42501'::char(5),
  null::text,
  'anonymous callers cannot read financial data'::text
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from public.transactions),
  2,
  'owner reads only both of their transactions'
);

select is(
  (select coalesce(sum(amount), 0)::numeric(20,0) from public.transactions where review_status = 'confirmed' and deleted_at is null),
  28000::numeric(20,0),
  'confirmed total excludes pending Gmail transactions'
);

select throws_ok(
  $$insert into public.transactions (
      user_id, client_request_id, financial_account_id, source_type,
      transaction_type, merchant_name, amount, currency, occurred_on, review_status
    ) values (
      'a0000000-0000-4000-8000-000000000001', 'browser-write',
      'a1000000-0000-4000-8000-000000000001', 'manual_form',
      'expense', 'Browser write', 1000, 'IDR', '2026-10-12', 'confirmed'
    )$$::text,
  '42501'::char(5),
  null::text,
  'authenticated browser cannot bypass the backend financial writer'::text
);

select throws_ok(
  $$update public.profiles
    set display_name = 'Forged browser update'
    where id = 'a0000000-0000-4000-8000-000000000001'$$::text,
  '42501'::char(5),
  null::text,
  'authenticated browser cannot write even its own profile directly'::text
);

set local request.jwt.claim.sub = 'b0000000-0000-4000-8000-000000000002';

select is_empty(
  $$select id from public.transactions$$,
  'another user cannot read the owner ledger'
);

reset role;

set constraints transactions_financial_account_id_user_id_fkey immediate;

select throws_ok(
  $$insert into public.transactions (
      user_id, client_request_id, financial_account_id, source_type,
      transaction_type, merchant_name, amount, currency, occurred_on, review_status
    ) values (
      'a0000000-0000-4000-8000-000000000001', 'cross-owner-account',
      'b1000000-0000-4000-8000-000000000001', 'manual_form',
      'expense', 'Cross owner', 1000, 'IDR', '2026-10-12', 'confirmed'
    )$$::text,
  '23503'::char(5),
  null::text,
  'a transaction cannot reference another user account'::text
);

set constraints transactions_financial_account_id_user_id_fkey deferred;

insert into public.transactions (
  id,
  user_id,
  client_request_id,
  financial_account_id,
  source_type,
  transaction_type,
  merchant_name,
  amount,
  currency,
  occurred_on,
  review_status
)
values (
  'a4000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000001',
  'historical-wallet-transaction',
  'a1000000-0000-4000-8000-000000000002',
  'manual_form',
  'expense',
  'Historical wallet merchant',
  12000,
  'IDR',
  '2026-10-12',
  'confirmed'
);

update public.financial_accounts
set is_active = false
where id = 'a1000000-0000-4000-8000-000000000002';

select lives_ok(
  $$update public.transactions
    set description = 'Corrected historical note',
        financial_account_id = 'a1000000-0000-4000-8000-000000000002',
        review_status = 'confirmed'
    where id = 'a4000000-0000-4000-8000-000000000003'$$::text,
  'historical transactions remain editable after their account is deactivated'::text
);

select throws_ok(
  $$insert into public.transactions (
      user_id, client_request_id, financial_account_id, source_type,
      transaction_type, merchant_name, amount, currency, occurred_on, review_status
    ) values (
      'a0000000-0000-4000-8000-000000000001', 'inactive-account-write',
      'a1000000-0000-4000-8000-000000000002', 'manual_form',
      'expense', 'Inactive wallet write', 1000, 'IDR', '2026-10-12', 'confirmed'
    )$$::text,
  '23514'::char(5),
  'Confirmed transactions require active Financial Accounts.',
  'new confirmed transactions cannot select an inactive account'::text
);

insert into public.transactions (
  id,
  user_id,
  processed_gmail_message_id,
  source_item_index,
  financial_account_id,
  source_type,
  transaction_type,
  merchant_name,
  amount,
  currency,
  occurred_on,
  review_status
)
values (
  'a4000000-0000-4000-8000-000000000004',
  'a0000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  2,
  'a1000000-0000-4000-8000-000000000002',
  'gmail_email',
  'expense',
  'Pending inactive wallet import',
  1500,
  'IDR',
  '2026-10-12',
  'pending'
);

select throws_ok(
  $$update public.transactions
    set review_status = 'confirmed'
    where id = 'a4000000-0000-4000-8000-000000000004'$$::text,
  '23514'::char(5),
  'Confirmed transactions require active Financial Accounts.',
  'a pending import cannot confirm against an inactive account'::text
);

select lives_ok(
  $$update public.transactions
    set transaction_type = 'exclusion', review_status = 'confirmed'
    where id = 'a4000000-0000-4000-8000-000000000004'$$::text,
  'a pending item can be excluded after its Financial Account is deactivated'::text
);

select throws_ok(
  $$insert into public.transactions (
      user_id, client_request_id, financial_account_id, source_type,
      transaction_type, merchant_name, amount, currency, occurred_on, review_status
    ) values (
      'a0000000-0000-4000-8000-000000000001', 'transaction-owner-confirmed',
      'a1000000-0000-4000-8000-000000000001', 'manual_form',
      'expense', 'Duplicate request', 1000, 'IDR', '2026-10-12', 'confirmed'
    )$$::text,
  '23505'::char(5),
  null::text,
  'client request IDs deduplicate direct transactions'::text
);

select throws_ok(
  $$insert into public.transactions (
      user_id, processed_gmail_message_id, source_item_index, source_type,
      transaction_type, amount, currency, occurred_on, review_status
    ) values (
      'a0000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001', 0, 'gmail_email',
      'expense', 186000, 'IDR', '2026-10-12', 'pending'
    )$$::text,
  '23505'::char(5),
  null::text,
  'a Gmail message item cannot create a duplicate transaction'::text
);

select throws_ok(
  $$insert into public.transactions (
      user_id, processed_gmail_message_id, source_item_index, source_type,
      transaction_type, amount, currency, occurred_on, review_status
    ) values (
      'a0000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001', 1, 'gmail_email',
      'expense', 186000, 'IDR', '2026-10-12', 'confirmed'
    )$$::text,
  '23514'::char(5),
  'Gmail imports must start pending review.',
  'a Gmail import cannot bypass the Review Queue'::text
);

select throws_ok(
  $$update public.transactions
    set review_status = 'pending'
    where id = 'a4000000-0000-4000-8000-000000000001'$$::text,
  '23514'::char(5),
  'Only pending transactions may change review status.',
  'a confirmed transaction cannot re-enter another review state'::text
);

select throws_ok(
  $$insert into public.transactions (
      user_id, client_request_id, financial_account_id,
      source_type, transaction_type, description, amount, currency, occurred_on, review_status
    ) values (
      'a0000000-0000-4000-8000-000000000001', 'removed-transfer-direction',
      'a1000000-0000-4000-8000-000000000001',
      'manual_form', 'transfer', 'Move savings', 50000, 'IDR', '2026-10-12', 'confirmed'
    )$$::text,
  '23514'::char(5),
  null::text,
  'transfer is not a transaction direction'::text
);

select lives_ok(
  $$insert into public.transactions (
      user_id, client_request_id, financial_account_id,
      category_id, source_type, transaction_type, description, amount, currency,
      occurred_on, review_status
    ) values (
      'a0000000-0000-4000-8000-000000000001', 'excluded-reimbursement',
      'a1000000-0000-4000-8000-000000000001',
      (select id from public.categories
        where user_id = 'a0000000-0000-4000-8000-000000000001'
          and slug = 'food-drinks'),
      'manual_form', 'exclusion', 'Reimbursement', 50000, 'IDR', '2026-10-12',
      'confirmed'
    )$$::text,
  'an exclusion reimbursement remains stored without affecting totals'::text
);

select lives_ok(
  $test$do $block$
    declare inserted_id uuid;
    begin
      insert into public.transactions (
        user_id, client_request_id, financial_account_id,
        source_type, transaction_type, description, review_status
      ) values (
        'a0000000-0000-4000-8000-000000000001', 'incomplete-exclusion',
        'a1000000-0000-4000-8000-000000000001',
        'manual_form', null, 'Unusable imported record', 'pending'
      ) returning id into inserted_id;

      update public.transactions
      set transaction_type = 'exclusion', review_status = 'confirmed'
      where id = inserted_id;
    end;
  $block$;$test$::text,
  'an incomplete pending record can become a confirmed exclusion without invented facts'::text
);

select throws_ok(
  $$insert into public.transactions (
      user_id, client_request_id, source_type, transaction_type,
      merchant_name, amount, currency, occurred_on, review_status
    ) values (
      'a0000000-0000-4000-8000-000000000001', 'missing-direct-account',
      'manual_form', 'expense', 'Missing account', 1000, 'IDR', '2026-10-12', 'confirmed'
    )$$::text,
  '23514'::char(5),
  null::text,
  'a direct confirmed expense requires a Financial Account'::text
);

select throws_ok(
  $$insert into public.transactions (
      user_id, client_request_id, source_type, transaction_type,
      merchant_name, review_status
    ) values (
      'a0000000-0000-4000-8000-000000000001', 'missing-pending-direct-account',
      'in_app_chat', 'expense', 'Missing account', 'pending'
    )$$::text,
  '23514'::char(5),
  null::text,
  'a direct pending expense also requires a Financial Account'::text
);

select throws_ok(
  $$insert into public.transactions (
      user_id, client_request_id, financial_account_id, source_type,
      transaction_type, merchant_name, amount, currency, occurred_on, review_status
    ) values (
      'a0000000-0000-4000-8000-000000000001', 'fractional-idr',
      'a1000000-0000-4000-8000-000000000001', 'manual_form',
      'expense', 'Fractional', 28.5, 'IDR', '2026-10-12', 'confirmed'
    )$$::text,
  '23514'::char(5),
  null::text,
  'fractional IDR is rejected rather than rounded'::text
);

insert into public.gmail_connections (
  id,
  user_id,
  composio_connected_account_id,
  gmail_address
)
values
  ('a2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'composio-test-owner-2', 'owner-2@test.monara.local'),
  ('a2000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'composio-test-owner-3', 'owner-3@test.monara.local');

select throws_ok(
  $$insert into public.gmail_connections (
      user_id, composio_connected_account_id, gmail_address
    ) values (
      'a0000000-0000-4000-8000-000000000001',
      'composio-test-owner-4',
      'owner-4@test.monara.local'
    )$$::text,
  '23514'::char(5),
  'A user may have at most three active Gmail connections.',
  'a fourth active Gmail connection is refused'::text
);

insert into public.budgets (
  id,
  user_id,
  category_id,
  client_request_id,
  name,
  cadence,
  limit_amount,
  starts_on
)
values (
  'a5000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  (select id from public.categories where user_id = 'a0000000-0000-4000-8000-000000000001' and slug = 'food-drinks'),
  'budget-owner-food',
  'Food',
  'monthly',
  100000,
  '2026-10-01'
);

select is(
  (select warning_percent from public.budgets where id = 'a5000000-0000-4000-8000-000000000001'),
  80::smallint,
  'budget warning threshold defaults to 80 percent'
);

set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-4000-8000-000000000002';

select is_empty(
  $$select id from public.budgets$$,
  'another user cannot read the owner Budget'
);

reset role;

insert into public.reminders (
  user_id,
  budget_id,
  kind,
  dedupe_key,
  threshold_percent,
  title,
  message,
  scheduled_for
)
values (
  'a0000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'budget_threshold',
  'budget:a5000000-0000-4000-8000-000000000001:2026-10:80',
  80,
  'Budget warning',
  'Food reached 80 percent.',
  '2026-10-12T09:00:00+07:00'
);

select throws_ok(
  $$insert into public.reminders (
      user_id, budget_id, kind, dedupe_key, threshold_percent,
      title, message, scheduled_for
    ) values (
      'a0000000-0000-4000-8000-000000000001',
      'a5000000-0000-4000-8000-000000000001',
      'budget_threshold',
      'budget:a5000000-0000-4000-8000-000000000001:2026-10:80',
      80, 'Duplicate', 'Duplicate warning.', '2026-10-12T09:01:00+07:00'
    )$$::text,
  '23505'::char(5),
  null::text,
  'a budget threshold creates one Reminder per period'::text
);

select lives_ok(
  $$delete from auth.users where id = 'a0000000-0000-4000-8000-000000000001'$$,
  'deleting a User cascades through all owned product data'
);

select * from finish();
rollback;
