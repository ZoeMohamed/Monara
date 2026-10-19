-- Delivery and import timestamps are not evidence of a transaction date. Keep
-- incomplete imports pending and recoverable until a source date is supplied.
-- Main's typed Gmail recorder already preserves unknown source dates. Apply the
-- same rule to receipt/manual pending records, without replacing that recorder.
alter table public.transactions
  alter column occurred_on drop default,
  alter column occurred_on drop not null,
  add constraint transactions_confirmed_date_required check (
    review_status <> 'confirmed' or occurred_on is not null
  );

-- Preserve the foundation's direction normalization, without inventing a date on
-- inserts or turning a deliberately cleared uncertain date into the old value.
create or replace function private.normalize_transaction_foundation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.flow_direction := case new.transaction_type
    when 'expense' then 'out'
    when 'income' then 'in'
    when 'exclusion' then new.flow_direction
    else case when new.flow_direction in ('in', 'out') then new.flow_direction end
  end;
  return new;
end;
$$;

-- Confirmation always requires a source date, including exclusions; pending
-- drafts and exact Undo snapshots may keep an unknown date. Previously backfilled historical dates
-- cannot be distinguished from source dates and are intentionally not rewritten.
