-- Run through an administrative database connection. All fixtures and audit events roll back.
begin;
do $$
declare actor uuid; warehouse public.lich_su_bao_gia; session_id uuid; knowledge_id uuid; ids uuid[]='{}'; item integer;
  test_scope text[]; test_alias text; test_name text; result jsonb; nonce text=gen_random_uuid()::text;
begin
  select id into actor from public.user_profiles where status='active' and role='admin' limit 1;
  if actor is null then raise exception 'An active admin fixture is required';end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  select * into warehouse from public.lich_su_bao_gia where char_length(ten_phu_tung) between 2 and 100 and coalesce(hang_xe,'')<>'' and coalesce(hieu_xe,'')<>'' limit 1;
  if not found then raise exception 'A visible warehouse fixture is required';end if;
  test_scope=array[warehouse.hieu_xe,'QA-'||nonce];
  assert public.kgpt_parts_exact_key(' CẢN  TRƯỚC ')=public.kgpt_parts_exact_key(normalize('cản trước',NFD));
  assert public.kgpt_parts_exact_key('cần')<>public.kgpt_parts_exact_key('cản');
  assert public.kgpt_parts_exact_key('AB-12')<>public.kgpt_parts_exact_key('AB12');
  for item in 1..7 loop
    test_name=case when item=5 then 'QA-MISSING-'||nonce else warehouse.ten_phu_tung end;
    test_alias=case when item in (1,7) then upper(warehouse.ten_phu_tung) when item=5 then test_name else 'QA-ALIAS-'||nonce end;
    insert into public.parts_search_sessions(source,original_query,resolved_query,context,candidates,selected_names,outcome)
      values('single',test_alias,test_alias,jsonb_build_object('brand',warehouse.hang_xe,'models',to_jsonb(case when item=4 then test_scope||array['DIFFERENT'] else test_scope end),'years','[]'::jsonb,'kind','all'),jsonb_build_array(jsonb_build_object('name',test_name)),jsonb_build_array(test_name),'selected') returning id into session_id;
    insert into public.parts_search_events(session_id,event_type,payload)values(session_id,'results_applied',jsonb_build_object('names',jsonb_build_array(test_name),'origin','apply'));
    insert into public.parts_search_knowledge(session_id,source_query,alias,canonical_name,brand,models,years,kind,evidence_type)
      values(session_id,test_alias,test_alias,test_name,warehouse.hang_xe,case when item=4 then test_scope||array['DIFFERENT'] else test_scope end,'{}','all','observed') returning id into knowledge_id;
    ids[item]=knowledge_id;
  end loop;
  -- A novel alias does not become automatic even after repeated openings.
  assert public.kgpt_knowledge_review_decision(ids[2])->>'method'='manual';
  result=public.kgpt_auto_review_parts_knowledge(array[ids[1],ids[2],ids[5]]);
  assert jsonb_array_length(result->'reviewed')=1;
  assert (select status='approved' and review_method='exact_name' and reviewed_by=actor from public.parts_search_knowledge where id=ids[1]);
  assert (select count(*)>0 from public.parts_search_knowledge_audit a where a.knowledge_id=ids[1] and a.action='approved' and a.after_data->>'review_method'='exact_name');
  -- Manually established knowledge can be inherited, but not into a different vehicle scope.
  update public.parts_search_knowledge set status='approved' where id=ids[2];
  result=public.kgpt_auto_review_parts_knowledge(array[ids[3],ids[4]]);
  assert jsonb_array_length(result->'reviewed')=1;
  assert (select status='approved' and review_method='approved_rule' and inherited_from=ids[2] from public.parts_search_knowledge where id=ids[3]);
  assert (select status='pending' from public.parts_search_knowledge where id=ids[4]);
  update public.parts_search_knowledge set status='disabled' where id=ids[2];
  assert (select status='disabled' from public.parts_search_knowledge where id=ids[3]);
  assert public.kgpt_knowledge_review_decision(ids[6])->>'method'='manual';
  -- A withdrawn equivalent blocks subsequent automatic approval.
  update public.parts_search_knowledge set status='disabled' where id=ids[1];
  assert public.kgpt_knowledge_review_decision(ids[7])->>'method'='manual';
  -- Normal identical searches keep an event and no longer create a pending knowledge row.
  select id into session_id from public.parts_search_sessions where id=(select k.session_id from public.parts_search_knowledge k where k.id=ids[7]);
  result=public.kgpt_observe_parts_search(session_id,array[warehouse.ten_phu_tung]);
  assert (result->>'skipped_exact')::integer=1 and (result->>'proposals')::integer=0;
  -- Empty/bad identities cannot run the admin RPC even with authenticated database role.
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  perform set_config('request.jwt.claims','{}',true);
  begin perform public.kgpt_auto_review_parts_knowledge('{}');raise exception 'Unauthorized RPC succeeded';
    exception when insufficient_privilege then null;end;
end;
$$;
rollback;
