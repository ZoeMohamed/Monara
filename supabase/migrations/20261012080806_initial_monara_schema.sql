do $$
begin
  if exists (select 1 from auth.users limit 1)
    or exists (select 1 from public.profiles limit 1)
    or exists (select 1 from public.financial_accounts limit 1)
    or exists (select 1 from public.gmail_connections limit 1)
    or exists (select 1 from public.gmail_messages limit 1)
    or exists (select 1 from public.transactions limit 1)
    or exists (select 1 from public.whatsapp_links limit 1)
  then
    raise exception using
      errcode = '55000',
      message = 'Legacy Monara schema contains user data; refusing destructive replacement.';
  end if;
end;
$$;

drop table public.transactions;
drop table public.gmail_messages;
drop table public.gmail_connections;
drop table public.financial_accounts;
drop table public.whatsapp_links;
drop table public.profiles;
drop function private.set_updated_at();

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  timezone text not null default 'Asia/Jakarta' check (char_length(btrim(timezone)) between 1 and 100),
  currency text not null default 'IDR' check (currency = 'IDR'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_request_id text not null check (char_length(btrim(client_request_id)) between 1 and 200),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  institution text check (institution is null or char_length(btrim(institution)) between 1 and 150),
  account_type text not null check (account_type in ('bank', 'wallet', 'cash')),
  currency text not null default 'IDR' check (currency = 'IDR'),
  last_four text check (last_four is null or last_four ~ '^[0-9]{4}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, user_id),
  unique (user_id, client_request_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  icon text not null check (char_length(btrim(icon)) between 1 and 100),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_default boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, user_id),
  unique (user_id, slug)
);

create table public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  composio_connected_account_id text not null unique
    check (char_length(btrim(composio_connected_account_id)) between 1 and 300),
  gmail_address text not null check (
    gmail_address = lower(gmail_address)
    and char_length(gmail_address) between 3 and 320
  ),
  status text not null default 'active' check (status in ('active', 'disconnected', 'error')),
  last_synced_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, user_id),
  unique (user_id, gmail_address)
);

create table public.processed_gmail_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  gmail_connection_id uuid not null,
  gmail_message_id text not null check (char_length(btrim(gmail_message_id)) between 1 and 500),
  processing_status text not null default 'processing'
    check (processing_status in ('processing', 'processed', 'skipped', 'failed')),
  received_at timestamptz not null,
  processed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, user_id),
  unique (gmail_connection_id, gmail_message_id),
  foreign key (gmail_connection_id, user_id)
    references public.gmail_connections (id, user_id) on delete restrict,
  check (
    (processing_status = 'processing' and processed_at is null)
    or (processing_status <> 'processing' and processed_at is not null)
  )
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  processed_gmail_message_id uuid,
  source_item_index integer,
  client_request_id text check (
    client_request_id is null or char_length(btrim(client_request_id)) between 1 and 200
  ),
  financial_account_id uuid,
  from_financial_account_id uuid,
  to_financial_account_id uuid,
  category_id uuid,
  recurring_bill_id uuid,
  source_type text not null check (
    source_type in (
      'manual_form',
      'gmail_email',
      'in_app_chat',
      'whatsapp_text',
      'whatsapp_receipt',
      'whatsapp_voice'
    )
  ),
  transaction_type text check (transaction_type in ('expense', 'income', 'transfer')),
  merchant_name text check (
    merchant_name is null or char_length(btrim(merchant_name)) between 1 and 200
  ),
  amount numeric check (
    amount is null
    or (
      amount > 0
      and amount < 100000000000000000000
      and amount = trunc(amount)
    )
  ),
  currency text check (currency is null or currency = 'IDR'),
  occurred_on date,
  occurred_time time,
  description text check (description is null or char_length(btrim(description)) between 1 and 1000),
  location text check (location is null or char_length(btrim(location)) between 1 and 300),
  account_hint text check (account_hint is null or char_length(btrim(account_hint)) between 1 and 200),
  ai_confidence numeric(4, 3) check (ai_confidence is null or ai_confidence between 0 and 1),
  review_status text not null check (review_status in ('pending', 'confirmed', 'rejected')),
  deleted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, user_id),
  foreign key (processed_gmail_message_id, user_id)
    references public.processed_gmail_messages (id, user_id) on delete restrict,
  foreign key (financial_account_id, user_id)
    references public.financial_accounts (id, user_id) on delete restrict,
  foreign key (from_financial_account_id, user_id)
    references public.financial_accounts (id, user_id) on delete restrict,
  foreign key (to_financial_account_id, user_id)
    references public.financial_accounts (id, user_id) on delete restrict,
  foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete restrict,
  check (
    (source_type = 'gmail_email' and processed_gmail_message_id is not null and source_item_index >= 0)
    or (
      source_type <> 'gmail_email'
      and processed_gmail_message_id is null
      and source_item_index is null
    )
  ),
  check (
    (source_type = 'gmail_email' and client_request_id is null)
    or (source_type <> 'gmail_email' and client_request_id is not null)
  ),
  check (
    review_status <> 'confirmed'
    or (
      transaction_type is not null
      and amount is not null
      and currency = 'IDR'
      and occurred_on is not null
    )
  ),
  check (
    (transaction_type = 'transfer'
      and financial_account_id is null
      and (
        review_status <> 'confirmed'
        or (
          from_financial_account_id is not null
          and to_financial_account_id is not null
        )
      )
      and (
        from_financial_account_id is null
        or to_financial_account_id is null
        or from_financial_account_id <> to_financial_account_id
      )
    )
    or (
      transaction_type is distinct from 'transfer'
      and from_financial_account_id is null
      and to_financial_account_id is null
    )
  ),
  check (
    source_type = 'gmail_email'
    or transaction_type is not distinct from 'transfer'
    or (
      financial_account_id is not null
      and (merchant_name is not null or description is not null)
    )
  )
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null,
  client_request_id text not null check (char_length(btrim(client_request_id)) between 1 and 200),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  cadence text not null check (cadence in ('weekly', 'monthly')),
  limit_amount numeric not null check (
    limit_amount > 0
    and limit_amount < 100000000000000000000
    and limit_amount = trunc(limit_amount)
  ),
  currency text not null default 'IDR' check (currency = 'IDR'),
  warning_percent smallint not null default 80 check (warning_percent between 1 and 100),
  starts_on date not null,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, user_id),
  unique (user_id, client_request_id),
  foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete restrict
);

create table public.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  financial_account_id uuid,
  client_request_id text not null check (char_length(btrim(client_request_id)) between 1 and 200),
  merchant_name text not null check (char_length(btrim(merchant_name)) between 1 and 200),
  expected_amount numeric not null check (
    expected_amount > 0
    and expected_amount < 100000000000000000000
    and expected_amount = trunc(expected_amount)
  ),
  currency text not null default 'IDR' check (currency = 'IDR'),
  interval_count smallint not null check (interval_count between 1 and 365),
  interval_unit text not null check (interval_unit in ('day', 'week', 'month')),
  next_due_on date not null,
  status text not null default 'active' check (status in ('active', 'dismissed')),
  cancellation_url text check (
    cancellation_url is null
    or (
      cancellation_url ~* '^https://'
      and char_length(cancellation_url) <= 2000
    )
  ),
  ai_confidence numeric(4, 3) check (ai_confidence is null or ai_confidence between 0 and 1),
  deleted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, user_id),
  unique (user_id, client_request_id),
  foreign key (financial_account_id, user_id)
    references public.financial_accounts (id, user_id) on delete restrict
);

alter table public.transactions
  add foreign key (recurring_bill_id, user_id)
  references public.recurring_bills (id, user_id) on delete restrict;

create table public.reminder_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  whatsapp_enabled boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  budget_id uuid,
  recurring_bill_id uuid,
  kind text not null check (kind in ('budget_threshold', 'bill_due')),
  status text not null default 'unread' check (status in ('unread', 'read', 'dismissed')),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 300),
  threshold_percent smallint check (threshold_percent between 1 and 100),
  offset_days smallint check (offset_days between 0 and 365),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  scheduled_for timestamptz not null,
  read_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, user_id),
  unique (user_id, dedupe_key),
  foreign key (budget_id, user_id)
    references public.budgets (id, user_id) on delete restrict,
  foreign key (recurring_bill_id, user_id)
    references public.recurring_bills (id, user_id) on delete restrict,
  check (
    (
      kind = 'budget_threshold'
      and budget_id is not null
      and recurring_bill_id is null
      and threshold_percent is not null
      and offset_days is null
    )
    or (
      kind = 'bill_due'
      and recurring_bill_id is not null
      and budget_id is null
      and offset_days is not null
      and threshold_percent is null
    )
  ),
  check (
    (status = 'read' and read_at is not null)
    or (status = 'unread' and read_at is null)
    or status = 'dismissed'
  )
);

create table public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reminder_id uuid not null,
  channel text not null check (channel = 'whatsapp'),
  status text not null check (status in ('queued', 'sent', 'skipped', 'failed')),
  template_name text check (template_name in ('budget_alert', 'bill_due')),
  provider_message_id text check (
    provider_message_id is null or char_length(btrim(provider_message_id)) between 1 and 300
  ),
  failure_code text check (failure_code is null or char_length(btrim(failure_code)) between 1 and 100),
  attempted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, user_id),
  foreign key (reminder_id, user_id)
    references public.reminders (id, user_id) on delete cascade,
  check (status <> 'sent' or sent_at is not null),
  check (status <> 'failed' or failure_code is not null)
);

create table public.whatsapp_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  phone_e164_hmac text not null check (char_length(phone_e164_hmac) between 32 and 200),
  phone_last_four text not null check (phone_last_four ~ '^[0-9]{4}$'),
  kapso_contact_id text check (
    kapso_contact_id is null or char_length(btrim(kapso_contact_id)) between 1 and 300
  ),
  status text not null default 'pending' check (status in ('pending', 'verified', 'revoked')),
  verification_code_digest text,
  verification_expires_at timestamptz,
  verification_attempts smallint not null default 0 check (verification_attempts between 0 and 10),
  verified_at timestamptz,
  last_inbound_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, user_id),
  unique (kapso_contact_id),
  check (
    (
      status = 'pending'
      and verification_code_digest is not null
      and verification_expires_at is not null
      and verified_at is null
    )
    or (
      status = 'verified'
      and verification_code_digest is null
      and verification_expires_at is null
      and verified_at is not null
    )
    or (
      status = 'revoked'
      and verification_code_digest is null
      and verification_expires_at is null
    )
  )
);

create table public.agent_action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null check (channel in ('web', 'whatsapp', 'gmail')),
  event_type text not null check (event_type in ('tool_call', 'security_block')),
  tool_name text check (tool_name is null or char_length(btrim(tool_name)) between 1 and 100),
  permission_tier text check (permission_tier in ('T0', 'T1', 'T2', 'T3')),
  result_status text not null check (
    result_status in ('succeeded', 'failed', 'blocked', 'awaiting_confirmation', 'reversed', 'expired')
  ),
  resource_type text check (
    resource_type is null
    or resource_type in (
      'financial_account',
      'category',
      'transaction',
      'budget',
      'recurring_bill',
      'reminder_preferences'
    )
  ),
  resource_id uuid,
  request_fingerprint text check (
    request_fingerprint is null or char_length(request_fingerprint) between 32 and 300
  ),
  confirmation_expires_at timestamptz,
  undo_expires_at timestamptz,
  reversed_action_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  unique (id, user_id),
  foreign key (reversed_action_id, user_id)
    references public.agent_action_logs (id, user_id) on delete restrict,
  check (
    (event_type = 'tool_call' and tool_name is not null and permission_tier is not null)
    or (event_type = 'security_block' and result_status = 'blocked')
  ),
  check (
    result_status <> 'awaiting_confirmation'
    or (
      permission_tier = 'T2'
      and confirmation_expires_at is not null
      and request_fingerprint is not null
    )
  ),
  check ((resource_type is null) = (resource_id is null))
);

create table public.agent_action_states (
  action_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('confirmation', 'undo')),
  operation_state jsonb not null check (jsonb_typeof(operation_state) = 'object'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  foreign key (action_id, user_id)
    references public.agent_action_logs (id, user_id) on delete cascade,
  check (expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at)
);

create unique index transactions_client_request_key
  on public.transactions (user_id, client_request_id)
  where client_request_id is not null;
create unique index transactions_gmail_item_key
  on public.transactions (processed_gmail_message_id, source_item_index)
  where processed_gmail_message_id is not null;
create unique index budgets_active_category_cadence_key
  on public.budgets (user_id, category_id, cadence)
  where is_active and deleted_at is null;
create unique index whatsapp_links_verified_phone_key
  on public.whatsapp_links (phone_e164_hmac)
  where status = 'verified';

create index financial_accounts_user_id_idx on public.financial_accounts (user_id);
create index categories_user_id_idx on public.categories (user_id);
create index gmail_connections_user_id_idx on public.gmail_connections (user_id);
create index processed_gmail_messages_user_id_idx on public.processed_gmail_messages (user_id);
create index processed_gmail_messages_connection_user_idx
  on public.processed_gmail_messages (gmail_connection_id, user_id);
create index processed_gmail_messages_status_idx
  on public.processed_gmail_messages (gmail_connection_id, processing_status, received_at);
create index transactions_user_id_idx on public.transactions (user_id);
create index transactions_processed_message_user_idx
  on public.transactions (processed_gmail_message_id, user_id)
  where processed_gmail_message_id is not null;
create index transactions_account_user_idx
  on public.transactions (financial_account_id, user_id)
  where financial_account_id is not null;
create index transactions_from_account_user_idx
  on public.transactions (from_financial_account_id, user_id)
  where from_financial_account_id is not null;
create index transactions_to_account_user_idx
  on public.transactions (to_financial_account_id, user_id)
  where to_financial_account_id is not null;
create index transactions_category_user_idx
  on public.transactions (category_id, user_id)
  where category_id is not null;
create index transactions_recurring_bill_user_idx
  on public.transactions (recurring_bill_id, user_id)
  where recurring_bill_id is not null;
create index transactions_review_queue_idx
  on public.transactions (user_id, created_at desc, id desc)
  where review_status = 'pending' and deleted_at is null;
create index transactions_dashboard_idx
  on public.transactions (user_id, occurred_on desc, id desc)
  where review_status = 'confirmed' and deleted_at is null;
create index budgets_user_id_idx on public.budgets (user_id);
create index budgets_category_user_idx on public.budgets (category_id, user_id);
create index recurring_bills_user_id_idx on public.recurring_bills (user_id);
create index recurring_bills_account_user_idx
  on public.recurring_bills (financial_account_id, user_id)
  where financial_account_id is not null;
create index recurring_bills_upcoming_idx
  on public.recurring_bills (user_id, next_due_on, id)
  where status = 'active' and deleted_at is null;
create index reminders_user_id_idx on public.reminders (user_id);
create index reminders_budget_user_idx
  on public.reminders (budget_id, user_id)
  where budget_id is not null;
create index reminders_bill_user_idx
  on public.reminders (recurring_bill_id, user_id)
  where recurring_bill_id is not null;
create index reminders_schedule_idx
  on public.reminders (status, scheduled_for, id)
  where status = 'unread';
create index reminder_deliveries_user_id_idx on public.reminder_deliveries (user_id);
create index reminder_deliveries_reminder_user_idx
  on public.reminder_deliveries (reminder_id, user_id);
create index reminder_deliveries_daily_cap_idx
  on public.reminder_deliveries (user_id, sent_at desc)
  where status = 'sent';
create index whatsapp_links_user_id_idx on public.whatsapp_links (user_id);
create index agent_action_logs_user_created_idx
  on public.agent_action_logs (user_id, created_at desc, id);
create index agent_action_logs_reversed_user_idx
  on public.agent_action_logs (reversed_action_id, user_id)
  where reversed_action_id is not null;
create index agent_action_states_user_expires_idx
  on public.agent_action_states (user_id, expires_at);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();
create trigger financial_accounts_set_updated_at
before update on public.financial_accounts
for each row execute function private.set_updated_at();
create trigger categories_set_updated_at
before update on public.categories
for each row execute function private.set_updated_at();
create trigger gmail_connections_set_updated_at
before update on public.gmail_connections
for each row execute function private.set_updated_at();
create trigger processed_gmail_messages_set_updated_at
before update on public.processed_gmail_messages
for each row execute function private.set_updated_at();
create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function private.set_updated_at();
create trigger budgets_set_updated_at
before update on public.budgets
for each row execute function private.set_updated_at();
create trigger recurring_bills_set_updated_at
before update on public.recurring_bills
for each row execute function private.set_updated_at();
create trigger reminder_preferences_set_updated_at
before update on public.reminder_preferences
for each row execute function private.set_updated_at();
create trigger reminders_set_updated_at
before update on public.reminders
for each row execute function private.set_updated_at();
create trigger reminder_deliveries_set_updated_at
before update on public.reminder_deliveries
for each row execute function private.set_updated_at();
create trigger whatsapp_links_set_updated_at
before update on public.whatsapp_links
for each row execute function private.set_updated_at();

create function private.enforce_initial_transaction_review()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.source_type = 'gmail_email' and new.review_status <> 'pending' then
    raise exception using
      errcode = '23514',
      message = 'Gmail imports must start pending review.';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_initial_transaction_review()
  from public, anon, authenticated;

create trigger transactions_enforce_initial_review
before insert on public.transactions
for each row execute function private.enforce_initial_transaction_review();

create function private.enforce_transaction_review_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.review_status is distinct from old.review_status
    and old.review_status <> 'pending' then
    raise exception using
      errcode = '23514',
      message = 'Only pending transactions may change review status.';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_transaction_review_transition()
  from public, anon, authenticated;

create trigger transactions_enforce_review_transition
before update of review_status on public.transactions
for each row execute function private.enforce_transaction_review_transition();

create function private.enforce_gmail_connection_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'active' then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

    if (
      select count(*)
      from public.gmail_connections
      where user_id = new.user_id
        and status = 'active'
        and id <> new.id
    ) >= 3 then
      raise exception using
        errcode = '23514',
        message = 'A user may have at most three active Gmail connections.';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_gmail_connection_limit()
  from public, anon, authenticated;

create trigger gmail_connections_enforce_limit
before insert or update of status, user_id on public.gmail_connections
for each row execute function private.enforce_gmail_connection_limit();

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  profile_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Monara User'
  );

  insert into public.profiles (id, display_name)
  values (new.id, left(profile_name, 100));

  insert into public.reminder_preferences (user_id)
  values (new.id);

  insert into public.categories (user_id, name, slug, icon, color, is_default)
  values
    (new.id, 'Food & Drinks', 'food-drinks', 'utensils', '#F97316', true),
    (new.id, 'Transport', 'transport', 'car', '#0EA5E9', true),
    (new.id, 'Shopping', 'shopping', 'shopping-bag', '#EC4899', true),
    (new.id, 'Bills & Utilities', 'bills-utilities', 'receipt', '#8B5CF6', true),
    (new.id, 'Entertainment', 'entertainment', 'film', '#6366F1', true),
    (new.id, 'Health', 'health', 'heart-pulse', '#EF4444', true),
    (new.id, 'Education', 'education', 'graduation-cap', '#14B8A6', true),
    (new.id, 'Groceries', 'groceries', 'basket', '#22C55E', true),
    (new.id, 'Housing', 'housing', 'house', '#A16207', true),
    (new.id, 'Travel', 'travel', 'plane', '#06B6D4', true),
    (new.id, 'Personal Care', 'personal-care', 'sparkles', '#D946EF', true),
    (new.id, 'Gifts & Donations', 'gifts-donations', 'gift', '#F43F5E', true),
    (new.id, 'Subscriptions', 'subscriptions', 'repeat', '#7C3AED', true),
    (new.id, 'Income', 'income', 'wallet-cards', '#16A34A', true),
    (new.id, 'Other', 'other', 'circle-ellipsis', '#64748B', true);

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.financial_accounts enable row level security;
alter table public.financial_accounts force row level security;
alter table public.categories enable row level security;
alter table public.categories force row level security;
alter table public.gmail_connections enable row level security;
alter table public.gmail_connections force row level security;
alter table public.processed_gmail_messages enable row level security;
alter table public.processed_gmail_messages force row level security;
alter table public.transactions enable row level security;
alter table public.transactions force row level security;
alter table public.budgets enable row level security;
alter table public.budgets force row level security;
alter table public.recurring_bills enable row level security;
alter table public.recurring_bills force row level security;
alter table public.reminder_preferences enable row level security;
alter table public.reminder_preferences force row level security;
alter table public.reminders enable row level security;
alter table public.reminders force row level security;
alter table public.reminder_deliveries enable row level security;
alter table public.reminder_deliveries force row level security;
alter table public.whatsapp_links enable row level security;
alter table public.whatsapp_links force row level security;
alter table public.agent_action_logs enable row level security;
alter table public.agent_action_logs force row level security;
alter table public.agent_action_states enable row level security;
alter table public.agent_action_states force row level security;

revoke all on table
  public.profiles,
  public.financial_accounts,
  public.categories,
  public.gmail_connections,
  public.processed_gmail_messages,
  public.transactions,
  public.budgets,
  public.recurring_bills,
  public.reminder_preferences,
  public.reminders,
  public.reminder_deliveries,
  public.whatsapp_links,
  public.agent_action_logs,
  public.agent_action_states
from public, anon, authenticated;

grant select on table
  public.profiles,
  public.financial_accounts,
  public.categories,
  public.transactions,
  public.budgets,
  public.recurring_bills,
  public.reminder_preferences,
  public.reminders
to authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.financial_accounts,
  public.categories,
  public.gmail_connections,
  public.processed_gmail_messages,
  public.transactions,
  public.budgets,
  public.recurring_bills,
  public.reminder_preferences,
  public.reminders,
  public.reminder_deliveries,
  public.whatsapp_links,
  public.agent_action_logs,
  public.agent_action_states
to service_role;

create policy profiles_select_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy financial_accounts_select_own
on public.financial_accounts for select
to authenticated
using ((select auth.uid()) = user_id);

create policy categories_select_own
on public.categories for select
to authenticated
using ((select auth.uid()) = user_id);

create policy transactions_select_own
on public.transactions for select
to authenticated
using ((select auth.uid()) = user_id);

create policy budgets_select_own
on public.budgets for select
to authenticated
using ((select auth.uid()) = user_id);

create policy recurring_bills_select_own
on public.recurring_bills for select
to authenticated
using ((select auth.uid()) = user_id);

create policy reminder_preferences_select_own
on public.reminder_preferences for select
to authenticated
using ((select auth.uid()) = user_id);

create policy reminders_select_own
on public.reminders for select
to authenticated
using ((select auth.uid()) = user_id);
