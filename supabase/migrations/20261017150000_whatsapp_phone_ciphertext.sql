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
