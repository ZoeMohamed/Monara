-- The Composio new-mail trigger that watches a mailbox's linked bank senders. Created
-- when the mailbox gets its first linked account, updated when its senders change,
-- and deleted on disconnect. gmail_connections stays service-role only.

alter table public.gmail_connections
  add column composio_trigger_id text
    check (composio_trigger_id is null or char_length(btrim(composio_trigger_id)) between 1 and 300);

comment on column public.gmail_connections.composio_trigger_id is
  'Composio trigger instance watching this mailbox''s linked bank senders; null when none.';
