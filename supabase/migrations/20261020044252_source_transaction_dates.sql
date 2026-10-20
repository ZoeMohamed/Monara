-- Gmail uses its source email's arrival day in Jakarta when no usable date was
-- stated. Receipt/manual captures retain unknown dates until the User supplies
-- one. Keep both rules without replacing the latest Gmail recorder.
alter table public.transactions
  alter column occurred_on drop default,
  alter column occurred_on drop not null,
  add constraint transactions_confirmed_date_required check (
    review_status <> 'confirmed' or occurred_on is not null
  );

-- Preserve Gmail's arrival-date fallback and its unknown cash direction. Other
-- sources must not gain a date on insert or restore an intentionally cleared one.
create or replace function private.normalize_transaction_foundation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.occurred_on is null and new.source_type = 'gmail_email'
    and new.processed_gmail_message_id is not null then
    select (message.received_at at time zone 'Asia/Jakarta')::date
      into new.occurred_on
      from public.processed_gmail_messages as message
      where message.id = new.processed_gmail_message_id;
  end if;
  if new.source_type = 'gmail_email' and new.review_status = 'pending'
    and new.flow_direction is null then
    return new;
  end if;
  new.flow_direction := case new.transaction_type
    when 'expense' then 'out'
    when 'income' then 'in'
    when 'exclusion' then new.flow_direction
    else case when new.flow_direction in ('in', 'out') then new.flow_direction end
  end;
  return new;
end;
$$;

-- Confirmation requires a date, including exclusions. Gmail's arrival day is a
-- usable fallback; other pending drafts and exact Undo snapshots may remain
-- undated. Previously backfilled dates are intentionally not rewritten.
