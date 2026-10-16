-- Inactive Financial Accounts remain attached to history but cannot be selected
-- by a new confirmed transaction or a newly confirmed Review Queue item.

create or replace function private.require_active_transaction_accounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  referenced_account_id uuid;
  referenced_account_ids uuid[];
begin
  if new.review_status <> 'confirmed' then
    return new;
  end if;

  if tg_op = 'INSERT' or old.review_status <> 'confirmed' then
    referenced_account_ids := array[
      new.financial_account_id,
      new.from_financial_account_id,
      new.to_financial_account_id
    ];
  else
    referenced_account_ids := array[
      case
        when new.financial_account_id is distinct from old.financial_account_id
          then new.financial_account_id
      end,
      case
        when new.from_financial_account_id is distinct from old.from_financial_account_id
          then new.from_financial_account_id
      end,
      case
        when new.to_financial_account_id is distinct from old.to_financial_account_id
          then new.to_financial_account_id
      end
    ];
  end if;

  foreach referenced_account_id in array referenced_account_ids loop
    if referenced_account_id is not null and exists (
      select 1
      from public.financial_accounts
      where id = referenced_account_id
        and user_id = new.user_id
        and not is_active
    ) then
      raise check_violation using
        message = 'Confirmed transactions require active Financial Accounts.';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.require_active_transaction_accounts() from public, anon, authenticated;

create trigger transactions_require_active_financial_accounts
before insert or update of
  financial_account_id,
  from_financial_account_id,
  to_financial_account_id,
  review_status
on public.transactions
for each row execute function private.require_active_transaction_accounts();
