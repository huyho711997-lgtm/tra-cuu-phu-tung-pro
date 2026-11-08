-- Key AI dùng chung: admin lưu một bộ key (Vault) và quyết định tài khoản nào được dùng.
-- Chạy bằng quyền chủ dự án. Migration này không chứa key nào.
-- Quy tắc chọn key khi gọi AI (kgpt_ai_credentials):
--   * Admin luôn được dùng key dùng chung; người khác chỉ khi use_shared_keys = true (do admin cấp).
--   * Tài khoản được phép: key dùng chung ưu tiên hơn key riêng cùng tên; tên nào key chung không có thì dùng key riêng (nếu còn).
--   * Tài khoản không được phép: chỉ dùng key riêng cũ (hành vi trước đây), mặc định mọi người đều CHƯA được cấp.
begin;

alter table kgpt_private.ai_settings add column if not exists use_shared_keys boolean not null default false;

create table if not exists kgpt_private.ai_shared_credentials (
  name text primary key check (name in ('gemini','groq1','groq2','groq3','ocrspace')),
  secret_id uuid not null references vault.secrets(id),
  revision uuid not null default gen_random_uuid(),
  suffix text not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table kgpt_private.ai_shared_credentials enable row level security;
revoke all on table kgpt_private.ai_shared_credentials from public, anon, authenticated;

drop trigger if exists ai_shared_credentials_remove_secret on kgpt_private.ai_shared_credentials;
create trigger ai_shared_credentials_remove_secret after delete on kgpt_private.ai_shared_credentials
for each row execute function kgpt_private.remove_vault_secret();

create or replace function kgpt_private.require_admin(p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.user_profiles where id = p_actor and status = 'active' and role = 'admin') then
    raise exception 'AI_ACCESS_DENIED' using errcode = '42501';
  end if;
end;
$$;

-- Tài khoản này có được dùng key dùng chung không (admin luôn được).
create or replace function kgpt_private.shared_allowed(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select use_shared_keys from kgpt_private.ai_settings where user_id = p_user_id), false)
    or exists (select 1 from public.user_profiles where id = p_user_id and role = 'admin' and status = 'active');
$$;

-- Metadata gửi về trình duyệt: không có key. Key dùng chung chỉ hiện id (phiên bản) và không có 4 ký tự cuối.
create or replace function kgpt_private.settings_metadata(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'userId', p_user_id,
    'settings', coalesce((select preferences from kgpt_private.ai_settings where user_id = p_user_id), '{}'::jsonb),
    'allowSelfEdit', coalesce((select allow_self_edit from kgpt_private.ai_settings where user_id = p_user_id), true),
    'useSharedKeys', coalesce((select use_shared_keys from kgpt_private.ai_settings where user_id = p_user_id), false),
    'sharedAllowed', kgpt_private.shared_allowed(p_user_id),
    'credentials', coalesce((select jsonb_object_agg(d.name, d.entry) from (
        select distinct on (u.name) u.name, u.entry from (
          select s.name, jsonb_build_object('id', s.revision, 'suffix', '', 'shared', true) as entry, 0 as prio
            from kgpt_private.ai_shared_credentials s where kgpt_private.shared_allowed(p_user_id)
          union all
          select c.name, jsonb_build_object('id', c.revision, 'suffix', c.suffix), 1
            from kgpt_private.ai_credentials c where c.user_id = p_user_id
        ) u order by u.name, u.prio
      ) d), '{}'::jsonb)
  );
$$;

-- Trả key dạng văn bản cho Edge Function (KHÔNG bao giờ cho trình duyệt).
create or replace function public.kgpt_ai_credentials(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform kgpt_private.require_actor(p_user_id, p_user_id);
  return coalesce((select jsonb_object_agg(d.name, jsonb_build_object('id', d.id, 'key', d.key)) from (
      select distinct on (u.name) u.name, u.id, u.key from (
        select s.name, s.revision as id, v.decrypted_secret as key, 0 as prio
          from kgpt_private.ai_shared_credentials s join vault.decrypted_secrets v on v.id = s.secret_id
          where kgpt_private.shared_allowed(p_user_id)
        union all
        select c.name, c.revision, v.decrypted_secret, 1
          from kgpt_private.ai_credentials c join vault.decrypted_secrets v on v.id = c.secret_id
          where c.user_id = p_user_id
      ) u order by u.name, u.prio
    ) d), '{}'::jsonb);
end;
$$;

create or replace function kgpt_private.shared_metadata()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'credentials', coalesce((select jsonb_object_agg(s.name, jsonb_build_object(
        'id', s.revision, 'suffix', s.suffix, 'updatedAt', s.updated_at,
        'count', case when s.name = 'gemini'
          then (select count(distinct btrim(k)) from regexp_split_to_table(v.decrypted_secret, E'[\\r\\n,;]+') as k where btrim(k) <> '')
          else 1 end))
      from kgpt_private.ai_shared_credentials s join vault.decrypted_secrets v on v.id = s.secret_id), '{}'::jsonb),
    'grantedCount', (select count(*) from kgpt_private.ai_settings a join public.user_profiles p on p.id = a.user_id
                      where a.use_shared_keys and p.status = 'active' and p.role <> 'admin'),
    'activeCount', (select count(*) from public.user_profiles where status = 'active' and role <> 'admin')
  );
$$;

create or replace function public.kgpt_ai_shared_read(p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform kgpt_private.require_admin(p_actor);
  return kgpt_private.shared_metadata();
end;
$$;

-- Lưu / thêm / xóa key dùng chung. p_append = {'gemini'}: gộp key Gemini mới vào key đã lưu (bỏ trùng, tối đa 10) ngay trong CSDL.
create or replace function public.kgpt_ai_shared_save(
  p_actor uuid, p_keys jsonb default '{}'::jsonb, p_clear text[] default '{}', p_append text[] default '{}'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_name text; v_value text; v_secret uuid; v_exists boolean; v_merged text; v_count integer;
begin
  perform kgpt_private.require_admin(p_actor);
  if jsonb_typeof(p_keys) <> 'object' or cardinality(p_clear) > 5 or cardinality(p_append) > 1 then
    raise exception 'AI_INVALID_SETTINGS';
  end if;
  foreach v_name in array p_clear loop
    if v_name not in ('gemini','groq1','groq2','groq3','ocrspace') then raise exception 'AI_INVALID_SETTINGS'; end if;
    delete from kgpt_private.ai_shared_credentials where name = v_name;
  end loop;
  for v_name, v_value in select key, value from jsonb_each_text(p_keys) loop
    if v_name not in ('gemini','groq1','groq2','groq3','ocrspace') or v_value is null
       or length(btrim(v_value)) < 8 or length(v_value) > 8192 then raise exception 'AI_INVALID_KEY'; end if;
    v_value := btrim(v_value);
    select secret_id into v_secret from kgpt_private.ai_shared_credentials where name = v_name;
    v_exists := found;
    if v_name = 'gemini' then
      if v_exists and 'gemini' = any(p_append) then
        v_value := coalesce((select decrypted_secret from vault.decrypted_secrets where id = v_secret), '') || E'\n' || v_value;
      end if;
      select string_agg(b.k, E'\n' order by b.first_ord), count(*) into v_merged, v_count from (
        select a.k, min(a.ord) as first_ord from (
          select btrim(t.x) as k, t.ord from regexp_split_to_table(v_value, E'[\\r\\n,;]+') with ordinality as t(x, ord)
        ) a where a.k <> '' group by a.k
      ) b;
      if v_count > 10 then raise exception 'AI_TOO_MANY_KEYS'; end if;
      if exists (select 1 from regexp_split_to_table(v_merged, E'\n') as k where length(k) < 8) then raise exception 'AI_INVALID_KEY'; end if;
      v_value := v_merged;
    end if;
    if v_exists then
      perform vault.update_secret(v_secret, v_value);
      update kgpt_private.ai_shared_credentials
        set suffix = right(v_value, 4), revision = gen_random_uuid(), updated_by = p_actor, updated_at = now()
        where name = v_name;
    else
      v_secret := vault.create_secret(v_value);
      insert into kgpt_private.ai_shared_credentials(name, secret_id, suffix, updated_by)
        values (v_name, v_secret, right(v_value, 4), p_actor);
    end if;
  end loop;
  return kgpt_private.shared_metadata();
end;
$$;

-- Cấp / thu hồi quyền dùng key dùng chung cho một hoặc nhiều tài khoản (chỉ admin).
create or replace function public.kgpt_ai_shared_grant(p_actor uuid, p_targets uuid[], p_allow boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rows integer;
begin
  perform kgpt_private.require_admin(p_actor);
  if p_targets is null or cardinality(p_targets) = 0 or cardinality(p_targets) > 1000 or p_allow is null then
    raise exception 'AI_INVALID_SETTINGS';
  end if;
  insert into kgpt_private.ai_settings(user_id, use_shared_keys)
    select p.id, p_allow from public.user_profiles p where p.id = any(p_targets)
    on conflict (user_id) do update set use_shared_keys = excluded.use_shared_keys, updated_at = now();
  get diagnostics v_rows = row_count;
  return jsonb_build_object('updated', v_rows, 'allow', p_allow) || kgpt_private.shared_metadata();
end;
$$;

revoke all on all functions in schema kgpt_private from public, anon, authenticated;
revoke all on function public.kgpt_ai_credentials(uuid) from public, anon, authenticated;
revoke all on function public.kgpt_ai_shared_read(uuid) from public, anon, authenticated;
revoke all on function public.kgpt_ai_shared_save(uuid, jsonb, text[], text[]) from public, anon, authenticated;
revoke all on function public.kgpt_ai_shared_grant(uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.kgpt_ai_credentials(uuid) to service_role;
grant execute on function public.kgpt_ai_shared_read(uuid) to service_role;
grant execute on function public.kgpt_ai_shared_save(uuid, jsonb, text[], text[]) to service_role;
grant execute on function public.kgpt_ai_shared_grant(uuid, uuid[], boolean) to service_role;
notify pgrst, 'reload schema';
commit;
