-- Goals were added after the deletion migration installed its existing-table
-- fences. Apply the same live-identity check to this later owned table.
create trigger aa_require_live_user
before insert or update on public.financial_goals
for each row execute function private.require_live_monara_user();

create policy live_session_only on public.financial_goals
as restrictive for all to authenticated
using ((select public.monara_session_is_active()))
with check ((select public.monara_session_is_active()));

-- Storage remains provider-managed. A supported INSERT policy gates uploads
-- from the authenticated server client; trusted cleanup still uses its API.
-- VOLATILE gives authorization checks a fresh snapshot after the User lock.
-- This protects Storage's permission check, not an already-started physical
-- upload: Storage may roll permission probes back before its privileged commit.
-- The later durable-intent migration tracks those in-flight completions.
create function private.can_upload_goal_image(p_name text)
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
  -- Validate the complete path before casting any caller-controlled segment.
  v_goal_id := split_part(p_name, '/', 2)::uuid;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 190026));
  return public.monara_user_is_active(v_user_id) and exists (
    select 1 from public.financial_goals
    where id = v_goal_id and user_id = v_user_id and deleted_at is null
  );
end;
$$;
revoke all on function private.can_upload_goal_image(text) from public, anon, authenticated;
grant execute on function private.can_upload_goal_image(text) to authenticated;

create policy goal_images_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'goal-images' and private.can_upload_goal_image(name)
);

-- Uploads use unique names and upsert:false. No authenticated UPDATE, SELECT
-- or DELETE policy is added; owned reads and removals remain backend operations.
