-- ============================================================================
-- 0005 — Funções auxiliares de permissão (BACKEND-1)
-- Contrato: docs/ARQUITETURA.md §6.2 — assinaturas ESTÁVEIS (usadas pelo B2).
--
-- Todas: stable, security definer, search_path vazio, nomes qualificados.
-- Usuário pending/blocked ⇒ todas retornam false/null.
-- Organização 'bloqueada' ⇒ membros não-admin perdem edição (leitura continua).
-- ============================================================================

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.status = 'active' and p.papel_global = 'admin'
  );
$$;

-- Papel do usuário corrente na organização (null se não membro ou não ativo).
create or replace function public.org_papel(p_organizacao_id uuid)
returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.papel
    from public.organizacao_membros m
    join public.profiles p on p.id = m.user_id
   where m.organizacao_id = p_organizacao_id
     and m.user_id = auth.uid()
     and p.status = 'active';
$$;

create or replace function public.is_org_member(p_organizacao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
      or (p_organizacao_id is not null and public.org_papel(p_organizacao_id) is not null);
$$;

create or replace function public.can_edit_org(p_organizacao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
      or (
        p_organizacao_id is not null
        and public.org_papel(p_organizacao_id) in ('owner', 'editor')
        and exists (select 1 from public.organizacoes o where o.id = p_organizacao_id and o.status = 'ativa')
      );
$$;

create or replace function public.is_org_owner(p_organizacao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
      or (
        p_organizacao_id is not null
        and public.org_papel(p_organizacao_id) = 'owner'
        and exists (select 1 from public.organizacoes o where o.id = p_organizacao_id and o.status = 'ativa')
      );
$$;

create or replace function public.assert_pode_editar(p_organizacao_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_edit_org(p_organizacao_id) then
    raise exception 'Sem permissão de edição' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador' using errcode = '42501';
  end if;
end;
$$;

-- Auxiliar (não contratual, uso nas políticas de profiles): o usuário corrente
-- (ativo) compartilha alguma organização com p_user_id?
create or replace function public.compartilha_organizacao(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user() and exists (
    select 1
      from public.organizacao_membros eu
      join public.organizacao_membros outro on outro.organizacao_id = eu.organizacao_id
     where eu.user_id = auth.uid() and outro.user_id = p_user_id
  );
$$;

-- Conversão segura texto → uuid (null se inválido). Usada nas políticas de Storage.
create or replace function public.try_uuid(p_texto text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_texto::uuid;
exception when others then
  return null;
end;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on function public.is_active_user()               from public, anon;
revoke all on function public.is_admin()                     from public, anon;
revoke all on function public.org_papel(uuid)                from public, anon;
revoke all on function public.is_org_member(uuid)            from public, anon;
revoke all on function public.can_edit_org(uuid)             from public, anon;
revoke all on function public.is_org_owner(uuid)             from public, anon;
revoke all on function public.assert_pode_editar(uuid)       from public, anon;
revoke all on function public.assert_admin()                 from public, anon;
revoke all on function public.compartilha_organizacao(uuid)  from public, anon;
revoke all on function public.try_uuid(text)                 from public, anon;

grant execute on function public.is_active_user()              to authenticated, service_role;
grant execute on function public.is_admin()                    to authenticated, service_role;
grant execute on function public.org_papel(uuid)               to authenticated, service_role;
grant execute on function public.is_org_member(uuid)           to authenticated, service_role;
grant execute on function public.can_edit_org(uuid)            to authenticated, service_role;
grant execute on function public.is_org_owner(uuid)            to authenticated, service_role;
grant execute on function public.assert_pode_editar(uuid)      to authenticated, service_role;
grant execute on function public.assert_admin()                to authenticated, service_role;
grant execute on function public.compartilha_organizacao(uuid) to authenticated, service_role;
grant execute on function public.try_uuid(text)                to authenticated, service_role;
