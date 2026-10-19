begin;
alter table public.parts_search_sessions add column previous_session_id uuid references public.parts_search_sessions(id) on delete set null;
create index parts_sessions_previous on public.parts_search_sessions(previous_session_id);
alter table public.parts_search_knowledge add column evidence_type text not null default 'confirmed' check(evidence_type in ('confirmed','observed'));

create table public.parts_search_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.parts_search_sessions(id) on delete set null,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  event_type text not null check(event_type in ('search_started','results_ready','selection_changed','results_applied','search_failed')),
  payload jsonb not null default '{}' check(jsonb_typeof(payload)='object' and pg_column_size(payload)<16000),
  created_at timestamptz not null default now()
);
create index parts_events_session_created on public.parts_search_events(session_id,created_at desc);
create index parts_events_user_created on public.parts_search_events(user_id,created_at desc);
create index parts_events_created on public.parts_search_events(created_at desc);
alter table public.parts_search_events enable row level security;
revoke all on public.parts_search_events from public,anon,authenticated;
grant select,insert on public.parts_search_events to authenticated;
grant all on public.parts_search_events to service_role;
create policy parts_events_read on public.parts_search_events for select to authenticated
using(public.kgpt_is_active_admin() or (user_id=(select auth.uid()) and public.kgpt_has_permission('parts','view')));
create policy parts_events_insert on public.parts_search_events for insert to authenticated
with check(user_id=(select auth.uid()) and public.kgpt_has_permission('parts','view') and exists(
  select 1 from public.parts_search_sessions s where s.id=session_id and s.user_id=(select auth.uid())));

create or replace function kgpt_private.parts_event_stamp()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if new.payload - array['names','count','origin'] <> '{}'::jsonb then raise exception 'INVALID_EVENT_FIELDS' using errcode='22023'; end if;
  if new.payload ? 'names' then
    if jsonb_typeof(new.payload->'names') <> 'array' or jsonb_array_length(new.payload->'names')>40 then raise exception 'INVALID_EVENT_NAMES' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(new.payload->'names') n where jsonb_typeof(n)<>'string' or char_length(n#>>'{}')>180) then raise exception 'INVALID_EVENT_NAME' using errcode='22023'; end if;
  end if;
  if new.payload ? 'origin' and new.payload->>'origin' not in ('manual','ai','batch','checkbox','apply','system') then raise exception 'INVALID_ORIGIN' using errcode='22023'; end if;
  new.user_id=auth.uid();new.created_at=now();return new;
end;
$$;
revoke all on function kgpt_private.parts_event_stamp() from public,anon,authenticated;
create trigger parts_event_stamp before insert on public.parts_search_events for each row execute function kgpt_private.parts_event_stamp();

create or replace function kgpt_private.parts_session_previous()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.previous_session_id is not null and not exists(select 1 from public.parts_search_sessions s where s.id=new.previous_session_id and s.user_id=auth.uid()) then
    raise exception 'INVALID_PREVIOUS_SESSION' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function kgpt_private.parts_session_previous() from public,anon,authenticated;
create trigger parts_session_previous before insert on public.parts_search_sessions for each row execute function kgpt_private.parts_session_previous();

drop policy parts_knowledge_propose on public.parts_search_knowledge;
create policy parts_knowledge_propose on public.parts_search_knowledge for insert to authenticated
with check(created_by=(select auth.uid()) and status='pending' and reviewed_by is null and reviewed_at is null
  and public.kgpt_has_permission('parts','view') and exists (
    select 1 from public.parts_search_sessions s where s.id=session_id and s.user_id=(select auth.uid())
      and s.selected_names ? canonical_name and s.original_query=source_query and s.resolved_query=alias
      and s.context->>'brand'=brand and s.context->'models'=to_jsonb(models)
      and s.context->'years'=to_jsonb(years) and s.context->>'kind'=kind
      and ((evidence_type='confirmed' and s.confirmed) or (evidence_type='observed' and exists(
        select 1 from public.parts_search_events e where e.session_id=s.id and e.user_id=(select auth.uid())
          and e.event_type='results_applied' and (e.payload->'names') ? canonical_name)))));

create or replace function public.kgpt_observe_parts_search(p_session_id uuid,p_names text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.parts_search_sessions; names text[]; n text; count_proposals integer:=0;
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
    if not exists(select 1 from public.parts_search_knowledge k where k.alias_key=public.kgpt_parts_name_key(s.resolved_query)
      and k.canonical_name=n and k.brand=s.context->>'brand' and to_jsonb(k.models)=s.context->'models'
      and to_jsonb(k.years)=s.context->'years' and k.kind=s.context->>'kind' and k.status in ('pending','approved')) then
      insert into public.parts_search_knowledge(session_id,source_query,alias,canonical_name,brand,models,years,kind,note,evidence_type)
      values(s.id,s.original_query,s.resolved_query,n,s.context->>'brand',array(select jsonb_array_elements_text(s.context->'models')),
        array(select jsonb_array_elements_text(s.context->'years'))::integer[],s.context->>'kind',
        'Ghi nhận tự động từ thao tác mở kết quả; chưa có xác nhận đúng loại của người dùng.','observed')
      on conflict(session_id,canonical_name) do nothing;
      count_proposals=count_proposals+1;
    end if;
  end loop;
  return jsonb_build_object('recorded',true,'proposals',count_proposals);
end;
$$;
revoke all on function public.kgpt_observe_parts_search(uuid,text[]) from public,anon;
grant execute on function public.kgpt_observe_parts_search(uuid,text[]) to authenticated;

create or replace function public.kgpt_parts_search_overview(p_from timestamptz,p_to timestamptz,p_query text default '',p_user uuid default null,p_source text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if not public.kgpt_is_active_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_to<=p_from or char_length(p_query)>120 then raise exception 'INVALID_FILTER' using errcode='22023'; end if;
  with sessions as (
    select s.* from public.parts_search_sessions s where s.created_at>=p_from and s.created_at<p_to
      and (p_user is null or s.user_id=p_user) and (p_source is null or s.source=p_source)
      and (p_query='' or position(lower(p_query) in lower(s.original_query))>0 or position(lower(p_query) in lower(s.resolved_query))>0)
  ) select jsonb_build_object('sessions',count(*),'not_found',count(*) filter(where outcome='not_found'),'errors',count(*) filter(where outcome='error'),
    'applied',(select count(distinct e.session_id) from public.parts_search_events e join sessions s on s.id=e.session_id where e.event_type='results_applied'),
    'pending',(select count(*) from public.parts_search_knowledge k join sessions s on s.id=k.session_id where k.status='pending'),
    'approved',(select count(*) from public.parts_search_knowledge k join sessions s on s.id=k.session_id where k.status='approved')) into result from sessions;
  return result;
end;
$$;
revoke all on function public.kgpt_parts_search_overview(timestamptz,timestamptz,text,uuid,text) from public,anon;
grant execute on function public.kgpt_parts_search_overview(timestamptz,timestamptz,text,uuid,text) to authenticated;
commit;
