create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Jakarta',
  currency text not null default 'IDR' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.financial_accounts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  provider text not null check (length(trim(provider)) > 0),
  kind text not null check (kind in ('bank', 'credit_card', 'e_wallet', 'cash', 'other')),
  currency text not null default 'IDR' check (currency ~ '^[A-Z]{3}$'),
  last_four text check (last_four is null or last_four ~ '^[0-9]{4}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.gmail_connections (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  google_account_id text not null,
  account_email text not null,
  composio_connection_id text,
  status text not null default 'active' check (status in ('active', 'disconnected', 'error')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, google_account_id),
  unique (id, user_id)
);

create table public.gmail_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  gmail_connection_id bigint not null,
  financial_account_id bigint,
  gmail_message_id text not null,
  sender text,
  subject text,
  received_at timestamptz not null,
  payload_hash text,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processed', 'needs_review', 'ignored', 'failed')),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (gmail_connection_id, user_id)
    references public.gmail_connections (id, user_id) on delete restrict,
  foreign key (financial_account_id, user_id)
    references public.financial_accounts (id, user_id) on delete restrict,
  unique (gmail_connection_id, gmail_message_id),
  unique (id, user_id)
);

create table public.transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  financial_account_id bigint,
  gmail_message_id bigint,
  dedupe_key text,
  direction text not null check (direction in ('expense', 'income', 'transfer')),
  merchant_name text,
  amount numeric(20, 2) not null check (amount > 0),
  currency text not null default 'IDR' check (currency ~ '^[A-Z]{3}$'),
  occurred_at timestamptz not null,
  description text,
  category text not null default 'uncategorized',
  location text,
  confidence numeric(4, 3) check (confidence between 0 and 1),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (financial_account_id, user_id)
    references public.financial_accounts (id, user_id) on delete restrict,
  foreign key (gmail_message_id, user_id)
    references public.gmail_messages (id, user_id) on delete restrict,
  unique (user_id, dedupe_key)
);

create table public.whatsapp_links (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  phone_e164_hmac text not null,
  phone_last_four text not null check (phone_last_four ~ '^[0-9]{4}$'),
  kapso_contact_id text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'revoked')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (phone_e164_hmac)
);

comment on column public.whatsapp_links.phone_e164_hmac is
  'Server-generated HMAC of the E.164 phone number; never store an unsalted phone hash.';

create index financial_accounts_user_id_idx
  on public.financial_accounts (user_id);
create index gmail_connections_user_status_idx
  on public.gmail_connections (user_id, status);
create index gmail_messages_user_received_idx
  on public.gmail_messages (user_id, received_at desc);
create index gmail_messages_connection_idx
  on public.gmail_messages (gmail_connection_id, user_id);
create index gmail_messages_financial_account_idx
  on public.gmail_messages (financial_account_id, user_id);
create index transactions_user_occurred_idx
  on public.transactions (user_id, occurred_at desc);
create index transactions_user_status_occurred_idx
  on public.transactions (user_id, status, occurred_at desc);
create index transactions_financial_account_idx
  on public.transactions (financial_account_id, user_id);
create index transactions_gmail_message_idx
  on public.transactions (gmail_message_id, user_id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();
create trigger financial_accounts_set_updated_at
before update on public.financial_accounts
for each row execute function private.set_updated_at();
create trigger gmail_connections_set_updated_at
before update on public.gmail_connections
for each row execute function private.set_updated_at();
create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function private.set_updated_at();
create trigger whatsapp_links_set_updated_at
before update on public.whatsapp_links
for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.gmail_connections enable row level security;
alter table public.gmail_messages enable row level security;
alter table public.transactions enable row level security;
alter table public.whatsapp_links enable row level security;

create policy profiles_own_rows on public.profiles
for all to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy financial_accounts_own_rows on public.financial_accounts
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy gmail_connections_own_rows on public.gmail_connections
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy gmail_messages_own_rows on public.gmail_messages
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy transactions_own_rows on public.transactions
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy whatsapp_links_own_rows on public.whatsapp_links
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.profiles from public, anon;
revoke all on public.financial_accounts from public, anon;
revoke all on public.gmail_connections from public, anon;
revoke all on public.gmail_messages from public, anon;
revoke all on public.transactions from public, anon;
revoke all on public.whatsapp_links from public, anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.financial_accounts to authenticated;
grant select, insert, update, delete on public.gmail_connections to authenticated;
grant select, insert, update, delete on public.gmail_messages to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.whatsapp_links to authenticated;
grant usage, select on all sequences in schema public to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_class
    where oid in (
      'public.profiles'::regclass,
      'public.financial_accounts'::regclass,
      'public.gmail_connections'::regclass,
      'public.gmail_messages'::regclass,
      'public.transactions'::regclass,
      'public.whatsapp_links'::regclass
    )
    and not relrowsecurity
  ) then
    raise exception 'All public Monara tables must have RLS enabled';
  end if;
end;
$$;
