-- Flexible holder evidence is deterministic and shared by resolve and apply.
-- No existing transactions are reclassified by this migration.
create function private.holder_word_one_edit(p_left text,p_right text) returns boolean
language plpgsql immutable set search_path='' as $$
declare
  v_left integer:=char_length(p_left);
  v_right integer:=char_length(p_right);
  v_first integer:=1;
  v_second integer:=1;
  v_edits integer:=0;
begin
  if v_left<4 or v_right<4 or abs(v_left-v_right)>1 then return false; end if;
  while v_first<=v_left and v_second<=v_right loop
    if substr(p_left,v_first,1)=substr(p_right,v_second,1) then
      v_first:=v_first+1; v_second:=v_second+1;
    else
      v_edits:=v_edits+1;
      if v_edits>1 then return false; end if;
      if v_left>=v_right then v_first:=v_first+1; end if;
      if v_right>=v_left then v_second:=v_second+1; end if;
    end if;
  end loop;
  return v_edits+case when v_first<=v_left or v_second<=v_right then 1 else 0 end<=1;
end; $$;
revoke all on function private.holder_word_one_edit(text,text) from public,anon,authenticated;
grant execute on function private.holder_word_one_edit(text,text) to service_role;

create function private.holder_name_matches(p_counterparty text,p_holder text) returns boolean
language plpgsql immutable set search_path='' as $$
declare
  v_holder text:=private.normalized_holder_name(p_holder);
  v_other text:=private.normalized_holder_name(p_counterparty);
  v_shorter text[];
  v_longer text[];
  v_swap text[];
begin
  if v_holder is null or v_other is null then return false; end if;
  if v_holder=v_other then return true; end if;
  select array_agg(distinct word order by word) into v_shorter
    from unnest(string_to_array(v_holder,' ')) as words(word);
  select array_agg(distinct word order by word) into v_longer
    from unnest(string_to_array(v_other,' ')) as words(word);
  if cardinality(v_shorter)>cardinality(v_longer) then
    v_swap:=v_shorter; v_shorter:=v_longer; v_longer:=v_swap;
  end if;
  if (select count(*) from unnest(v_shorter) as words(word)
      where char_length(word)>=3 and word~'[[:alpha:]]')<2
    or exists(select 1 from unnest(v_shorter) as words(word) where char_length(word)<2) then
    return false;
  end if;
  -- An injective match prevents one repeated word from satisfying two names.
  -- Explore alternative assignments instead of greedily consuming an exact word.
  return exists(
    with recursive matches(position,used,typos) as (
      select 1,array[]::integer[],0
      union all
      select matches.position+1,matches.used||candidate.index::integer,
        matches.typos+case when v_shorter[matches.position]=candidate.word then 0 else 1 end
      from matches cross join unnest(v_longer) with ordinality as candidate(word,index)
      where matches.position<=cardinality(v_shorter)
        and not(candidate.index::integer=any(matches.used))
        and (v_shorter[matches.position]=candidate.word
          or (matches.typos<2 and private.holder_word_one_edit(v_shorter[matches.position],candidate.word)))
    ) select 1 from matches where position>cardinality(v_shorter)
  );
end; $$;
revoke all on function private.holder_name_matches(text,text) from public,anon,authenticated;
grant execute on function private.holder_name_matches(text,text) to service_role;

create or replace function public.imported_transaction_for_category(p_transaction_id uuid)
returns table(user_id uuid,merchant_name text,location text,needs_category boolean,
  kind text,flow_direction text,description text,counterparty_name text,
  counterparty_type text,is_transfer boolean,internal_transfer boolean,holder_name text)
language sql stable security invoker set search_path='' as $$
  select item.user_id,item.merchant_name,item.location,
    item.category_id is null and item.updated_at=item.created_at and item.deleted_at is null
      and item.review_status='pending'
      and (item.gmail_classification_status='pending' or item.gmail_classification_status is null),
    item.transaction_type,item.flow_direction,item.description,
    item.gmail_extraction_evidence ->> 'counterpartyName',
    coalesce(item.gmail_extraction_evidence ->> 'counterpartyType','unknown'),
    coalesce((item.gmail_extraction_evidence ->> 'isTransfer')::boolean,false),
    private.holder_name_matches(
        item.gmail_extraction_evidence ->> 'counterpartyName',profile.full_name),
    profile.full_name
  from public.transactions as item
  join public.processed_gmail_messages as message on message.id=item.processed_gmail_message_id
  join public.gmail_connections as connection on connection.id=message.gmail_connection_id
    and connection.user_id=item.user_id and connection.status='active'
  left join public.profiles as profile on profile.id=item.user_id
  where item.id=p_transaction_id and item.source_type='gmail_email';
$$;
revoke execute on function public.imported_transaction_for_category(uuid) from public,anon,authenticated;
grant execute on function public.imported_transaction_for_category(uuid) to service_role;

create or replace function public.set_imported_category(
  p_transaction_id uuid,p_category_id uuid default null,p_kind text default null,p_confidence numeric default null
) returns table(applied boolean,user_id uuid,review_status text)
language plpgsql security invoker set search_path='' as $$
declare
  v_item public.transactions%rowtype;
  v_category public.categories%rowtype;
  v_holder text;
  v_internal boolean:=false;
  v_qualified boolean:=false;
  v_review_status text;
begin
  select item.* into v_item from public.transactions as item
    join public.processed_gmail_messages as message on message.id=item.processed_gmail_message_id
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
  if p_category_id is not null then
    select category.* into v_category from public.categories as category
      where category.id=p_category_id and category.user_id=v_item.user_id
        and not category.is_archived and category.kind=p_kind for share;
    if v_category.id is null or p_kind not in ('expense','income','exclusion')
      or (p_kind='expense' and v_item.flow_direction is distinct from 'out')
      or (p_kind='income' and v_item.flow_direction is distinct from 'in') then
      raise exception using errcode='22023',message='An active compatible owned Category is required.';
    end if;
    if v_category.kind='exclusion' and v_category.is_default and v_category.slug='internal' then
      select profile.full_name into v_holder from public.profiles as profile
        where profile.id=v_item.user_id for share;
      v_internal:=private.holder_name_matches(
          v_item.gmail_extraction_evidence ->> 'counterpartyName',v_holder);
      -- Internal requires the stored counterparty to match the current confirmed name.
      if not coalesce(v_internal,false) then
        update public.transactions set gmail_classification_status='needs_review',
          gmail_auto_confirm_pending=false where id=v_item.id;
        return query select false,v_item.user_id,v_item.review_status; return;
      end if;
    end if;
    if v_item.financial_account_id is not null then
      perform 1 from public.financial_accounts as account
        where account.id=v_item.financial_account_id and account.user_id=v_item.user_id
          and account.is_active for share;
      v_qualified:=found;
    end if;
    v_qualified:=v_qualified and v_item.gmail_auto_confirm_pending
      and v_item.ai_confidence>=public.gmail_auto_confirm_confidence()
      and p_confidence>=0.95 and v_item.amount is not null and v_item.currency='IDR'
      and v_item.gmail_extraction_evidence ->> 'occurredOn' is not null
      -- Personal/unknown transfers may be an unrecognized own-account transfer.
      -- Keep the category suggestion pending rather than guessing financial impact.
      and (not coalesce((v_item.gmail_extraction_evidence ->> 'isTransfer')::boolean,false)
        or coalesce(v_internal,false)
        or v_item.gmail_extraction_evidence ->> 'counterpartyType'='business')
      and (p_kind in ('expense','income') or coalesce(v_internal,false));
  elsif p_kind is not null then
    raise exception using errcode='22023',message='Classification category is missing.';
  end if;
  v_review_status:=case when coalesce(v_qualified,false) then 'confirmed' else 'pending' end;
  update public.transactions set category_id=p_category_id,
    transaction_type=case when p_category_id is null then v_item.transaction_type else p_kind end,
    review_status=v_review_status,gmail_auto_confirm_pending=false,
    gmail_classification_confidence=p_confidence,
    gmail_classification_status=case
      when p_category_id is null or p_confidence is null or p_confidence<0.95
        or (p_kind='exclusion' and not coalesce(v_internal,false)) then 'needs_review'
      else 'completed' end
    where id=v_item.id;
  return query select true,v_item.user_id,v_review_status;
end; $$;
revoke execute on function public.set_imported_category(uuid,uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.set_imported_category(uuid,uuid,text,numeric) to service_role;

