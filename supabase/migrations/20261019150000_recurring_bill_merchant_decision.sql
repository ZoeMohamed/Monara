-- One live recurring bill per merchant and User. A tracked or dismissed suggestion is the
-- User's decision for that merchant; the key matches recurringBillKey in packages/core.
create unique index recurring_bills_user_merchant_key_idx
  on public.recurring_bills (user_id, (regexp_replace(lower(btrim(merchant_name)), '\s+', ' ', 'g')))
  where deleted_at is null;
