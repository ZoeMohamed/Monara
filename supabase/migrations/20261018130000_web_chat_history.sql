-- Web chat history. The in-app chat used to live in page memory and vanished on
-- reload. The web backend now saves each exchange after the Agent answers; the
-- browser never writes these tables and cannot read them directly either, so the
-- backend is the only path and ownership is checked there and by the composite key.
create table public.chat_conversations (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, user_id)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  -- Arrival order inside a conversation, stable even when two rows share a timestamp.
  seq bigint generated always as identity,
  conversation_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'agent')),
  text text not null check (char_length(btrim(text)) between 1 and 20000),
  -- The Agent reply as the User saw it: receipts of what it changed, never an open
  -- confirmation, and never a signed image link, which expires.
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  -- The Agent asked for a confirmation that was never answered. It is shown as closed.
  closed_confirmation boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  foreign key (conversation_id, user_id)
    references public.chat_conversations (id, user_id) on delete cascade,
  check (role = 'agent' or (result is null and not closed_confirmation))
);

create index chat_conversations_user_updated_idx
  on public.chat_conversations (user_id, updated_at desc, id);
create index chat_messages_conversation_seq_idx
  on public.chat_messages (conversation_id, seq);
create index chat_messages_user_idx on public.chat_messages (user_id);

create trigger chat_conversations_set_updated_at
before update on public.chat_conversations
for each row execute function private.set_updated_at();

alter table public.chat_conversations enable row level security;
alter table public.chat_conversations force row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_messages force row level security;

revoke all on table public.chat_conversations, public.chat_messages
from public, anon, authenticated;

grant select, insert, update, delete on table public.chat_conversations, public.chat_messages
to service_role;

-- Saves one question and its answer together, so a chat never keeps half an exchange.
-- A conversation id that belongs to another User fails the composite key, not silently.
create function public.append_chat_exchange(
  p_user_id uuid,
  p_conversation_id uuid,
  p_title text,
  p_user_text text,
  p_agent_text text,
  p_agent_result jsonb,
  p_closed_confirmation boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.chat_conversations (id, user_id, title)
  values (p_conversation_id, p_user_id, p_title)
  on conflict (id) do nothing;

  insert into public.chat_messages (conversation_id, user_id, role, text)
  values (p_conversation_id, p_user_id, 'user', p_user_text);

  insert into public.chat_messages
    (conversation_id, user_id, role, text, result, closed_confirmation)
  values
    (p_conversation_id, p_user_id, 'agent', p_agent_text, p_agent_result, p_closed_confirmation);

  update public.chat_conversations
  set updated_at = statement_timestamp()
  where id = p_conversation_id and user_id = p_user_id;
end;
$$;

revoke execute on function public.append_chat_exchange(
  uuid, uuid, text, text, text, jsonb, boolean
) from public, anon, authenticated;
grant execute on function public.append_chat_exchange(
  uuid, uuid, text, text, text, jsonb, boolean
) to service_role;
