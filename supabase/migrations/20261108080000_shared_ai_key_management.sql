-- Quản lý từng key dùng chung: liệt kê (che key), xóa riêng từng key Gemini, và cấp key cho Edge Function kiểm tra tình trạng.
-- Phụ thuộc 20261108060000_shared_ai_keys.sql. Migration này không chứa key nào.
-- Mã nhận diện key (fp) = 8 ký tự đầu md5(key): chỉ dùng để chọn đúng key khi xóa/kiểm tra, không thể suy ngược ra key.
begin;

-- Danh sách key đã lưu. p_with_key = false: chỉ thông tin che (tên, số thứ tự, fp, 4 ký tự cuối). true: kèm key (CHỈ cho Edge Function).
create or replace function kgpt_private.shared_items(p_with_key boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('name', x.name, 'no', x.no, 'fp', left(md5(x.k), 8), 'suffix', right(x.k, 4))
      || case when p_with_key then jsonb_build_object('key', x.k) else '{}'::jsonb end
    order by x.name, x.no), '[]'::jsonb)
  from (
    select s.name, 1 as no, btrim(v.decrypted_secret) as k
      from kgpt_private.ai_shared_credentials s join vault.decrypted_secrets v on v.id = s.secret_id
      where s.name <> 'gemini' and btrim(v.decrypted_secret) <> ''
    union all
    select s.name, t.ord::integer, btrim(t.x)
      from kgpt_private.ai_shared_credentials s join vault.decrypted_secrets v on v.id = s.secret_id
      cross join lateral regexp_split_to_table(v.decrypted_secret, E'[\\r\\n,;]+') with ordinality as t(x, ord)
      where s.name = 'gemini' and btrim(t.x) <> ''
  ) x;
$$;

-- shared_metadata: giữ nguyên các trường cũ, thêm 'items' (danh sách từng key, đã che).
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
    'grantedCount', (select count(*) from kgpt_private.ai_settings a join public.user_profiles p on p.id = a.user_id
                      where a.use_shared_keys and p.status = 'active' and p.role <> 'admin'),
    'activeCount', (select count(*) from public.user_profiles where status = 'active' and role <> 'admin')
  );
$$;

-- Xóa riêng một key Gemini (theo fp). Hết key thì xóa luôn bản ghi (trigger dọn secret trong Vault).
create or replace function public.kgpt_ai_shared_remove_key(p_actor uuid, p_name text, p_fp text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_secret uuid; v_all text; v_left text; v_total integer; v_kept integer;
begin
  perform kgpt_private.require_admin(p_actor);
  if p_name is distinct from 'gemini' or p_fp is null or p_fp !~ '^[0-9a-f]{8}$' then raise exception 'AI_INVALID_SETTINGS'; end if;
  select secret_id into v_secret from kgpt_private.ai_shared_credentials where name = 'gemini' for update;
  if not found then raise exception 'AI_KEY_NOT_FOUND'; end if;
  select decrypted_secret into v_all from vault.decrypted_secrets where id = v_secret;
  select count(*), count(*) filter (where left(md5(a.k), 8) <> p_fp), string_agg(a.k, E'\n' order by a.ord) filter (where left(md5(a.k), 8) <> p_fp)
    into v_total, v_kept, v_left
    from (select btrim(t.x) as k, t.ord from regexp_split_to_table(coalesce(v_all, ''), E'[\\r\\n,;]+') with ordinality as t(x, ord)) a
    where a.k <> '';
  if v_total = v_kept then raise exception 'AI_KEY_NOT_FOUND'; end if;
  if v_kept = 0 then
    delete from kgpt_private.ai_shared_credentials where name = 'gemini';
  else
    perform vault.update_secret(v_secret, v_left);
    update kgpt_private.ai_shared_credentials
      set suffix = right(v_left, 4), revision = gen_random_uuid(), updated_by = p_actor, updated_at = now()
      where name = 'gemini';
  end if;
  return kgpt_private.shared_metadata();
end;
$$;

-- Key dạng văn bản cho Edge Function kiểm tra tình trạng (KHÔNG bao giờ trả cho trình duyệt).
create or replace function public.kgpt_ai_shared_secrets(p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform kgpt_private.require_admin(p_actor);
  return kgpt_private.shared_items(true);
end;
$$;

revoke all on all functions in schema kgpt_private from public, anon, authenticated;
revoke all on function public.kgpt_ai_shared_remove_key(uuid, text, text) from public, anon, authenticated;
revoke all on function public.kgpt_ai_shared_secrets(uuid) from public, anon, authenticated;
grant execute on function public.kgpt_ai_shared_remove_key(uuid, text, text) to service_role;
grant execute on function public.kgpt_ai_shared_secrets(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
