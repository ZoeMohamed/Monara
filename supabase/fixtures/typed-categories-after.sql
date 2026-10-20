-- Apply 20261019120000 first. Every assertion raises on a changed financial fact.
do $$
begin
 if exists(
  select 1 from category_upgrade_fixture.transactions as expected
  join public.transactions as item on item.id=expected.id
  join public.categories as category on category.id=item.category_id
  where expected.facts is distinct from (to_jsonb(item)-array['category_id','gmail_classification_status','gmail_classification_confidence','gmail_extraction_evidence'])
    or expected.category_name<>category.name or expected.is_archived<>category.is_archived
    or category.kind<>item.transaction_type
 ) then raise exception 'Typed migration changed transaction facts, labels, archive state, timestamps, or kind compatibility.'; end if;
 if exists(
  select 1 from category_upgrade_fixture.budgets as expected join public.budgets as budget on budget.id=expected.id
  join public.categories as category on category.id=budget.category_id
  where expected.facts is distinct from to_jsonb(budget)-'category_id'
    or expected.category_name<>category.name or category.kind<>'expense'
 ) then raise exception 'Typed migration changed budget semantics or timestamps.'; end if;
 if not exists(
  select 1 from public.agent_action_states as state join category_upgrade_fixture.undo as expected using(action_id)
  join public.categories as category on category.id=(state.operation_state #>> '{values,categoryId}')::uuid
  where state.action_id='96000000-0000-4000-8000-000000000001'
    and category.kind='income' and category.name='Shared historic label'
    and state.operation_state #- '{values,categoryId}'=expected.operation_state #- '{values,categoryId}'
    and state.created_at=expected.created_at and state.expires_at=expected.expires_at
 ) then raise exception 'Transaction undo snapshot lost compatible identity or financial state.'; end if;
 if not exists(
  select 1 from public.agent_action_states as state join category_upgrade_fixture.undo as expected using(action_id)
  join public.categories as category on category.id=((state.operation_state ->> 'values')::jsonb ->> 'categoryId')::uuid
  where state.action_id='96000000-0000-4000-8000-000000000002'
    and category.kind='expense' and category.name='Internal'
    and state.operation_state-'values'=expected.operation_state-'values'
    and (state.operation_state ->> 'values')::jsonb-'categoryId'=(expected.operation_state ->> 'values')::jsonb-'categoryId'
    and state.created_at=expected.created_at and state.expires_at=expected.expires_at
 ) then raise exception 'Budget undo snapshot lost expense category or prior financial state.'; end if;
 if exists(select 1 from public.transactions where client_request_id like 'upgrade-%' and gmail_classification_status is not null)
 then raise exception 'Migration scheduled forbidden historical reclassification.'; end if;
 if not exists(
  select 1 from public.agent_action_states as state join category_upgrade_fixture.undo as expected using(action_id)
  where state.action_id='96000000-0000-4000-8000-000000000003'
    and state.operation_state=expected.operation_state
    and state.created_at=expected.created_at and state.expires_at=expected.expires_at
 ) then raise exception 'Unknown pending type and category hint undo snapshot was changed.'; end if;
 -- Exercise the restore shape after verifying the migration left original facts untouched.
 update public.transactions set transaction_type='expense'
   where id='94000000-0000-4000-8000-000000000007';
 update public.transactions set transaction_type=null,
   category_id=(select (operation_state #>> '{values,categoryId}')::uuid from public.agent_action_states
     where action_id='96000000-0000-4000-8000-000000000003')
   where id='94000000-0000-4000-8000-000000000007';
 if not exists(select 1 from public.transactions where id='94000000-0000-4000-8000-000000000007'
   and transaction_type is null and review_status='pending'
   and category_id='93000000-0000-4000-8000-000000000001')
 then raise exception 'Unknown pending type plus category hint cannot be restored.'; end if;
 update public.transactions set description='Edited legacy unknown pending record'
   where id='94000000-0000-4000-8000-000000000008';
end; $$;
-- The upgrade may seed active identities, but cannot resurrect accepted deletion.
do $$
begin
 if not exists(
  select 1 from category_upgrade_fixture.pending_deletion as expected
  join auth.users as identity on identity.id=expected.id
  join public.user_deletions as deletion on deletion.user_id=expected.id
  where identity.email=expected.email
    and identity.banned_until is not distinct from expected.banned_until
    and identity.created_at is not distinct from expected.created_at
    and identity.updated_at is not distinct from expected.updated_at
    and to_jsonb(deletion)=expected.deletion_facts
 ) then raise exception 'Pending deletion Auth identity or cleanup marker changed during upgrade.'; end if;
 if public.monara_user_is_active('97000000-0000-4000-8000-000000000001')
   or exists(select 1 from public.categories where user_id='97000000-0000-4000-8000-000000000001')
   or exists(select 1 from public.profiles where id='97000000-0000-4000-8000-000000000001')
   or exists(select 1 from auth.sessions where user_id='97000000-0000-4000-8000-000000000001')
 then raise exception 'Upgrade reactivated or repopulated an accepted deletion.'; end if;
 if exists(
  select 1 from category_upgrade_fixture.active_users as active
  where not public.monara_user_is_active(active.id)
    or (select count(*) from public.categories as category where category.user_id=active.id
      and category.kind='income' and category.is_default and not category.is_archived
      and category.slug in ('salary','freelance','business','interest','gifts','other-income'))<>6
 ) then raise exception 'Active identity did not receive the six income defaults.'; end if;
 begin
  insert into public.categories(user_id,name,slug,icon,color,kind)
  values('97000000-0000-4000-8000-000000000001','Forbidden resurrection',
    'upgrade-forbidden-resurrection','dot','#123456','expense');
  raise exception 'Accepted deletion guard allowed a category to be recreated.';
 exception when check_violation then
  if sqlerrm<>'This Monara identity is unavailable.' then raise; end if;
 end;
end; $$;
drop schema category_upgrade_fixture cascade;
