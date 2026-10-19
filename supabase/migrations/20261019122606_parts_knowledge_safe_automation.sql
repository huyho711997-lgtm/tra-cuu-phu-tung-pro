begin;
-- Keep accents, punctuation, part numbers and positions. Only case/spacing/NFC are equivalent.
create or replace function public.kgpt_parts_exact_key(p_value text)
returns text language sql immutable strict security invoker set search_path='' as $$
  select lower(normalize(trim(regexp_replace(p_value,'\s+',' ','g')),NFC));
$$;
revoke all on function public.kgpt_parts_exact_key(text) from public,anon;
grant execute on function public.kgpt_parts_exact_key(text) to authenticated,service_role;

alter table public.parts_search_knowledge
  add column review_method text not null default 'manual' check(review_method in ('manual','exact_name','approved_rule')),
  add column review_reason text not null default '' check(char_length(review_reason)<=400),
  add column inherited_from uuid references public.parts_search_knowledge(id) on delete set null;
create index parts_knowledge_inherited_from on public.parts_search_knowledge(inherited_from);
grant update(review_method,review_reason,inherited_from) on public.parts_search_knowledge to authenticated;

-- Admin-only assessment runs with the caller's RLS; it never promotes a new synonym.
create or replace function public.kgpt_knowledge_review_decision(p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r public.parts_search_knowledge; source_id uuid;
begin
  if auth.uid() is null or not public.kgpt_is_active_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  select * into r from public.parts_search_knowledge where id=p_id;
  if not found or r.status<>'pending' then return jsonb_build_object('method','manual','reason','Không còn ở trạng thái chờ duyệt.'); end if;
  if exists(select 1 from public.parts_search_knowledge k where k.id<>r.id and k.alias_key=r.alias_key and k.brand=r.brand
    and public.kgpt_parts_exact_key(k.alias)=public.kgpt_parts_exact_key(r.alias)
    and public.kgpt_parts_exact_key(k.canonical_name)=public.kgpt_parts_exact_key(r.canonical_name)
    and k.models @> r.models and r.models @> k.models and k.years @> r.years and r.years @> k.years
    and k.kind=r.kind and k.status in ('rejected','disabled')) then
    return jsonb_build_object('method','manual','reason','Có quyết định từ chối hoặc ngừng áp dụng trong cùng phạm vi.');
  end if;
  if not exists(select 1 from public.lich_su_bao_gia w where w.ten_phu_tung=r.canonical_name and w.hang_xe=r.brand
    and w.hieu_xe=any(r.models) and (cardinality(r.years)=0 or w.nam_sx=any(r.years))
    and (r.kind='all' or r.kind='genuine' and w.chinh_hang='Chính hãng' or r.kind='aftermarket' and w.chinh_hang in ('Thay thế','Hàng ngoài'))) then
    return jsonb_build_object('method','manual','reason','Chưa đối chiếu được tên kho trong đúng bộ lọc xe.');
  end if;
  if public.kgpt_parts_exact_key(r.alias)=public.kgpt_parts_exact_key(r.canonical_name) then
    return jsonb_build_object('method','exact_name','reason','Cùng tên sau khi chuẩn hóa chữ hoa/thường, khoảng trắng và Unicode; giữ nguyên dấu, mã và vị trí.');
  end if;
  select k.id into source_id from public.parts_search_knowledge k where k.id<>r.id and k.alias_key=r.alias_key and k.brand=r.brand
    and public.kgpt_parts_exact_key(k.alias)=public.kgpt_parts_exact_key(r.alias) and k.canonical_name=r.canonical_name
    and k.models @> r.models and r.models @> k.models and k.years @> r.years and r.years @> k.years and k.kind=r.kind
    and k.status='approved' and k.review_method='manual'
    order by k.reviewed_at desc nulls last,k.id limit 1;
  if source_id is not null then
    return jsonb_build_object('method','approved_rule','source_id',source_id,'reason','Dùng lại quy tắc đã được quản trị viên duyệt; trùng tên gọi, tên kho và toàn bộ phạm vi xe.');
  end if;
  return jsonb_build_object('method','manual','reason','Tên gọi mới hoặc chưa đủ bằng chứng; chỉ ghi nhận đề xuất, chưa tự duyệt.');
end;
$$;
revoke all on function public.kgpt_knowledge_review_decision(uuid) from public,anon;
grant execute on function public.kgpt_knowledge_review_decision(uuid) to authenticated;

create or replace function kgpt_private.parts_knowledge_stamp()
returns trigger language plpgsql security invoker set search_path='' as $$
declare decision jsonb;
begin
  if tg_op='UPDATE' then
    if not public.kgpt_is_active_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
    if row(new.alias,new.canonical_name,new.brand,new.models,new.years,new.kind) is distinct from row(old.alias,old.canonical_name,old.brand,old.models,old.years,old.kind) then
      new.review_method='manual';new.review_reason='';new.inherited_from=null;
    end if;
    if new.review_method<>'manual' and new.status='approved' then
      if old.status='pending' then
        decision=public.kgpt_knowledge_review_decision(old.id);
        if decision->>'method'<>new.review_method then raise exception 'AUTO_REVIEW_NOT_ELIGIBLE' using errcode='22023'; end if;
        new.review_reason=decision->>'reason';new.inherited_from=(decision->>'source_id')::uuid;
      elsif row(new.review_method,new.review_reason,new.inherited_from) is distinct from row(old.review_method,old.review_reason,old.inherited_from) then
        raise exception 'AUTO_REVIEW_NOT_ELIGIBLE' using errcode='22023';
      end if;
    elsif new.review_method='manual' then new.review_reason='';new.inherited_from=null;
    end if;
    new.reviewed_by=auth.uid();new.reviewed_at=now();
  else
    new.created_by=auth.uid();new.reviewed_by=null;new.reviewed_at=null;new.status='pending';
    new.review_method='manual';new.review_reason='';new.inherited_from=null;
  end if;
  new.updated_at=now();return new;
end;
$$;
drop trigger parts_knowledge_stamp on public.parts_search_knowledge;
create trigger parts_knowledge_stamp before insert or update of alias,canonical_name,brand,models,years,kind,note,status,review_method,review_reason,inherited_from
on public.parts_search_knowledge for each row execute function kgpt_private.parts_knowledge_stamp();
drop trigger parts_knowledge_audit on public.parts_search_knowledge;
create trigger parts_knowledge_audit after insert or update of alias,canonical_name,brand,models,years,kind,note,status,review_method,review_reason,inherited_from
on public.parts_search_knowledge for each row execute function kgpt_private.parts_knowledge_audit();

create or replace function public.kgpt_auto_review_parts_knowledge(p_ids uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.parts_search_knowledge; decision jsonb; reviewed jsonb='[]'; held jsonb='[]';
begin
  if auth.uid() is null or not public.kgpt_is_active_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_ids is null or cardinality(p_ids)>25 then raise exception 'INVALID_REVIEW_BATCH' using errcode='22023'; end if;
  for r in select * from public.parts_search_knowledge where id=any(p_ids) and status='pending' order by id for update skip locked loop
    -- Serialize approval/disable operations on any rules this row may inherit.
    perform 1 from public.parts_search_knowledge k where k.alias_key=r.alias_key and k.brand=r.brand and k.status in ('approved','disabled','rejected') order by k.id for share;
    decision=public.kgpt_knowledge_review_decision(r.id);
    if decision->>'method' in ('exact_name','approved_rule') then
      update public.parts_search_knowledge set status='approved',review_method=decision->>'method',review_reason=decision->>'reason',inherited_from=(decision->>'source_id')::uuid
        where id=r.id and status='pending' returning * into r;
      reviewed=reviewed || jsonb_build_array(to_jsonb(r));
    else held=held || jsonb_build_array(jsonb_build_object('id',r.id,'reason',decision->>'reason'));
    end if;
  end loop;
  return jsonb_build_object('reviewed',reviewed,'held',held);
end;
$$;
revoke all on function public.kgpt_auto_review_parts_knowledge(uuid[]) from public,anon;
grant execute on function public.kgpt_auto_review_parts_knowledge(uuid[]) to authenticated;

-- Withdrawing or changing a manually reviewed source withdraws its inherited rules too.
create or replace function kgpt_private.parts_knowledge_withdraw_inherited()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.status='approved' and (new.status<>'approved' or
    row(new.alias,new.canonical_name,new.brand,new.models,new.years,new.kind) is distinct from row(old.alias,old.canonical_name,old.brand,old.models,old.years,old.kind)) then
    update public.parts_search_knowledge set status='disabled',review_reason='Quy tắc nguồn đã ngừng áp dụng hoặc thay đổi; cần kiểm tra lại.'
      where inherited_from=old.id and status='approved' and review_method='approved_rule';
  end if;
  return new;
end;
$$;
revoke all on function kgpt_private.parts_knowledge_withdraw_inherited() from public,anon,authenticated;
create trigger parts_knowledge_withdraw_inherited after update of status,alias,canonical_name,brand,models,years,kind on public.parts_search_knowledge
for each row execute function kgpt_private.parts_knowledge_withdraw_inherited();

create or replace function public.kgpt_observe_parts_search(p_session_id uuid,p_names text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.parts_search_sessions; names text[]; n text; count_proposals integer:=0; skipped_exact integer:=0;
begin
  if auth.uid() is null or not public.kgpt_has_permission('parts','view') then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select array_agg(distinct trim(x) order by trim(x)) into names from unnest(p_names) x where char_length(trim(x)) between 2 and 180;
  if coalesce(cardinality(names),0)=0 or cardinality(names)>40 then raise exception 'INVALID_SELECTION' using errcode='22023'; end if;
  select * into s from public.parts_search_sessions where id=p_session_id and user_id=auth.uid() for update;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
  if s.outcome in ('started','clarifying','error','abandoned') then raise exception 'SEARCH_NOT_READY' using errcode='22023'; end if;
  foreach n in array names loop
    if not exists(select 1 from jsonb_array_elements(s.candidates) c where c->>'name'=n) then raise exception 'UNKNOWN_CANDIDATE' using errcode='22023'; end if;
  end loop;
  update public.parts_search_sessions set selected_names=to_jsonb(names),outcome='selected',confirmed=false where id=s.id;
  insert into public.parts_search_events(session_id,event_type,payload) values(s.id,'results_applied',jsonb_build_object('names',to_jsonb(names),'origin','apply'));
  if coalesce(s.context->>'brand','')='' or jsonb_array_length(s.context->'models')=0 then return jsonb_build_object('recorded',true,'proposals',0); end if;
  foreach n in array names loop
    if public.kgpt_parts_exact_key(s.resolved_query)=public.kgpt_parts_exact_key(n) then
      skipped_exact=skipped_exact+1;continue;
    end if;
    if not exists(select 1 from public.parts_search_knowledge k where k.alias_key=public.kgpt_parts_name_key(s.resolved_query)
      and public.kgpt_parts_exact_key(k.alias)=public.kgpt_parts_exact_key(s.resolved_query)
      and k.canonical_name=n and k.brand=s.context->>'brand'
      and k.models @> array(select jsonb_array_elements_text(s.context->'models'))
      and k.models <@ array(select jsonb_array_elements_text(s.context->'models'))
      and k.years @> array(select jsonb_array_elements_text(s.context->'years'))::integer[]
      and k.years <@ array(select jsonb_array_elements_text(s.context->'years'))::integer[] and k.kind=s.context->>'kind') then
      insert into public.parts_search_knowledge(session_id,source_query,alias,canonical_name,brand,models,years,kind,note,evidence_type)
      values(s.id,s.original_query,s.resolved_query,n,s.context->>'brand',array(select jsonb_array_elements_text(s.context->'models')),
        array(select jsonb_array_elements_text(s.context->'years'))::integer[],s.context->>'kind',
        'Ghi nhận tự động từ thao tác mở kết quả; tên mới chỉ là đề xuất, chưa được tự duyệt.','observed')
      on conflict(session_id,canonical_name) do nothing;
      if found then count_proposals=count_proposals+1; end if;
    end if;
  end loop;
  return jsonb_build_object('recorded',true,'proposals',count_proposals,'skipped_exact',skipped_exact);
end;
$$;
commit;
