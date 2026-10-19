-- A Gmail transaction whose email states no usable date takes the day the email arrived,
-- counted in Jakarta. A receipt arrives on or after the day it describes, and a dated
-- ledger is worth more than an empty date. The agent sets it too; this keeps the rule
-- true for any other writer and repairs rows imported before it.
create or replace function private.normalize_transaction_foundation()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  source_received_on date;
begin
  if new.occurred_on is null then
    if new.source_type='gmail_email' and new.processed_gmail_message_id is not null then
      select (message.received_at at time zone 'Asia/Jakarta')::date
        into source_received_on
        from public.processed_gmail_messages as message
        where message.id=new.processed_gmail_message_id;
    end if;
    new.occurred_on:=coalesce(source_received_on,
      case when tg_op='UPDATE' then old.occurred_on end,
      (statement_timestamp() at time zone 'Asia/Jakarta')::date);
  end if;
  if new.source_type='gmail_email' and new.review_status='pending' and new.flow_direction is null then
    new.flow_direction:=null;
  else
    new.flow_direction:=case new.transaction_type when 'expense' then 'out'
      when 'income' then 'in' when 'exclusion' then new.flow_direction
      else case when new.flow_direction in ('in','out') then new.flow_direction end end;
  end if;
  return new;
end; $$;

-- The trigger fills the date on update, so touching each undated row is enough.
update public.transactions
set occurred_on=occurred_on
where source_type='gmail_email' and occurred_on is null;
