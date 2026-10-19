begin;
create or replace function public.kgpt_parts_name_key(p_value text)
returns text language sql immutable strict security invoker set search_path = '' as $$
  select trim(regexp_replace(regexp_replace(translate(lower(normalize(p_value, NFD)), 'đ', 'd'), U&'[\0300-\036f]', '', 'g'), '[^a-z0-9]+', ' ', 'g'));
$$;
revoke all on function public.kgpt_parts_name_key(text) from public, anon;
grant execute on function public.kgpt_parts_name_key(text) to authenticated, service_role;

create table public.parts_search_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source text not null check(source in ('single','batch')),
  original_query text not null check(char_length(original_query) between 2 and 180),
  resolved_query text not null check(char_length(resolved_query) between 2 and 180),
  context jsonb not null check(jsonb_typeof(context)='object' and pg_column_size(context)<12000),
  answers jsonb not null default '{}' check(jsonb_typeof(answers)='object' and pg_column_size(answers)<6000),
  candidates jsonb not null default '[]' check(jsonb_typeof(candidates)='array' and jsonb_array_length(candidates)<=40 and pg_column_size(candidates)<24000),
  selected_names jsonb not null default '[]' check(jsonb_typeof(selected_names)='array' and jsonb_array_length(selected_names)<=40 and pg_column_size(selected_names)<12000),
  outcome text not null default 'started' check(outcome in ('started','clarifying','ready','selected','not_found','error','abandoned')),
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(not confirmed or (outcome='selected' and jsonb_array_length(selected_names)>0))
);
create index parts_search_sessions_user_created on public.parts_search_sessions(user_id,created_at desc);
create index parts_search_sessions_created on public.parts_search_sessions(created_at desc);
alter table public.parts_search_sessions enable row level security;
revoke all on public.parts_search_sessions from public,anon,authenticated;
grant select,insert on public.parts_search_sessions to authenticated;
grant update(original_query,resolved_query,context,answers,candidates,selected_names,outcome,confirmed,updated_at) on public.parts_search_sessions to authenticated;
create policy parts_sessions_read on public.parts_search_sessions for select to authenticated
using ((user_id=(select auth.uid()) and public.kgpt_has_permission('parts','view')) or public.kgpt_is_active_admin());
create policy parts_sessions_insert on public.parts_search_sessions for insert to authenticated
with check(user_id=(select auth.uid()) and public.kgpt_has_permission('parts','view'));
create policy parts_sessions_update on public.parts_search_sessions for update to authenticated
using(user_id=(select auth.uid()) and public.kgpt_has_permission('parts','view'))
with check(user_id=(select auth.uid()) and public.kgpt_has_permission('parts','view'));

create table public.parts_search_knowledge (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.parts_search_sessions(id) on delete set null,
  source_query text not null check(char_length(source_query) between 2 and 180),
  alias text not null check(char_length(alias) between 2 and 180),
  alias_key text generated always as (public.kgpt_parts_name_key(alias)) stored,
  canonical_name text not null check(char_length(canonical_name) between 2 and 180),
  brand text not null check(char_length(brand) between 1 and 100),
  models text[] not null check(cardinality(models) between 1 and 30),
  years integer[] not null default '{}' check(cardinality(years)<=30),
  kind text not null default 'all' check(kind in ('all','genuine','aftermarket')),
  note text not null default '' check(char_length(note)<=1000),
  status text not null default 'pending' check(status in ('pending','approved','rejected','disabled')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(session_id,canonical_name)
);
create index parts_search_knowledge_lookup on public.parts_search_knowledge(alias_key,brand) where status='approved';
create index parts_search_knowledge_status on public.parts_search_knowledge(status,created_at desc);
alter table public.parts_search_knowledge enable row level security;
revoke all on public.parts_search_knowledge from public,anon,authenticated;
grant select,insert on public.parts_search_knowledge to authenticated;
grant update(alias,canonical_name,brand,models,years,kind,note,status) on public.parts_search_knowledge to authenticated;
create policy parts_knowledge_read on public.parts_search_knowledge for select to authenticated
using(public.kgpt_is_active_admin() or (public.kgpt_has_permission('parts','view') and (status='approved' or created_by=(select auth.uid()))));
create policy parts_knowledge_propose on public.parts_search_knowledge for insert to authenticated
with check(created_by=(select auth.uid()) and status='pending' and reviewed_by is null and reviewed_at is null
  and public.kgpt_has_permission('parts','view') and exists (
    select 1 from public.parts_search_sessions s where s.id=session_id and s.user_id=(select auth.uid())
      and s.confirmed and s.selected_names ? canonical_name and s.original_query=source_query and s.resolved_query=alias
      and s.context->>'brand'=brand and s.context->'models'=to_jsonb(models)
      and s.context->'years'=to_jsonb(years) and s.context->>'kind'=kind));
create policy parts_knowledge_review on public.parts_search_knowledge for update to authenticated
using(public.kgpt_is_active_admin()) with check(public.kgpt_is_active_admin());

create table public.parts_search_knowledge_audit (
  id uuid primary key default gen_random_uuid(),
  knowledge_id uuid not null references public.parts_search_knowledge(id),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);
create index parts_search_audit_knowledge on public.parts_search_knowledge_audit(knowledge_id,created_at desc);
alter table public.parts_search_knowledge_audit enable row level security;
revoke all on public.parts_search_knowledge_audit from public,anon,authenticated;
grant select on public.parts_search_knowledge_audit to authenticated;
create policy parts_audit_admin on public.parts_search_knowledge_audit for select to authenticated using(public.kgpt_is_active_admin());

create or replace function kgpt_private.parts_knowledge_stamp()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' then
    if not public.kgpt_is_active_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
    new.reviewed_by=auth.uid(); new.reviewed_at=now();
  else
    new.created_by=auth.uid(); new.reviewed_by=null; new.reviewed_at=null; new.status='pending';
  end if;
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function kgpt_private.parts_knowledge_stamp() from public,anon,authenticated;
create trigger parts_knowledge_stamp before insert or update of alias,canonical_name,brand,models,years,kind,note,status on public.parts_search_knowledge
for each row execute function kgpt_private.parts_knowledge_stamp();

create or replace function kgpt_private.parts_knowledge_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  insert into public.parts_search_knowledge_audit(knowledge_id,actor_id,action,before_data,after_data)
  values(new.id,auth.uid(),case when tg_op='INSERT' then 'proposed' else new.status end,
    case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end;
$$;
revoke all on function kgpt_private.parts_knowledge_audit() from public,anon,authenticated;
create trigger parts_knowledge_audit after insert or update of alias,canonical_name,brand,models,years,kind,note,status on public.parts_search_knowledge
for each row execute function kgpt_private.parts_knowledge_audit();

create or replace function public.kgpt_confirm_parts_search(p_session_id uuid,p_names text[],p_note text default '')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.parts_search_sessions; v_names text[]; n text; v_count integer:=0;
begin
  if auth.uid() is null or not public.kgpt_has_permission('parts','view') then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select array_agg(distinct trim(x) order by trim(x)) into v_names from unnest(p_names) x where char_length(trim(x)) between 2 and 180;
  if coalesce(cardinality(v_names),0)=0 or cardinality(v_names)>40 or char_length(p_note)>1000 then raise exception 'INVALID_SELECTION' using errcode='22023'; end if;
  select * into s from public.parts_search_sessions where id=p_session_id and user_id=auth.uid() for update;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
  if s.outcome in ('started','clarifying','error','abandoned') then raise exception 'SEARCH_NOT_READY' using errcode='22023'; end if;
  foreach n in array v_names loop
    if not exists(select 1 from jsonb_array_elements(s.candidates) c where c->>'name'=n) then raise exception 'UNKNOWN_CANDIDATE' using errcode='22023'; end if;
  end loop;
  update public.parts_search_sessions set selected_names=to_jsonb(v_names),confirmed=true,outcome='selected',updated_at=now() where id=s.id;
  foreach n in array v_names loop
    if not exists(select 1 from public.parts_search_knowledge k where k.alias_key=public.kgpt_parts_name_key(s.resolved_query)
      and k.canonical_name=n and k.brand=s.context->>'brand' and to_jsonb(k.models)=s.context->'models'
      and to_jsonb(k.years)=s.context->'years' and k.kind=s.context->>'kind' and k.status in ('pending','approved')) then
      insert into public.parts_search_knowledge(session_id,source_query,alias,canonical_name,brand,models,years,kind,note)
      values(s.id,s.original_query,s.resolved_query,n,s.context->>'brand',
        array(select jsonb_array_elements_text(s.context->'models')),array(select jsonb_array_elements_text(s.context->'years'))::integer[],s.context->>'kind',coalesce(p_note,''))
      on conflict(session_id,canonical_name) do nothing;
      v_count=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('confirmed',true,'proposals',v_count);
end;
$$;
revoke all on function public.kgpt_confirm_parts_search(uuid,text[],text) from public,anon;
grant execute on function public.kgpt_confirm_parts_search(uuid,text[],text) to authenticated;
grant select,insert,update,delete on public.parts_search_sessions,public.parts_search_knowledge,public.parts_search_knowledge_audit to service_role;
commit;
