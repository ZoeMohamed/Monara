-- Storage authorization probes may roll back before a privileged final commit.
-- Keep a durable record before sending bytes, outside the public owned graph
-- erased by begin_user_deletion. No image bytes, names or financial values.
create table private.goal_image_uploads (
  upload_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  goal_id uuid not null,
  object_path text not null unique check (char_length(object_path) <= 500),
  expected_updated_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  settled_at timestamptz
);
alter table private.goal_image_uploads enable row level security;
alter table private.goal_image_uploads force row level security;
revoke all on private.goal_image_uploads from public, anon, authenticated, service_role;
create index goal_image_uploads_pending_user_idx
on private.goal_image_uploads (user_id, created_at, upload_id)
where settled_at is null;

comment on table private.goal_image_uploads is
  'Server-private upload paths. Unsettled requests block deletion until actual Storage completion is established; they never expire by time alone.';

-- Only the verified backend may register an opaque random path. A browser must
-- not learn an unsettled path or register concurrent requests for the same one.
create function public.begin_goal_image_upload(
  p_upload_id uuid,
  p_user_id uuid,
  p_goal_id uuid,
  p_object_path text,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_existing private.goal_image_uploads%rowtype;
  v_goal public.financial_goals%rowtype;
begin
  if p_upload_id is null or p_user_id is null or p_goal_id is null
    or p_expected_updated_at is null or p_object_path is null
    or p_object_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
    or split_part(p_object_path, '/', 1) <> p_user_id::text
    or split_part(p_object_path, '/', 2) <> p_goal_id::text then
    raise exception using errcode = '22023', message = 'A valid owned upload path is required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 190026));
  if not public.monara_user_is_active(p_user_id) then
    raise exception using errcode = '23514', message = 'This Monara identity is unavailable.';
  end if;

  select * into v_existing from private.goal_image_uploads where upload_id = p_upload_id;
  if found then
    if v_existing.user_id <> p_user_id or v_existing.goal_id <> p_goal_id
      or v_existing.object_path <> p_object_path
      or v_existing.expected_updated_at <> p_expected_updated_at then
      raise exception using errcode = '23505', message = 'That image upload ID was already used.';
    end if;
    -- A retry never reopens a settled intent or grants a second upload.
    return;
  end if;

  select * into v_goal from public.financial_goals
  where id = p_goal_id and user_id = p_user_id and deleted_at is null;
  if not found then
    raise exception using errcode = '42501', message = 'This goal is unavailable.';
  end if;
  if v_goal.updated_at <> p_expected_updated_at then
    raise exception using errcode = '40001', message = 'The goal changed. Refresh before uploading.';
  end if;
  insert into private.goal_image_uploads (
    upload_id, user_id, goal_id, object_path, expected_updated_at
  ) values (p_upload_id, p_user_id, p_goal_id, p_object_path, p_expected_updated_at);
end;
$$;
revoke all on function public.begin_goal_image_upload(uuid, uuid, uuid, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.begin_goal_image_upload(uuid, uuid, uuid, text, timestamptz)
to service_role;

-- Registration can commit after its HTTP response is lost. The backend knows
-- it has not sent any Storage request in that branch. Save a closed tombstone
-- even when the registration has not arrived yet, so a late begin cannot reopen
-- it. This is never used after attempting to send image bytes.
create function public.cancel_unstarted_goal_image_upload(
  p_upload_id uuid,
  p_user_id uuid,
  p_goal_id uuid,
  p_object_path text,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_existing private.goal_image_uploads%rowtype;
begin
  if p_upload_id is null or p_user_id is null or p_goal_id is null
    or p_expected_updated_at is null or p_object_path is null
    or p_object_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
    or split_part(p_object_path, '/', 1) <> p_user_id::text
    or split_part(p_object_path, '/', 2) <> p_goal_id::text then
    raise exception using errcode = '22023', message = 'A valid owned upload path is required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 190026));
  select * into v_existing from private.goal_image_uploads where upload_id = p_upload_id;
  if found then
    if v_existing.user_id <> p_user_id or v_existing.goal_id <> p_goal_id
      or v_existing.object_path <> p_object_path
      or v_existing.expected_updated_at <> p_expected_updated_at then
      raise exception using errcode = '23505', message = 'That image upload ID was already used.';
    end if;
    update private.goal_image_uploads set settled_at = coalesce(settled_at, clock_timestamp())
    where upload_id = p_upload_id;
  elsif exists (select 1 from auth.users where id = p_user_id) then
    insert into private.goal_image_uploads (
      upload_id, user_id, goal_id, object_path, expected_updated_at, settled_at
    ) values (
      p_upload_id, p_user_id, p_goal_id, p_object_path, p_expected_updated_at, clock_timestamp()
    );
  end if;
end;
$$;
revoke all on function public.cancel_unstarted_goal_image_upload(uuid, uuid, uuid, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.cancel_unstarted_goal_image_upload(uuid, uuid, uuid, text, timestamptz)
to service_role;

-- Call only after a definite Storage response or positive exact-object evidence.
-- A timeout, absent object or dead process is not proof of completion. Settlement
-- must still work after acceptance erased the public goal and revoked the User.
create function public.settle_goal_image_upload(p_upload_id uuid, p_user_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_upload_id is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'A valid upload identity is required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 190026));
  if exists (
    select 1 from private.goal_image_uploads
    where upload_id = p_upload_id and user_id <> p_user_id
  ) then
    raise exception using errcode = '42501', message = 'This upload is unavailable.';
  end if;
  update private.goal_image_uploads set settled_at = clock_timestamp()
  where upload_id = p_upload_id and user_id = p_user_id and settled_at is null;
end;
$$;
revoke all on function public.settle_goal_image_upload(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.settle_goal_image_upload(uuid, uuid) to service_role;

create function public.list_pending_goal_image_uploads(p_user_id uuid)
returns table (upload_id uuid, object_path text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'A valid User identity is required.';
  end if;
  return query
    select upload.upload_id, upload.object_path from private.goal_image_uploads as upload
    where upload.user_id = p_user_id and upload.settled_at is null
    order by upload.created_at, upload.upload_id limit 100;
end;
$$;
revoke all on function public.list_pending_goal_image_uploads(uuid)
from public, anon, authenticated;
grant execute on function public.list_pending_goal_image_uploads(uuid) to service_role;

-- The Auth foreign key independently prevents erasing an unresolved request,
-- even if a trusted caller accidentally skips its repository-level check.
-- Remove only settled completion metadata after verifying the current deletion
-- lease; losing that lease or finding an unknown outcome keeps the identity.
create function public.prepare_goal_image_identity_deletion(
  p_user_id uuid,
  p_lease_token uuid
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_user_id is null or p_lease_token is null then
    raise exception using errcode = '22023', message = 'A current deletion lease is required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 190026));
  if not exists (
    select 1 from public.user_deletions
    where user_id = p_user_id and lease_token = p_lease_token
      and lease_until > clock_timestamp() and whatsapp_purged
      and cardinality(connected_account_ids) = 0 and cardinality(trigger_ids) = 0
    for update
  ) then
    raise exception using errcode = '55000', message = 'Account cleanup must be retried.';
  end if;
  if exists (
    select 1 from private.goal_image_uploads
    where user_id = p_user_id and settled_at is null
  ) then
    raise exception using errcode = '55000', message = 'Image upload completion is still unknown.';
  end if;
  delete from private.goal_image_uploads where user_id = p_user_id and settled_at is not null;
end;
$$;
revoke all on function public.prepare_goal_image_identity_deletion(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.prepare_goal_image_identity_deletion(uuid, uuid) to service_role;

-- Permission checks require a server-registered intent. They do not consume it:
-- Storage may run the check in a rolled-back transaction. Completion evidence
-- belongs to the trusted backend and survives deletion in the private table.
create or replace function private.can_upload_goal_image(p_name text)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_goal_id uuid;
begin
  if v_user_id is null or p_name is null
    or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
    or split_part(p_name, '/', 1) <> v_user_id::text then
    return false;
  end if;
  v_goal_id := split_part(p_name, '/', 2)::uuid;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 190026));
  return public.monara_user_is_active(v_user_id) and exists (
    select 1 from private.goal_image_uploads as upload
    join public.financial_goals as goal on goal.id = upload.goal_id and goal.user_id = upload.user_id
    where upload.user_id = v_user_id and upload.goal_id = v_goal_id
      and upload.object_path = p_name and upload.settled_at is null and goal.deleted_at is null
  );
end;
$$;
revoke all on function private.can_upload_goal_image(text) from public, anon, authenticated;
grant execute on function private.can_upload_goal_image(text) to authenticated;
