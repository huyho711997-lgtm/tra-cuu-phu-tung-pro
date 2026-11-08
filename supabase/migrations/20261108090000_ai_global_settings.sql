-- Cài đặt AI dùng chung do quản trị viên quyết định (hiện có: cách đọc giấy đăng kiểm).
--   regReader = 'gemini' (mặc định): Gemini đọc ảnh/PDF trực tiếp.
--   regReader = 'fast': OCR.Space lấy chữ + Groq bóc tách, tự chuyển Gemini nếu đọc chưa đủ.
-- Mọi tài khoản đang hoạt động đọc được giá trị này qua metadata cài đặt; chỉ quản trị viên được đổi.
-- Phụ thuộc 20261108060000_shared_ai_keys.sql và 20261108080000_shared_ai_key_management.sql. Không chứa key nào.
begin;

create table if not exists kgpt_private.ai_global_settings (
  name text primary key check (name in ('regReader')),
  value text not null check (value in ('gemini','fast')),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table kgpt_private.ai_global_settings enable row level security;
revoke all on table kgpt_private.ai_global_settings from public, anon, authenticated;

create or replace function kgpt_private.global_settings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('regReader',
    coalesce((select value from kgpt_private.ai_global_settings where name = 'regReader'), 'gemini'));
$$;

-- settings_metadata: giữ nguyên, thêm 'global' để mọi tài khoản biết cách đọc giấy đang được chọn.
create or replace function kgpt_private.settings_metadata(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'userId', p_user_id,
    'settings', coalesce((select preferences from kgpt_private.ai_settings where user_id = p_user_id), '{}'::jsonb),
    'allowSelfEdit', coalesce((select allow_self_edit from kgpt_private.ai_settings where user_id = p_user_id), true),
    'useSharedKeys', coalesce((select use_shared_keys from kgpt_private.ai_settings where user_id = p_user_id), false),
    'sharedAllowed', kgpt_private.shared_allowed(p_user_id),
    'global', kgpt_private.global_settings(),
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

-- shared_metadata: giữ nguyên các trường cũ, thêm 'global'.
create or replace function kgpt_private.shared_metadata()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'credentials', coalesce((select jsonb_object_agg(s.name, jsonb_build_object(
        'id', s.revision, 'suffix', s.suffix, 'updatedAt', s.updated_at,
        'count', case when s.name = 'gemini'
          then (select count(distinct btrim(k)) from regexp_split_to_table(v.decrypted_secret, E'[\\r\\n,;]+') as k where btrim(k) <> '')
          else 1 end))
      from kgpt_private.ai_shared_credentials s join vault.decrypted_secrets v on v.id = s.secret_id), '{}'::jsonb),
    'items', kgpt_private.shared_items(false),
    'global', kgpt_private.global_settings(),
    'grantedCount', (select count(*) from kgpt_private.ai_settings a join public.user_profiles p on p.id = a.user_id
                      where a.use_shared_keys and p.status = 'active' and p.role <> 'admin'),
    'activeCount', (select count(*) from public.user_profiles where status = 'active' and role <> 'admin')
  );
$$;

-- Đổi một cài đặt dùng chung (chỉ quản trị viên). Trả về metadata mới để giao diện cập nhật ngay.
create or replace function public.kgpt_ai_global_set(p_actor uuid, p_name text, p_value text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform kgpt_private.require_admin(p_actor);
  if p_name is distinct from 'regReader' or p_value is null or p_value not in ('gemini','fast') then raise exception 'AI_INVALID_SETTINGS'; end if;
  insert into kgpt_private.ai_global_settings(name, value, updated_by, updated_at) values (p_name, p_value, p_actor, now())
    on conflict (name) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  return kgpt_private.shared_metadata();
end;
$$;

revoke all on all functions in schema kgpt_private from public, anon, authenticated;
revoke all on function public.kgpt_ai_global_set(uuid, text, text) from public, anon, authenticated;
grant execute on function public.kgpt_ai_global_set(uuid, text, text) to service_role;
notify pgrst, 'reload schema';
commit;
