-- Synthetic local development data only. No real people, email content, or credentials.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  phone_change,
  phone_change_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'zoe.demo@monara.local',
    '',
    statement_timestamp(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Zoe Demo"}'::jsonb,
    statement_timestamp(),
    statement_timestamp(),
    '',
    '',
    '',
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'teammate.demo@monara.local',
    '',
    statement_timestamp(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Teammate Demo"}'::jsonb,
    statement_timestamp(),
    statement_timestamp(),
    '',
    '',
    '',
    '',
    '',
    '',
    ''
  );

insert into public.financial_accounts (
  id,
  user_id,
  client_request_id,
  name,
  institution,
  account_type,
  last_four
)
values
  (
    '11000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'seed-account-bank',
    'Daily bank',
    'Monara Demo Bank',
    'bank',
    '4242'
  ),
  (
    '11000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'seed-account-wallet',
    'Daily wallet',
    'Demo Wallet',
    'wallet',
    '1234'
  ),
  (
    '21000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    'seed-account-other-user',
    'Other user account',
    null,
    'cash',
    null
  );

insert into public.gmail_connections (
  id,
  user_id,
  composio_connected_account_id,
  gmail_address,
  status,
  last_synced_at
)
values (
  '12000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'seed-composio-connected-account',
  'zoe.demo@monara.local',
  'active',
  '2026-10-12T08:00:00+07:00'
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
  '13000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  'synthetic-gmail-message-001',
  'processed',
  '2026-10-11T20:00:00+07:00',
  '2026-10-11T20:00:05+07:00'
);

insert into public.transactions (
  id,
  user_id,
  processed_gmail_message_id,
  source_item_index,
  client_request_id,
  financial_account_id,
  category_id,
  source_type,
  transaction_type,
  merchant_name,
  amount,
  currency,
  occurred_on,
  occurred_time,
  description,
  ai_confidence,
  review_status
)
values
  (
    '14000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    null,
    null,
    'seed-confirmed-expense',
    '11000000-0000-4000-8000-000000000002',
    (select id from public.categories where user_id = '10000000-0000-4000-8000-000000000001' and slug = 'resto-cafe'),
    'manual_form',
    'expense',
    'Synthetic Coffee',
    28000,
    'IDR',
    '2026-10-12',
    '08:30:00',
    'Synthetic confirmed expense',
    null,
    'confirmed'
  ),
  (
    '14000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001',
    0,
    null,
    null,
    (select id from public.categories where user_id = '10000000-0000-4000-8000-000000000001' and slug = 'digital'),
    'gmail_email',
    'expense',
    'Synthetic Streaming',
    186000,
    'IDR',
    '2026-10-11',
    null,
    null,
    0.920,
    'pending'
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
  '15000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  (select id from public.categories where user_id = '10000000-0000-4000-8000-000000000001' and slug = 'resto-cafe'),
  'seed-food-budget',
  'Food & Drinks',
  'monthly',
  1000000,
  '2026-10-01'
);

insert into public.recurring_bills (
  id,
  user_id,
  financial_account_id,
  client_request_id,
  merchant_name,
  expected_amount,
  interval_count,
  interval_unit,
  next_due_on,
  cancellation_url,
  ai_confidence
)
values (
  '16000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'seed-recurring-bill',
  'Synthetic Streaming',
  186000,
  1,
  'month',
  '2026-11-01',
  'https://example.com/cancel',
  0.920
);

insert into public.reminders (
  id,
  user_id,
  recurring_bill_id,
  kind,
  dedupe_key,
  offset_days,
  title,
  message,
  scheduled_for
)
values (
  '17000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000001',
  'bill_due',
  'bill:16000000-0000-4000-8000-000000000001:2026-11-01:3',
  3,
  'Upcoming bill',
  'Synthetic Streaming is due soon.',
  '2026-10-29T09:00:00+07:00'
);
