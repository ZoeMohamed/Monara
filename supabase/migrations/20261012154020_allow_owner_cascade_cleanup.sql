-- Preserve RESTRICT-like behavior for ordinary parent deletes while allowing
-- one auth.users delete statement to cascade through every owned table.

alter table public.processed_gmail_messages
  drop constraint processed_gmail_messages_gmail_connection_id_user_id_fkey,
  add constraint processed_gmail_messages_gmail_connection_id_user_id_fkey
    foreign key (gmail_connection_id, user_id)
    references public.gmail_connections (id, user_id) on delete no action;

alter table public.transactions
  drop constraint transactions_processed_gmail_message_id_user_id_fkey,
  add constraint transactions_processed_gmail_message_id_user_id_fkey
    foreign key (processed_gmail_message_id, user_id)
    references public.processed_gmail_messages (id, user_id) on delete no action,
  drop constraint transactions_financial_account_id_user_id_fkey,
  add constraint transactions_financial_account_id_user_id_fkey
    foreign key (financial_account_id, user_id)
    references public.financial_accounts (id, user_id) on delete no action,
  drop constraint transactions_from_financial_account_id_user_id_fkey,
  add constraint transactions_from_financial_account_id_user_id_fkey
    foreign key (from_financial_account_id, user_id)
    references public.financial_accounts (id, user_id) on delete no action,
  drop constraint transactions_to_financial_account_id_user_id_fkey,
  add constraint transactions_to_financial_account_id_user_id_fkey
    foreign key (to_financial_account_id, user_id)
    references public.financial_accounts (id, user_id) on delete no action,
  drop constraint transactions_category_id_user_id_fkey,
  add constraint transactions_category_id_user_id_fkey
    foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete no action,
  drop constraint transactions_recurring_bill_id_user_id_fkey,
  add constraint transactions_recurring_bill_id_user_id_fkey
    foreign key (recurring_bill_id, user_id)
    references public.recurring_bills (id, user_id) on delete no action;

alter table public.budgets
  drop constraint budgets_category_id_user_id_fkey,
  add constraint budgets_category_id_user_id_fkey
    foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete no action;

alter table public.recurring_bills
  drop constraint recurring_bills_financial_account_id_user_id_fkey,
  add constraint recurring_bills_financial_account_id_user_id_fkey
    foreign key (financial_account_id, user_id)
    references public.financial_accounts (id, user_id) on delete no action;

alter table public.reminders
  drop constraint reminders_budget_id_user_id_fkey,
  add constraint reminders_budget_id_user_id_fkey
    foreign key (budget_id, user_id)
    references public.budgets (id, user_id) on delete no action,
  drop constraint reminders_recurring_bill_id_user_id_fkey,
  add constraint reminders_recurring_bill_id_user_id_fkey
    foreign key (recurring_bill_id, user_id)
    references public.recurring_bills (id, user_id) on delete no action;

alter table public.agent_action_logs
  drop constraint agent_action_logs_reversed_action_id_user_id_fkey,
  add constraint agent_action_logs_reversed_action_id_user_id_fkey
    foreign key (reversed_action_id, user_id)
    references public.agent_action_logs (id, user_id) on delete no action;
