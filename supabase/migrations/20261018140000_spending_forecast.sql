-- Spending forecast (PRD F17). A run is one forecast for the rest of a month, and its items
-- are the individual payments the backend expects, each with a confidence. Forecasts are
-- predictions: they are never transactions and never count toward confirmed totals.
-- Only the backend reads and writes these tables, so ownership is checked there and by the
-- composite keys, like the chat history tables.
create table public.forecast_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  generated_at timestamptz not null default statement_timestamp(),
  source text not null check (source in ('manual', 'weekly', 'agent')),
  -- The calendar month the forecast covers, as YYYY-MM.
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- Items below this confidence were dropped, and only counted.
  threshold numeric(4, 3) not null check (threshold between 0 and 1),
  -- False when the model step was unavailable and the rule-based confidence was used.
  used_model boolean not null,
  candidate_count integer not null check (candidate_count >= 0),
  discarded_count integer not null check (discarded_count >= 0 and discarded_count <= candidate_count),
  unique (id, user_id)
);

create table public.forecast_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  predicted_on date not null,
  merchant_name text not null check (char_length(btrim(merchant_name)) between 1 and 200),
  category_id uuid,
  -- Whole rupiah. The range comes from the amounts the User actually paid before.
  amount numeric not null check (amount > 0 and amount < 100000000000000000000 and amount = trunc(amount)),
  amount_low numeric not null check (amount_low > 0 and amount_low = trunc(amount_low)),
  amount_high numeric not null check (amount_high > 0 and amount_high = trunc(amount_high)),
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  pattern text not null check (pattern in ('monthly', 'weekly')),
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  check (amount_low <= amount and amount <= amount_high),
  foreign key (run_id, user_id) references public.forecast_runs (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict
);

create index forecast_runs_user_generated_idx on public.forecast_runs (user_id, generated_at desc);
create index forecast_items_run_idx on public.forecast_items (run_id, predicted_on);
create index forecast_items_user_idx on public.forecast_items (user_id);

alter table public.forecast_runs enable row level security;
alter table public.forecast_runs force row level security;
alter table public.forecast_items enable row level security;
alter table public.forecast_items force row level security;

revoke all on table public.forecast_runs, public.forecast_items from public, anon, authenticated;
grant select, insert, update, delete on table public.forecast_runs, public.forecast_items
to service_role;

-- Replaces the User's forecast with a new one in a single transaction, so a refresh never
-- leaves half a forecast. A User keeps only their latest run. `p_run` carries source, month,
-- threshold, usedModel, candidateCount and discardedCount; `p_items` is an array of items.
create function public.replace_forecast(p_user_id uuid, p_run jsonb, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  delete from public.forecast_runs where user_id = p_user_id;

  insert into public.forecast_runs
    (user_id, source, month, threshold, used_model, candidate_count, discarded_count)
  values (
    p_user_id,
    p_run ->> 'source',
    p_run ->> 'month',
    (p_run ->> 'threshold')::numeric,
    (p_run ->> 'usedModel')::boolean,
    (p_run ->> 'candidateCount')::integer,
    (p_run ->> 'discardedCount')::integer
  )
  returning id into v_run_id;

  insert into public.forecast_items
    (run_id, user_id, predicted_on, merchant_name, category_id, amount, amount_low,
     amount_high, confidence, pattern, reason)
  select
    v_run_id,
    p_user_id,
    (item ->> 'predictedOn')::date,
    item ->> 'merchantName',
    nullif(item ->> 'categoryId', '')::uuid,
    (item ->> 'amount')::numeric,
    (item ->> 'amountLow')::numeric,
    (item ->> 'amountHigh')::numeric,
    (item ->> 'confidence')::numeric,
    item ->> 'pattern',
    item ->> 'reason'
  from jsonb_array_elements(p_items) as item;

  return v_run_id;
end;
$$;

revoke execute on function public.replace_forecast(uuid, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.replace_forecast(uuid, jsonb, jsonb) to service_role;
