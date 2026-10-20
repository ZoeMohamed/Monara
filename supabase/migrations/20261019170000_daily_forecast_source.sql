-- Retain historical weekly runs while allowing the new nightly schedule and Home catch-up.
alter table public.forecast_runs drop constraint forecast_runs_source_check;
alter table public.forecast_runs add constraint forecast_runs_source_check
  check (source in ('manual', 'weekly', 'daily', 'agent'));
