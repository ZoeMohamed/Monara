-- WhatsApp Reminders (PRD F13) are sent to the verified number, which the
-- keyed hash cannot give back. The number is kept encrypted with a key only
-- the backend holds, written on verification and cleared on unlink.
alter table public.whatsapp_links
  add column phone_e164_ciphertext text check (
    phone_e164_ciphertext is null or char_length(phone_e164_ciphertext) between 20 and 300
  );

comment on column public.whatsapp_links.phone_e164_ciphertext is
  'AES-GCM sealed E.164 number (v1.<iv>.<ciphertext>), keyed from WHATSAPP_LINK_SECRET. Null unless verified.';

-- Older verified links keep working for chat; they get WhatsApp Reminders once relinked.
alter table public.whatsapp_links
  add constraint whatsapp_links_ciphertext_only_when_verified
  check (status = 'verified' or phone_e164_ciphertext is null);

-- One WhatsApp delivery per Reminder: the row is reserved before anything is
-- sent, so two callers can never both send the same alert. Nothing has written
-- reminder_deliveries before this change.
create unique index reminder_deliveries_reminder_channel_key
  on public.reminder_deliveries (reminder_id, channel);

-- Keep the exact budget period that raised a threshold Reminder. Deriving it
-- from created_at is wrong when a User records a transaction for an older month.
alter table public.reminders add column period_starts_on date;

update public.reminders
set period_starts_on = coalesce(
  case
    when dedupe_key ~ '^budget:[^:]+:[0-9]{4}-[0-9]{2}-[0-9]{2}:'
      then split_part(dedupe_key, ':', 3)::date
  end,
  scheduled_for::date
)
where kind = 'budget_threshold';

alter table public.reminders
  add constraint reminders_budget_period_shape
  check (
    (kind = 'budget_threshold' and period_starts_on is not null)
    or (kind = 'bill_due' and period_starts_on is null)
  );

-- A provider call starts only after this state is persisted. A stale queued
-- claim is safe to retry; a stale sending row is not retried because its
-- provider outcome may be unknown.
alter table public.reminder_deliveries
  drop constraint reminder_deliveries_status_check,
  add constraint reminder_deliveries_status_check
    check (status in ('queued', 'sending', 'sent', 'skipped', 'failed'));
