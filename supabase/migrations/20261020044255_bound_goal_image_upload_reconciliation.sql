-- An accepted image upload cannot remain an unknown deletion blocker forever.
-- Keep a generous 15-minute request window, then require an exact Storage
-- absence check before trusted cleanup may settle the old intent. The RLS
-- fence prevents a Storage insert from committing after that window.
comment on table private.goal_image_uploads is
  'Server-private upload paths. Unsettled requests block deletion until Storage completion is established or an absent object is reconciled after the 15-minute upload window.';

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
      and upload.object_path = p_name and upload.settled_at is null
      and upload.created_at > clock_timestamp() - interval '15 minutes'
      and goal.deleted_at is null
  );
end;
$$;
revoke all on function private.can_upload_goal_image(text) from public, anon, authenticated;
grant execute on function private.can_upload_goal_image(text) to authenticated;

create function public.settle_expired_goal_image_upload(p_upload_id uuid, p_user_id uuid)
returns boolean
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
  where upload_id = p_upload_id and user_id = p_user_id and settled_at is null
    and created_at <= clock_timestamp() - interval '15 minutes';
  if found then return true; end if;
  return exists (
    select 1 from private.goal_image_uploads
    where upload_id = p_upload_id and user_id = p_user_id and settled_at is not null
  );
end;
$$;
revoke all on function public.settle_expired_goal_image_upload(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.settle_expired_goal_image_upload(uuid, uuid) to service_role;
