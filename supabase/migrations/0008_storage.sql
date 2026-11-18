-- ============================================================================
-- 0008 — Storage: buckets e políticas (BACKEND-1)
-- Contrato: docs/ARQUITETURA.md §11
--   logos           {organizacao_id}/logo.{png|jpg|jpeg|svg|webp}  S: membros/admin  W: owner/admin
--   avatares        {user_id}/avatar.{ext}                         S: usuário ativo  W: o próprio
--   sinapi-arquivos {ano}/{mes}/{uf}/{arquivo}                     S/W: admin
-- Todos privados (URLs assinadas).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('logos',    'logos',    false, 2 * 1024 * 1024,
     array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']),
  ('avatares', 'avatares', false, 2 * 1024 * 1024,
     array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']),
  ('sinapi-arquivos', 'sinapi-arquivos', false, 60 * 1024 * 1024, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── logos ──────────────────────────────────────────────────────────────────
create policy pretium_logos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'logos'
    and public.is_org_member(public.try_uuid((storage.foldername(name))[1]))
  );
create policy pretium_logos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and name ~* '^[0-9a-f-]{36}/logo\.(png|jpe?g|svg|webp)$'
    and public.is_org_owner(public.try_uuid((storage.foldername(name))[1]))
  );
create policy pretium_logos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'logos'
    and public.is_org_owner(public.try_uuid((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'logos'
    and name ~* '^[0-9a-f-]{36}/logo\.(png|jpe?g|svg|webp)$'
    and public.is_org_owner(public.try_uuid((storage.foldername(name))[1]))
  );
create policy pretium_logos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos'
    and public.is_org_owner(public.try_uuid((storage.foldername(name))[1]))
  );

-- ─── avatares ───────────────────────────────────────────────────────────────
create policy pretium_avatares_select on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and public.is_active_user());
create policy pretium_avatares_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and public.is_active_user()
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~* '^[0-9a-f-]{36}/avatar\.(png|jpe?g|svg|webp)$'
  );
create policy pretium_avatares_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatares'
    and public.is_active_user()
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatares'
    and public.is_active_user()
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~* '^[0-9a-f-]{36}/avatar\.(png|jpe?g|svg|webp)$'
  );
create policy pretium_avatares_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatares'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ─── sinapi-arquivos (somente admin) ────────────────────────────────────────
create policy pretium_sinapi_select on storage.objects for select to authenticated
  using (bucket_id = 'sinapi-arquivos' and public.is_admin());
create policy pretium_sinapi_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sinapi-arquivos' and public.is_admin());
create policy pretium_sinapi_update on storage.objects for update to authenticated
  using (bucket_id = 'sinapi-arquivos' and public.is_admin())
  with check (bucket_id = 'sinapi-arquivos' and public.is_admin());
create policy pretium_sinapi_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sinapi-arquivos' and public.is_admin());
