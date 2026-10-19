create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_request_id text not null check (char_length(btrim(client_request_id)) between 1 and 200),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  target_amount numeric not null check (
    target_amount > 0 and target_amount < 100000000000000000000 and target_amount = trunc(target_amount)
  ),
  saved_amount numeric not null default 0 check (
    saved_amount >= 0 and saved_amount <= target_amount and saved_amount = trunc(saved_amount)
  ),
  currency text not null default 'IDR' check (currency = 'IDR'),
  target_date date not null,
  status text generated always as (
    case when saved_amount = target_amount then 'completed' else 'active' end
  ) stored,
  image_path text check (
    image_path is null or (
      char_length(image_path) <= 500
      and split_part(image_path, '/', 1) = user_id::text
      and split_part(image_path, '/', 2) = id::text
      and image_path ~ ('^' || user_id::text || '/' || id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$')
    )
  ),
  deleted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, user_id),
  unique (user_id, client_request_id)
);

create index financial_goals_user_active_date_idx
  on public.financial_goals (user_id, target_date, id)
  where deleted_at is null;

create trigger financial_goals_set_updated_at
before update on public.financial_goals
for each row execute function private.set_updated_at();

alter table public.financial_goals enable row level security;
alter table public.financial_goals force row level security;

revoke all on table public.financial_goals from public, anon, authenticated;
grant select on table public.financial_goals to authenticated;
grant select, insert, update, delete on table public.financial_goals to service_role;

create policy financial_goals_select_own
on public.financial_goals for select
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('goal-images', 'goal-images', false, 3145728, array['image/jpeg', 'image/png', 'image/webp']);
