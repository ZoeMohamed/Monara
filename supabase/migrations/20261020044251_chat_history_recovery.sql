-- Keep the existing private conversation store. A reply whose save response was
-- interrupted can be retried without another Agent call or duplicate messages.
alter table public.chat_messages add column exchange_id uuid;

create index chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at, seq);

create unique index chat_messages_exchange_role_idx
  on public.chat_messages (conversation_id, exchange_id, role)
  where exchange_id is not null;

create function public.append_chat_exchange(
  p_user_id uuid,
  p_conversation_id uuid,
  p_exchange_id uuid,
  p_created_at timestamptz,
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
declare
  existing_user public.chat_messages%rowtype;
  existing_agent public.chat_messages%rowtype;
begin
  if p_exchange_id is null or p_created_at is null then
    raise exception 'A chat exchange identity is required' using errcode = '23502';
  end if;

  insert into public.chat_conversations (id, user_id, title)
  values (p_conversation_id, p_user_id, p_title)
  on conflict (id) do nothing;

  -- Serialize whole exchanges, including concurrent retries, and check ownership
  -- before looking up the exchange identity. Two different users never share a chat.
  perform 1 from public.chat_conversations
  where id = p_conversation_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Unknown owned chat' using errcode = '23503';
  end if;

  if p_agent_result -> 'confirmation' is distinct from 'null'::jsonb then
    raise exception 'Saved chats cannot carry confirmation authority' using errcode = '23514';
  end if;

  select * into existing_user from public.chat_messages
  where conversation_id = p_conversation_id and exchange_id = p_exchange_id and role = 'user';
  if found then
    select * into existing_agent from public.chat_messages
    where conversation_id = p_conversation_id and exchange_id = p_exchange_id and role = 'agent';
    if not found
      or existing_user.user_id is distinct from p_user_id
      or existing_user.created_at is distinct from p_created_at
      or existing_user.text is distinct from p_user_text
      or existing_agent.text is distinct from p_agent_text
      or existing_agent.result is distinct from p_agent_result
      or existing_agent.closed_confirmation is distinct from p_closed_confirmation then
      raise exception 'The chat exchange identity was reused with different contents' using errcode = '23505';
    end if;
    return;
  end if;

  insert into public.chat_messages (conversation_id, user_id, exchange_id, role, text, created_at)
  values (p_conversation_id, p_user_id, p_exchange_id, 'user', p_user_text, p_created_at);
  insert into public.chat_messages
    (conversation_id, user_id, exchange_id, role, text, result, closed_confirmation, created_at)
  values
    (p_conversation_id, p_user_id, p_exchange_id, 'agent', p_agent_text, p_agent_result, p_closed_confirmation, p_created_at);

  update public.chat_conversations
  set updated_at = statement_timestamp()
  where id = p_conversation_id and user_id = p_user_id;
end;
$$;

revoke execute on function public.append_chat_exchange(
  uuid, uuid, uuid, timestamptz, text, text, text, jsonb, boolean
) from public, anon, authenticated;
grant execute on function public.append_chat_exchange(
  uuid, uuid, uuid, timestamptz, text, text, text, jsonb, boolean
) to service_role;

-- Migrations run before the web deployment. Existing server instances may still
-- use the old signature briefly; keep it private and route it through the same
-- ownership/atomicity checks. New code always supplies a stable exchange identity.
create or replace function public.append_chat_exchange(
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
  perform public.append_chat_exchange(
    p_user_id, p_conversation_id, gen_random_uuid(), statement_timestamp(), p_title,
    p_user_text, p_agent_text, p_agent_result, p_closed_confirmation
  );
end;
$$;

revoke execute on function public.append_chat_exchange(
  uuid, uuid, text, text, text, jsonb, boolean
) from public, anon, authenticated;
grant execute on function public.append_chat_exchange(
  uuid, uuid, text, text, text, jsonb, boolean
) to service_role;
