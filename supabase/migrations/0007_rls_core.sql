-- ============================================================================
-- 0007 — RLS e políticas das tabelas do núcleo (BACKEND-1)
-- Contrato: docs/ARQUITETURA.md §6.3
-- ============================================================================

-- Auxiliar usado pela política de convites (retorna somente o próprio e-mail).
grant execute on function public.fn_email_usuario_atual() to authenticated, service_role;

-- ─── Privilégios de tabela (defesa em profundidade além da RLS) ─────────────
revoke all on table
  public.profiles, public.configuracoes, public.organizacoes, public.organizacao_membros,
  public.convites, public.auditoria_logs, public.clientes, public.obras
from anon;

revoke truncate, references, trigger on table
  public.profiles, public.configuracoes, public.organizacoes, public.organizacao_membros,
  public.convites, public.auditoria_logs, public.clientes, public.obras
from authenticated;

grant select, insert, update, delete on table
  public.profiles, public.configuracoes, public.organizacoes, public.organizacao_membros,
  public.convites, public.clientes, public.obras
to authenticated;

-- Auditoria: somente leitura para todos (inserção só por security definer).
revoke insert, update, delete on table public.auditoria_logs from authenticated;
grant select on table public.auditoria_logs to authenticated;

-- Configurações públicas legíveis antes do login (cadastro_aberto, aviso_global…).
grant select on table public.configuracoes to anon;

alter table public.profiles            enable row level security;
alter table public.configuracoes       enable row level security;
alter table public.organizacoes        enable row level security;
alter table public.organizacao_membros enable row level security;
alter table public.convites            enable row level security;
alter table public.auditoria_logs      enable row level security;
alter table public.clientes            enable row level security;
alter table public.obras               enable row level security;

-- ─── profiles ───────────────────────────────────────────────────────────────
-- S: próprio (qualquer status), membros das mesmas organizações (se ativo), admin.
-- U: próprio se ativo (campos sensíveis travados por fn_profiles_protege_campos), admin.
-- I/D: só admin (o perfil nasce em handle_new_user).
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.compartilha_organizacao(id));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using ((id = auth.uid() and public.is_active_user()) or public.is_admin())
  with check ((id = auth.uid() and public.is_active_user()) or public.is_admin());
create policy profiles_delete on public.profiles for delete to authenticated
  using (public.is_admin());

-- ─── configuracoes ──────────────────────────────────────────────────────────
create policy configuracoes_select_anon on public.configuracoes for select to anon
  using (publica);
create policy configuracoes_select on public.configuracoes for select to authenticated
  using (publica or public.is_admin());
create policy configuracoes_insert on public.configuracoes for insert to authenticated
  with check (public.is_admin());
create policy configuracoes_update on public.configuracoes for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy configuracoes_delete on public.configuracoes for delete to authenticated
  using (public.is_admin());

-- ─── organizacoes ───────────────────────────────────────────────────────────
-- I: só admin direto (usuários via RPC criar_organizacao). U: owner (status travado
-- por trigger). D: só admin.
create policy organizacoes_select on public.organizacoes for select to authenticated
  using (public.is_org_member(id));
create policy organizacoes_insert on public.organizacoes for insert to authenticated
  with check (public.is_admin());
create policy organizacoes_update on public.organizacoes for update to authenticated
  using (public.is_org_owner(id)) with check (public.is_org_owner(id));
create policy organizacoes_delete on public.organizacoes for delete to authenticated
  using (public.is_admin());

-- ─── organizacao_membros ────────────────────────────────────────────────────
-- Escrita somente por admin; owners usam as RPCs (que garantem ≥ 1 owner).
create policy organizacao_membros_select on public.organizacao_membros for select to authenticated
  using (public.is_org_member(organizacao_id));
create policy organizacao_membros_insert on public.organizacao_membros for insert to authenticated
  with check (public.is_admin());
create policy organizacao_membros_update on public.organizacao_membros for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy organizacao_membros_delete on public.organizacao_membros for delete to authenticated
  using (public.is_admin());

-- ─── convites ───────────────────────────────────────────────────────────────
-- S: admin, owner/editor da org, ou o próprio convidado (usuário ativo, mesmo e-mail).
create policy convites_select on public.convites for select to authenticated
  using (
    public.is_admin()
    or public.org_papel(organizacao_id) in ('owner', 'editor')
    or (public.is_active_user() and lower(email::text) = lower(public.fn_email_usuario_atual()::text))
  );
create policy convites_insert on public.convites for insert to authenticated
  with check (public.is_admin());
create policy convites_update on public.convites for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy convites_delete on public.convites for delete to authenticated
  using (public.is_admin());

-- ─── auditoria_logs ─────────────────────────────────────────────────────────
-- S: admin (tudo) e owner (da sua organização). Sem I/U/D para ninguém.
create policy auditoria_logs_select on public.auditoria_logs for select to authenticated
  using (
    public.is_admin()
    or (organizacao_id is not null and public.org_papel(organizacao_id) = 'owner')
  );

-- ─── clientes / obras (padrão de organização §6.3) ──────────────────────────
create policy clientes_select on public.clientes for select to authenticated
  using (public.is_org_member(organizacao_id));
create policy clientes_insert on public.clientes for insert to authenticated
  with check (public.can_edit_org(organizacao_id));
create policy clientes_update on public.clientes for update to authenticated
  using (public.can_edit_org(organizacao_id)) with check (public.can_edit_org(organizacao_id));
create policy clientes_delete on public.clientes for delete to authenticated
  using (public.can_edit_org(organizacao_id));

create policy obras_select on public.obras for select to authenticated
  using (public.is_org_member(organizacao_id));
create policy obras_insert on public.obras for insert to authenticated
  with check (public.can_edit_org(organizacao_id));
create policy obras_update on public.obras for update to authenticated
  using (public.can_edit_org(organizacao_id)) with check (public.can_edit_org(organizacao_id));
create policy obras_delete on public.obras for delete to authenticated
  using (public.can_edit_org(organizacao_id));
