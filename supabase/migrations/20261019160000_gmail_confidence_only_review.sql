-- New Gmail confidence and fallback policy for future imports/classifications. Existing transactions,
-- their financial treatment, and User corrections are not reclassified.
create or replace function public.gmail_auto_confirm_confidence()
returns numeric language sql immutable set search_path='' as $$ select 0.5::numeric $$;
comment on function public.gmail_auto_confirm_confidence() is
  'Minimum known Gmail extraction/category confidence for a complete owned import.';

-- Add typed fallbacks and Person for existing active Users and future signups.
create or replace function private.seed_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories (user_id, name, slug, icon, color, is_default, kind)
  values
    (p_user_id, 'Housing', 'housing', 'home', '#A16207', true, 'expense'),
    (p_user_id, 'Bills', 'bills', 'bills', '#8B5CF6', true, 'expense'),
    (p_user_id, 'Services', 'services', 'services', '#7C3AED', true, 'expense'),
    (p_user_id, 'Resto & Cafe', 'resto-cafe', 'food', '#F97316', true, 'expense'),
    (p_user_id, 'Groceries', 'groceries', 'groceries', '#22C55E', true, 'expense'),
    (p_user_id, 'Ride-hail', 'ride-hail', 'transport', '#0EA5E9', true, 'expense'),
    (p_user_id, 'Own Vehicle', 'own-vehicle', 'transport', '#0284C7', true, 'expense'),
    (p_user_id, 'Ecommerce', 'ecommerce', 'shopping', '#EC4899', true, 'expense'),
    (p_user_id, 'Retail', 'retail', 'store', '#DB2777', true, 'expense'),
    (p_user_id, 'Digital', 'digital', 'digital', '#6366F1', true, 'expense'),
    (p_user_id, 'Travel', 'travel', 'travel', '#06B6D4', true, 'expense'),
    (p_user_id, 'Activities', 'activities', 'film', '#4F46E5', true, 'expense'),
    (p_user_id, 'Bar & Drinks', 'bar-drinks', 'drinks', '#F59E0B', true, 'expense'),
    (p_user_id, 'Insurance', 'insurance', 'shield', '#2563EB', true, 'expense'),
    (p_user_id, 'Clinic & Meds', 'clinic-meds', 'heart', '#EF4444', true, 'expense'),
    (p_user_id, 'Fit & Wellness', 'fit-wellness', 'pulse', '#14B8A6', true, 'expense'),
    (p_user_id, 'Family', 'family', 'family', '#D946EF', true, 'expense'),
    (p_user_id, 'Giving', 'giving', 'giving', '#F43F5E', true, 'expense'),
    (p_user_id, 'Misc', 'misc', 'dot', '#64748B', true, 'expense'),
    (p_user_id, 'Repayment', 'repayment', 'repayment', '#78716C', true, 'exclusion'),
    (p_user_id, 'Internal', 'internal', 'internal', '#64748B', true, 'exclusion'),
    (p_user_id, 'Reimbursed', 'reimbursed', 'reimbursed', '#10B981', true, 'exclusion'),
    (p_user_id, 'Investment', 'investment', 'investment', '#0D9488', true, 'exclusion'),
    (p_user_id, 'One-off', 'one-off', 'one-off', '#F59E0B', true, 'exclusion'),
    (p_user_id, 'Cancelled', 'cancelled', 'cancelled', '#94A3B8', true, 'exclusion'),
    (p_user_id, 'Salary', 'salary', 'income', '#10B981', true, 'income'),
    (p_user_id, 'Freelance', 'freelance', 'income', '#10B981', true, 'income'),
    (p_user_id, 'Business', 'business', 'income', '#10B981', true, 'income'),
    (p_user_id, 'Interest', 'interest', 'income', '#10B981', true, 'income'),
    (p_user_id, 'Gifts', 'gifts', 'income', '#10B981', true, 'income'),
    (p_user_id, 'Other Income', 'other-income', 'income', '#10B981', true, 'income'),
    (p_user_id, 'Misc', 'misc-income', 'dot', '#64748B', true, 'income'),
    (p_user_id, 'Misc', 'misc-exclusion', 'dot', '#64748B', true, 'exclusion'),
    (p_user_id, 'Person', 'person', 'family', '#D946EF', true, 'expense'),
    (p_user_id, 'Person', 'person-income', 'family', '#10B981', true, 'income')
  on conflict (user_id, slug) do nothing;
end;
$$;

revoke execute on function private.seed_default_categories(uuid)
  from public, anon, authenticated;

do $$ declare v_user record; begin
  for v_user in select id from auth.users loop
    -- Share deletion acceptance's lock before checking whether writes are allowed.
    perform pg_advisory_xact_lock(hashtextextended(v_user.id::text,190026));
    if public.monara_user_is_active(v_user.id) then
      -- Add only the new presets. Do not recreate previously deleted defaults
      -- or reactivate archived categories as a side effect of this migration.
      insert into public.categories(user_id,name,slug,icon,color,is_default,kind)
      values
        (v_user.id,'Misc','misc-income','dot','#64748B',true,'income'),
        (v_user.id,'Misc','misc-exclusion','dot','#64748B',true,'exclusion'),
        (v_user.id,'Person','person','family','#D946EF',true,'expense'),
        (v_user.id,'Person','person-income','family','#10B981',true,'income')
      on conflict (user_id,slug) do nothing;
    end if;
  end loop;
end; $$;


-- A fallback can assign Expense while its original cash direction is unknown.
-- Preserve Gmail's stated direction instead of manufacturing one from that type.
create or replace function private.normalize_transaction_foundation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.occurred_on is null and new.source_type<>'gmail_email' then
    new.occurred_on:=coalesce(case when tg_op='UPDATE' then old.occurred_on end,
      (statement_timestamp() at time zone 'Asia/Jakarta')::date);
  end if;
  if new.source_type='gmail_email' and new.review_status='pending' and new.flow_direction is null then
    new.flow_direction:=null;
  else
    new.flow_direction:=case new.transaction_type when 'expense' then 'out'
      when 'income' then 'in' when 'exclusion' then new.flow_direction
      else case when new.flow_direction in ('in','out') then new.flow_direction end end;
  end if;
  return new;
end; $$;

-- Preserve original structured name evidence while displaying the normalized name.
create or replace function public.record_gmail_extraction(
  p_processed_message_id uuid,
  p_outcome text,
  p_items jsonb,
  p_sender_verified boolean,
  p_institution_key text default null
)
returns table (
  transaction_ids uuid[],
  already_finished boolean,
  uncategorized_transaction_ids uuid[]
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_message public.processed_gmail_messages%rowtype;
begin
  if p_outcome not in ('transactions', 'skipped', 'failed') then
    raise exception using errcode = '22023', message = 'Unknown extraction outcome.';
  end if;
  if jsonb_typeof(p_items) <> 'array'
    or (p_outcome = 'transactions') <> (jsonb_array_length(p_items) > 0) then
    raise exception using errcode = '22023', message = 'Items do not match the outcome.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) as entry(item)
    where entry.item -> 'normalizedDisplayName' <> 'null'::jsonb
      and (jsonb_typeof(entry.item -> 'normalizedDisplayName') <> 'string'
        or char_length(entry.item ->> 'normalizedDisplayName') > 80)
  ) then
    raise exception using errcode = '22023', message = 'Normalized display name is invalid.';
  end if;

  select message.*
    into v_message
    from public.processed_gmail_messages as message
    join public.gmail_connections as connection
      on connection.id = message.gmail_connection_id
      and connection.user_id = message.user_id
    where message.id = p_processed_message_id
      and connection.status = 'active'
    for update of message
    for share of connection;
  if v_message.id is null then
    raise exception using errcode = 'P0002', message = 'Gmail connection is not active.';
  end if;

  if v_message.processing_status not in ('processed', 'skipped') and p_outcome = 'transactions' then
    insert into public.transactions (
      user_id,
      processed_gmail_message_id,
      source_item_index,
      source_type,
      review_status,
      transaction_type,
      flow_direction,
      merchant_name,
      amount,
      currency,
      occurred_on,
      occurred_time,
      description,
      location,
      account_hint,
      financial_account_id,
      category_id,
      ai_confidence,
      gmail_auto_confirm_pending,
      gmail_classification_status,
      gmail_extraction_evidence
    )
    select
      v_message.user_id,
      v_message.id,
      (mapped.ordinality - 1)::integer,
      'gmail_email',
      'pending',
      mapped.kind,
      mapped.flow_direction,
      mapped.merchant_name,
      mapped.amount,
      mapped.currency,
      mapped.occurred_on,
      mapped.occurred_time,
      mapped.description,
      mapped.location,
      mapped.account_hint,
      mapped.financial_account_id,
      null,
      round(mapped.confidence, 3),
      qualified.eligible,
      'pending',
      mapped.evidence
    from (
      select
        entry.ordinality,
        entry.item as evidence,
        entry.item ->> 'kind' as kind,
        case entry.item ->> 'kind'
          when 'expense' then 'out'
          when 'income' then 'in'
          when 'exclusion' then entry.item ->> 'flowDirection'
          else case when entry.item ->> 'flowDirection' in ('in','out')
            then entry.item ->> 'flowDirection' end
        end as flow_direction,
        coalesce(nullif(btrim(entry.item ->> 'normalizedDisplayName'),''),
          entry.item ->> 'merchantName') as merchant_name,
        (entry.item -> 'money' ->> 'amountMinor')::numeric as amount,
        entry.item -> 'money' ->> 'currency' as currency,
        (entry.item ->> 'occurredOn')::date as occurred_on,
        (entry.item ->> 'occurredTime')::time as occurred_time,
        entry.item ->> 'description' as description,
        entry.item ->> 'location' as location,
        entry.item ->> 'accountHint' as account_hint,
        public.gmail_item_account(
          v_message.user_id,
          v_message.gmail_connection_id,
          p_institution_key,
          entry.item ->> 'kind',
          entry.item ->> 'accountLastFour'
        ) as financial_account_id,
        (entry.item ->> 'confidence')::numeric as confidence
      from jsonb_array_elements(p_items) with ordinality as entry (item, ordinality)
    ) as mapped
    cross join lateral (
      select
        coalesce(
          p_sender_verified
            and mapped.confidence >= public.gmail_auto_confirm_confidence()
            and mapped.kind in ('expense', 'income', 'exclusion')
            and mapped.amount is not null
            and mapped.currency = 'IDR'
            and mapped.evidence ->> 'occurredOn' is not null
            and mapped.financial_account_id is not null
            and (mapped.merchant_name is not null or mapped.description is not null),
          false
        ) as eligible
    ) as qualified
    on conflict (processed_gmail_message_id, source_item_index)
      where processed_gmail_message_id is not null
      do nothing;
  end if;

  if v_message.processing_status not in ('processed', 'skipped') then
    update public.processed_gmail_messages
      set processing_status = case p_outcome
          when 'transactions' then 'processed'
          else p_outcome
        end,
        processed_at = statement_timestamp()
      where id = v_message.id;
  end if;

  return query
    select
      coalesce(array_agg(item.id order by item.source_item_index), array[]::uuid[]),
      v_message.processing_status in ('processed', 'skipped'),
      coalesce(
        array_agg(item.id order by item.source_item_index) filter (
          where item.gmail_classification_status = 'pending'
        ),
        array[]::uuid[]
      )
      from public.transactions as item
      where item.processed_gmail_message_id = v_message.id;
end;
$$;


-- A future classification may restore only its typed Misc fallback. Keep custom
-- slug collisions intact by assigning the fallback a reserved unique slug.
create function private.gmail_misc_category(p_user_id uuid,p_kind text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  v_kind text:=coalesce(p_kind,'expense');
  v_slug text;
  v_category public.categories%rowtype;
  v_id uuid;
begin
  if v_kind not in ('expense','income','exclusion') then
    raise exception using errcode='22023',message='Fallback category type is invalid.';
  end if;
  v_slug:=case v_kind when 'income' then 'misc-income'
    when 'exclusion' then 'misc-exclusion' else 'misc' end;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||v_kind,190027));
  select category.* into v_category from public.categories as category
    where category.user_id=p_user_id and category.kind=v_kind and category.is_default
      and (category.slug=v_slug or category.slug like 'gmail-fallback-'||v_kind||'-%')
    order by (category.slug=v_slug) desc,category.created_at,category.id limit 1 for update;
  if v_category.id is not null then
    if v_category.is_archived then
      update public.categories set is_archived=false where id=v_category.id;
    end if;
    return v_category.id;
  end if;
  if exists(select 1 from public.categories where user_id=p_user_id and slug=v_slug) then
    v_slug:='gmail-fallback-'||v_kind||'-'||replace(gen_random_uuid()::text,'-','');
  end if;
  insert into public.categories(user_id,name,slug,icon,color,is_default,kind)
    values(p_user_id,'Misc',v_slug,'dot','#64748B',true,v_kind) returning id into v_id;
  return v_id;
end; $$;
revoke execute on function private.gmail_misc_category(uuid,text) from public,anon,authenticated;
grant execute on function private.gmail_misc_category(uuid,text) to service_role;

create or replace function public.set_imported_category(
  p_transaction_id uuid,p_category_id uuid default null,p_kind text default null,p_confidence numeric default null
) returns table(applied boolean,user_id uuid,review_status text)
language plpgsql security invoker set search_path='' as $$
declare
  v_item public.transactions%rowtype;
  v_category public.categories%rowtype;
  v_holder text;
  v_misc_id uuid;
  v_kind text;
  v_internal boolean:=false;
  v_use_fallback boolean:=false;
  v_active_owned_account boolean:=false;
  v_financial_facts_valid boolean:=false;
  v_confidence_qualified boolean:=false;
  v_extraction_confidence numeric;
  v_review_status text;
begin
  select item.* into v_item from public.transactions as item
    join public.processed_gmail_messages as message on message.id=item.processed_gmail_message_id
      and message.user_id=item.user_id
    join public.gmail_connections as connection on connection.id=message.gmail_connection_id
      and connection.user_id=item.user_id and connection.status='active'
    where item.id=p_transaction_id and item.source_type='gmail_email'
    for update of item for share of connection;
  if v_item.id is null then
    raise exception using errcode='P0002',message='Imported transaction not found.';
  end if;
  if v_item.deleted_at is not null or v_item.category_id is not null
    or v_item.updated_at<>v_item.created_at or v_item.review_status<>'pending'
    or (v_item.gmail_classification_status is not null and v_item.gmail_classification_status<>'pending') then
    return query select false,v_item.user_id,v_item.review_status; return;
  end if;
  if p_confidence is not null and (p_confidence<0 or p_confidence>1) then
    raise exception using errcode='22023',message='Classification confidence is invalid.';
  end if;
  if p_kind is not null and p_kind not in ('expense','income','exclusion') then
    raise exception using errcode='22023',message='Classification type is invalid.';
  end if;
  v_use_fallback:=p_category_id is null;
  if p_category_id is not null then
    -- Check ownership before recognizing old Misc hints. An owned default Misc
    -- may be archived or typed incorrectly; normalize it to the current rule.
    select category.* into v_category from public.categories as category
      where category.id=p_category_id and category.user_id=v_item.user_id;
    if v_category.id is null then
      raise exception using errcode='22023',message='An active compatible owned Category is required.';
    end if;
    v_use_fallback:=v_category.is_default and (
      (v_category.kind='expense' and (v_category.slug='misc'
        or v_category.slug like 'gmail-fallback-expense-%'))
      or (v_category.kind='income' and (v_category.slug='misc-income'
        or v_category.slug like 'gmail-fallback-income-%'))
      or (v_category.kind='exclusion' and (v_category.slug='misc-exclusion'
        or v_category.slug like 'gmail-fallback-exclusion-%')));
    if not v_use_fallback then
      -- Specific decisions need a stable active category. Do not hold a shared
      -- Misc lock before its resolver's advisory/update locks, which can deadlock
      -- parallel workers normalizing the same archived fallback.
      select category.* into v_category from public.categories as category
        where category.id=p_category_id and category.user_id=v_item.user_id for share;
      if v_category.id is null then
        raise exception using errcode='22023',message='An active compatible owned Category is required.';
      end if;
      v_kind:=coalesce(p_kind,v_item.transaction_type,v_category.kind);
      if v_category.is_archived or v_category.kind<>v_kind
        or (v_kind='expense' and v_item.flow_direction='in')
        or (v_kind='income' and v_item.flow_direction='out') then
        raise exception using errcode='22023',message='An active compatible owned Category is required.';
      end if;
      if v_category.kind='exclusion' and v_category.is_default and v_category.slug='internal' then
        select profile.full_name into v_holder from public.profiles as profile
          where profile.id=v_item.user_id for share;
        v_internal:=private.holder_name_matches(
          v_item.gmail_extraction_evidence ->> 'counterpartyName',v_holder);
        -- Internal uses original names, never the normalized display or labels.
        v_use_fallback:=not coalesce(v_internal,false);
      end if;
      -- A specific category cannot create missing cash direction. Verified
      -- Internal and default Person retain priority while incomplete and pending.
      if v_item.flow_direction is null and not coalesce(v_internal,false)
        and not(v_category.is_default and (
          (v_category.kind='expense' and v_category.slug='person')
          or (v_category.kind='income' and v_category.slug='person-income'))) then
        v_use_fallback:=true;
      end if;
    end if;
  end if;
  if v_use_fallback then
    -- Generic fallback is always Income Misc for clear money in, else Expense
    -- Misc. Original extracted type and old Misc hints never force exclusion.
    v_kind:=case when v_item.flow_direction='in' then 'income' else 'expense' end;
    v_misc_id:=private.gmail_misc_category(v_item.user_id,v_kind);
    select category.* into v_category from public.categories as category
      where category.id=v_misc_id for share;
  end if;
  if v_item.financial_account_id is not null then
    perform 1 from public.financial_accounts as account
      where account.id=v_item.financial_account_id and account.user_id=v_item.user_id
        and account.is_active for share;
    v_active_owned_account:=found;
  end if;
  -- ai_confidence is rounded to three decimals for compatibility. Use original
  -- evidence when present so .4995 cannot round into qualification at .500.
  v_extraction_confidence:=coalesce(
    (v_item.gmail_extraction_evidence ->> 'confidence')::numeric,v_item.ai_confidence);
  -- PostgreSQL LEAST ignores NULL scores and returns NULL if both are absent.
  v_confidence_qualified:=coalesce(
    least(v_extraction_confidence,p_confidence)>=public.gmail_auto_confirm_confidence(),false);
  v_financial_facts_valid:=v_kind in ('expense','income','exclusion')
    and v_item.amount is not null and v_item.currency='IDR'
    and v_item.occurred_on is not null and v_item.flow_direction in ('in','out');
  v_review_status:=case
    when coalesce(v_active_owned_account,false) and coalesce(v_financial_facts_valid,false)
      and v_confidence_qualified then 'confirmed'
    else 'pending' end;
  update public.transactions set category_id=v_category.id,
    transaction_type=v_kind,flow_direction=v_item.flow_direction,
    review_status=v_review_status,gmail_auto_confirm_pending=false,
    gmail_classification_confidence=p_confidence,
    gmail_classification_status=case when v_review_status='confirmed' then 'completed' else 'needs_review' end
    where id=v_item.id;
  return query select true,v_item.user_id,v_review_status;
end; $$;
revoke execute on function public.set_imported_category(uuid,uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.set_imported_category(uuid,uuid,text,numeric) to service_role;

-- Legacy label-based calls use the same score/fallback rule and return the real
-- classification result instead of claiming that a fallback did not apply.
create or replace function public.set_imported_category(p_transaction_id uuid,p_category_name text)
returns table(applied boolean,user_id uuid,review_status text)
language plpgsql security invoker set search_path='' as $$
declare v_item public.transactions%rowtype; v_category_id uuid;
begin
  select item.* into v_item from public.transactions as item where item.id=p_transaction_id;
  select case when count(*)=1 then (array_agg(category.id))[1] end into v_category_id
    from public.categories as category where category.user_id=v_item.user_id
      and category.kind=v_item.transaction_type and not category.is_archived
      and lower(btrim(category.name))=lower(btrim(p_category_name));
  return query select * from public.set_imported_category(p_transaction_id,v_category_id,
    v_item.transaction_type,null::numeric);
end; $$;
