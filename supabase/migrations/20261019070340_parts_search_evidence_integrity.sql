begin;
alter table public.parts_search_sessions add constraint parts_search_context_shape check(
  context ?& array['brand','models','years','kind']
  and jsonb_typeof(context->'brand')='string' and jsonb_typeof(context->'models')='array'
  and jsonb_typeof(context->'years')='array' and context->>'kind' in ('all','genuine','aftermarket')
  and jsonb_array_length(context->'models')<=30 and jsonb_array_length(context->'years')<=30
);
alter table public.parts_search_knowledge add constraint parts_search_alias_not_empty check(char_length(alias_key)>0);
create index parts_knowledge_source_session on public.parts_search_knowledge(session_id);
create index parts_knowledge_created_by on public.parts_search_knowledge(created_by);
create index parts_knowledge_reviewed_by on public.parts_search_knowledge(reviewed_by);
create index parts_knowledge_audit_actor on public.parts_search_knowledge_audit(actor_id);

create or replace function kgpt_private.parts_session_stamp()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='INSERT' then
    new.created_at=now();
  else
    if new.original_query is distinct from old.original_query then
      raise exception 'ORIGINAL_QUERY_IMMUTABLE' using errcode='22023';
    end if;
    if old.outcome <> 'clarifying' and (new.resolved_query is distinct from old.resolved_query
      or new.context is distinct from old.context or new.answers is distinct from old.answers or new.outcome='clarifying') then
      raise exception 'SEARCH_CONTEXT_IMMUTABLE' using errcode='22023';
    end if;
  end if;
  new.updated_at=now();return new;
end;
$$;
revoke all on function kgpt_private.parts_session_stamp() from public,anon,authenticated;
create trigger parts_session_stamp before insert or update on public.parts_search_sessions
for each row execute function kgpt_private.parts_session_stamp();
commit;
