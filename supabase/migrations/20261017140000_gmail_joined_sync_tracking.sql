-- One mailbox can receive another account-linked import while an import is already
-- running. Count those joined runs so the shared status cannot say completed until
-- every queued listing job has finished.
alter table public.gmail_connections
  add column sync_pending_runs integer not null default 0
    check (sync_pending_runs >= 0);

create or replace function public.request_gmail_sync(p_user_id uuid, p_connection_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_connection public.gmail_connections%rowtype;
  v_status text;
  v_requested_at timestamptz := statement_timestamp();
begin
  select connection.* into v_connection
    from public.gmail_connections as connection
    where connection.id = p_connection_id
      and connection.user_id = p_user_id
      and connection.status = 'active'
    for update of connection;
  if v_connection.id is null then
    raise exception using errcode = 'P0002', message = 'Gmail connection is not active.';
  end if;

  select status.state into v_status
    from public.gmail_sync_statuses(p_user_id) as status
    where status.connection_id = p_connection_id;
  if v_status in ('queued', 'running') then
    raise exception using errcode = '55000', message = 'A Gmail sync is already running.';
  end if;

  update public.gmail_connections
    set sync_state = 'queued', sync_error = null,
      sync_requested_at = v_requested_at, sync_updated_at = v_requested_at,
      sync_pending_runs = 1
    where id = p_connection_id;
  return v_requested_at;
end;
$$;

create function public.join_gmail_sync(p_user_id uuid, p_connection_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_requested_at timestamptz;
begin
  update public.gmail_connections
    set sync_state = 'listing',
      sync_pending_runs = case
        when sync_state = 'listed' then 1
        else sync_pending_runs + 1
      end,
      sync_updated_at = statement_timestamp()
    where id = p_connection_id
      and user_id = p_user_id
      and status = 'active'
      and sync_state in ('queued', 'listing', 'listed')
    returning sync_requested_at into v_requested_at;
  if not found then
    raise exception using errcode = '55000', message = 'There is no Gmail sync to join.';
  end if;
  return v_requested_at;
end;
$$;

create or replace function public.start_gmail_sync(p_connection_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.gmail_connections
    set sync_state = 'listing', sync_error = null,
      sync_requested_at = case
        when sync_state in ('queued', 'listing') then coalesce(sync_requested_at, statement_timestamp())
        else statement_timestamp()
      end,
      sync_pending_runs = case
        when sync_state in ('queued', 'listing') then greatest(sync_pending_runs, 1)
        else 1
      end,
      sync_updated_at = statement_timestamp()
    where id = p_connection_id and status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'Gmail connection is not active.';
  end if;
end;
$$;

create or replace function public.mark_gmail_connection_synced(
  p_connection_id uuid,
  p_synced_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.gmail_connections
    set last_synced_at = greatest(coalesce(last_synced_at, p_synced_at), p_synced_at),
      sync_state = case
        when sync_state = 'listing' and sync_pending_runs <= 1 then 'listed'
        else sync_state
      end,
      sync_pending_runs = greatest(sync_pending_runs - 1, 0),
      sync_updated_at = case
        when sync_state = 'listing' then statement_timestamp()
        else sync_updated_at
      end
    where id = p_connection_id and status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'Gmail connection is not active.';
  end if;
end;
$$;

create or replace function public.fail_gmail_sync(
  p_connection_id uuid,
  p_error text,
  p_requested_at timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.gmail_connections
    set sync_state = 'failed', sync_error = p_error,
      sync_updated_at = statement_timestamp(), sync_pending_runs = 0
    where id = p_connection_id
      and (p_requested_at is null or sync_requested_at = p_requested_at);
end;
$$;

revoke execute on function public.join_gmail_sync(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.join_gmail_sync(uuid, uuid) to service_role;
