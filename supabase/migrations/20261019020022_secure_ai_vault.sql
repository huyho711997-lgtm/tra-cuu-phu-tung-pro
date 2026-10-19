-- Run as the project owner. No provider key is placed in this migration.
begin;
create extension if not exists supabase_vault with schema vault;
create schema if not exists kgpt_private;
revoke all on schema kgpt_private from public, anon, authenticated;
revoke all on schema vault from public, anon, authenticated;
revoke all on table vault.secrets, vault.decrypted_secrets from public, anon, authenticated;

create table if not exists kgpt_private.ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{"ocrProvider":"gemini","llmProvider":"gemini","ocrLanguage":"vnm","ocrEngine":"2","groqActiveKey":"1"}',
  allow_self_edit boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists kgpt_private.ai_credentials (
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (name in ('gemini','groq1','groq2','groq3','ocrspace')),
  secret_id uuid not null references vault.secrets(id),
  revision uuid not null default gen_random_uuid(),
  suffix text not null,
  primary key (user_id, name)
);
create table if not exists kgpt_private.ai_request_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  minute_start timestamptz not null,
  minute_count integer not null default 0,
  day_start timestamptz not null,
  day_count integer not null default 0,
  primary key (user_id, category)
);
alter table kgpt_private.ai_settings enable row level security;
alter table kgpt_private.ai_credentials enable row level security;
alter table kgpt_private.ai_request_limits enable row level security;
revoke all on all tables in schema kgpt_private from public, anon, authenticated;
-- The schema is not exposed by PostgREST; only the service-only RPCs below access it.

create or replace function kgpt_private.remove_vault_secret()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id = old.secret_id;
  return old;
end;
$$;
drop trigger if exists ai_credentials_remove_secret on kgpt_private.ai_credentials;
create trigger ai_credentials_remove_secret after delete on kgpt_private.ai_credentials
for each row execute function kgpt_private.remove_vault_secret();

create or replace function kgpt_private.require_actor(p_actor uuid, p_target uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_admin boolean;
begin
  select role = 'admin' into v_admin from public.user_profiles
    where id = p_actor and status = 'active';
  if not found then raise exception 'AI_ACCESS_DENIED' using errcode = '42501'; end if;
  if p_actor <> p_target and not coalesce(v_admin, false) then
    raise exception 'AI_ACCESS_DENIED' using errcode = '42501';
  end if;
  return coalesce(v_admin, false);
end;
$$;

create or replace function kgpt_private.settings_metadata(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'userId', p_user_id,
    'settings', coalesce((select preferences from kgpt_private.ai_settings where user_id = p_user_id), '{}'::jsonb),
    'allowSelfEdit', coalesce((select allow_self_edit from kgpt_private.ai_settings where user_id = p_user_id), true),
    'credentials', coalesce((select jsonb_object_agg(name, jsonb_build_object('id', revision, 'suffix', suffix))
       from kgpt_private.ai_credentials where user_id = p_user_id), '{}'::jsonb)
  );
$$;

create or replace function public.kgpt_ai_settings_read(p_actor uuid, p_target uuid default null, p_list boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_target uuid := coalesce(p_target, p_actor); v_admin boolean;
begin
  v_admin := kgpt_private.require_actor(p_actor, v_target);
  if p_list then
    if not v_admin then raise exception 'AI_ACCESS_DENIED' using errcode = '42501'; end if;
    return coalesce((select jsonb_agg(kgpt_private.settings_metadata(id)) from public.user_profiles), '[]'::jsonb);
  end if;
  return kgpt_private.settings_metadata(v_target);
end;
$$;

create or replace function public.kgpt_ai_settings_save(
  p_actor uuid, p_target uuid, p_settings jsonb default '{}'::jsonb,
  p_keys jsonb default '{}'::jsonb, p_clear text[] default '{}', p_only_missing boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin boolean; v_name text; v_value text; v_secret uuid;
  v_allowed boolean; v_preferences jsonb; v_patch jsonb := '{}'::jsonb;
begin
  v_admin := kgpt_private.require_actor(p_actor, p_target);
  if jsonb_typeof(p_settings) <> 'object' or jsonb_typeof(p_keys) <> 'object'
     or cardinality(p_clear) > 5 then raise exception 'AI_INVALID_SETTINGS'; end if;
  insert into kgpt_private.ai_settings(user_id) values(p_target) on conflict do nothing;
  select allow_self_edit, preferences into v_allowed, v_preferences
    from kgpt_private.ai_settings where user_id = p_target for update;
  if not v_admin and not v_allowed then raise exception 'AI_SETTINGS_LOCKED' using errcode = '42501'; end if;
  for v_name, v_value in select key, value from jsonb_each_text(p_settings) loop
    if (v_name = 'ocrProvider' and v_value in ('gemini','ocrspace'))
      or (v_name = 'llmProvider' and v_value in ('gemini','groq'))
      or (v_name = 'ocrLanguage' and v_value ~ '^[a-z]{3}$')
      or (v_name = 'ocrEngine' and v_value in ('1','2','3'))
      or (v_name = 'groqActiveKey' and v_value in ('1','2','3')) then
      v_patch := v_patch || jsonb_build_object(v_name, v_value);
    elsif v_name = 'allowSelfEdit' and v_admin and v_value in ('true','false') then
      v_allowed := v_value::boolean;
    else raise exception 'AI_INVALID_SETTINGS'; end if;
  end loop;
  foreach v_name in array p_clear loop
    if v_name not in ('gemini','groq1','groq2','groq3','ocrspace') then raise exception 'AI_INVALID_SETTINGS'; end if;
    delete from kgpt_private.ai_credentials where user_id = p_target and name = v_name;
  end loop;
  for v_name, v_value in select key, value from jsonb_each_text(p_keys) loop
    if v_name not in ('gemini','groq1','groq2','groq3','ocrspace') or v_value is null
       or length(btrim(v_value)) < 8 or length(v_value) > 8192 then raise exception 'AI_INVALID_KEY'; end if;
    select secret_id into v_secret from kgpt_private.ai_credentials where user_id = p_target and name = v_name;
    if found and p_only_missing then continue;
    elsif found then
      perform vault.update_secret(v_secret, btrim(v_value));
      update kgpt_private.ai_credentials set suffix = right(btrim(v_value),4), revision = gen_random_uuid()
        where user_id = p_target and name = v_name;
    else
      v_secret := vault.create_secret(btrim(v_value));
      insert into kgpt_private.ai_credentials(user_id,name,secret_id,suffix)
        values(p_target,v_name,v_secret,right(btrim(v_value),4));
    end if;
  end loop;
  update kgpt_private.ai_settings set preferences = v_preferences || v_patch,
    allow_self_edit = v_allowed, updated_at = now() where user_id = p_target;
  return kgpt_private.settings_metadata(p_target);
end;
$$;

-- This function returns plaintext to the Edge Function ONLY, never to browsers.
create or replace function public.kgpt_ai_credentials(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform kgpt_private.require_actor(p_user_id,p_user_id);
  return coalesce((select jsonb_object_agg(c.name, jsonb_build_object('id', c.revision, 'key', v.decrypted_secret))
    from kgpt_private.ai_credentials c join vault.decrypted_secrets v on v.id = c.secret_id
    where c.user_id = p_user_id), '{}'::jsonb);
end;
$$;

create or replace function public.kgpt_ai_consume_rate(p_user_id uuid, p_category text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_limit integer := case when p_category = 'settings' then 30 else 30 end; v_rows integer;
begin
  perform kgpt_private.require_actor(p_user_id,p_user_id);
  if p_category not in ('settings','ai') then raise exception 'AI_INVALID_SETTINGS'; end if;
  insert into kgpt_private.ai_request_limits(user_id,category,minute_start,day_start)
    values(p_user_id,p_category,date_trunc('minute',now()),date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')
    on conflict do nothing;
  update kgpt_private.ai_request_limits set
    minute_count = case when minute_start < date_trunc('minute',now()) then 1 else minute_count + 1 end,
    day_count = case when day_start < (date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') then 1 else day_count + 1 end,
    minute_start = date_trunc('minute',now()), day_start = date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'
    where user_id = p_user_id and category = p_category
    and (minute_start < date_trunc('minute',now()) or minute_count < v_limit)
    and (day_start < (date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') or day_count < 1000);
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on all functions in schema kgpt_private from public, anon, authenticated;
revoke all on function public.kgpt_ai_settings_read(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.kgpt_ai_settings_save(uuid,uuid,jsonb,jsonb,text[],boolean) from public,anon,authenticated;
revoke all on function public.kgpt_ai_credentials(uuid) from public,anon,authenticated;
revoke all on function public.kgpt_ai_consume_rate(uuid,text) from public,anon,authenticated;
grant execute on function public.kgpt_ai_settings_read(uuid,uuid,boolean) to service_role;
grant execute on function public.kgpt_ai_settings_save(uuid,uuid,jsonb,jsonb,text[],boolean) to service_role;
grant execute on function public.kgpt_ai_credentials(uuid) to service_role;
grant execute on function public.kgpt_ai_consume_rate(uuid,text) to service_role;

-- Copy existing Gemini/OCR keys into Vault atomically before removing plaintext.
do $$
declare r record; j jsonb; v_secret uuid; v_name text; v_value text;
begin
  if to_regclass('public.user_api_keys') is not null then
    for r in select * from public.user_api_keys loop
      j := to_jsonb(r);
      insert into kgpt_private.ai_settings(user_id,preferences,allow_self_edit)
      values((j->>'user_id')::uuid,jsonb_build_object(
        'ocrProvider',coalesce(j->>'ocr_provider','gemini'), 'llmProvider','gemini',
        'ocrLanguage',coalesce(j->>'ocr_language','vnm'), 'ocrEngine',coalesce(j->>'ocr_engine','2'), 'groqActiveKey','1'),
        coalesce((j->>'allow_self_edit')::boolean,true)) on conflict do nothing;
      for v_name,v_value in select * from (values('gemini',j->>'gemini_api_key'),('ocrspace',j->>'ocr_space_api_key')) as x(name,value) loop
        if length(btrim(coalesce(v_value,''))) > 0 and not exists(
          select 1 from kgpt_private.ai_credentials where user_id=(j->>'user_id')::uuid and name=v_name
        ) then
          v_secret := vault.create_secret(btrim(v_value));
          insert into kgpt_private.ai_credentials(user_id,name,secret_id,suffix)
            values((j->>'user_id')::uuid,v_name,v_secret,right(btrim(v_value),4));
        end if;
      end loop;
    end loop;
    update public.user_api_keys set gemini_api_key = '', ocr_space_api_key = '';
    revoke all on table public.user_api_keys from public,anon,authenticated;
    alter table public.user_api_keys enable row level security;
  end if;
end;
$$;
notify pgrst, 'reload schema';
commit;
