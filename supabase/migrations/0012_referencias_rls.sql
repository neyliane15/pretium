-- =============================================================================
-- 0012 — BACKEND-2: RLS das referências (§6.3 — padrão "referências mistas")
-- SINAPI (organizacao_id null): leitura p/ usuário ativo, escrita só admin.
-- Próprias: leitura membros, escrita editor/owner (can_edit_org).
-- =============================================================================

-- ─── datas_base ──────────────────────────────────────────────────────────────
-- Usuário comum vê as publicadas e também as que algum orçamento da sua organização usa
-- (ex.: data-base arquivada depois de o orçamento ter sido criado). Ver CONTRATO_ALTERACOES.
create or replace function fn_data_base_em_uso_pela_org(p_data_base_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return exists (select 1 from orcamentos o
                  where o.data_base_id = p_data_base_id and is_org_member(o.organizacao_id));
end $$;
revoke execute on function fn_data_base_em_uso_pela_org(uuid) from public, anon;
grant execute on function fn_data_base_em_uso_pela_org(uuid) to authenticated;

alter table datas_base enable row level security;
create policy datas_base_select on datas_base for select to authenticated
  using (
    (select is_admin())
    or ((select is_active_user()) and status = 'publicada')
    or fn_data_base_em_uso_pela_org(id)
  );
create policy datas_base_insert on datas_base for insert to authenticated with check ((select is_admin()));
create policy datas_base_update on datas_base for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));
create policy datas_base_delete on datas_base for delete to authenticated using ((select is_admin()));

-- ─── insumos / composicoes / composicao_itens ───────────────────────────────
alter table insumos enable row level security;
create policy insumos_select on insumos for select to authenticated
  using ((organizacao_id is null and (select is_active_user())) or is_org_member(organizacao_id));
create policy insumos_insert on insumos for insert to authenticated
  with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));
create policy insumos_update on insumos for update to authenticated
  using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)))
  with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));
create policy insumos_delete on insumos for delete to authenticated
  using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));

alter table composicoes enable row level security;
create policy composicoes_select on composicoes for select to authenticated
  using ((organizacao_id is null and (select is_active_user())) or is_org_member(organizacao_id));
create policy composicoes_insert on composicoes for insert to authenticated
  with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));
create policy composicoes_update on composicoes for update to authenticated
  using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)))
  with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));
create policy composicoes_delete on composicoes for delete to authenticated
  using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));

alter table composicao_itens enable row level security;
create policy composicao_itens_select on composicao_itens for select to authenticated
  using ((organizacao_id is null and (select is_active_user())) or is_org_member(organizacao_id));
create policy composicao_itens_insert on composicao_itens for insert to authenticated
  with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));
create policy composicao_itens_update on composicao_itens for update to authenticated
  using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)))
  with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));
create policy composicao_itens_delete on composicao_itens for delete to authenticated
  using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));

-- ─── preços de referência: leitura p/ ativos, escrita admin ─────────────────
alter table insumo_precos enable row level security;
create policy insumo_precos_select on insumo_precos for select to authenticated using ((select is_active_user()));
create policy insumo_precos_insert on insumo_precos for insert to authenticated with check ((select is_admin()));
create policy insumo_precos_update on insumo_precos for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));
create policy insumo_precos_delete on insumo_precos for delete to authenticated using ((select is_admin()));

alter table composicao_precos enable row level security;
create policy composicao_precos_select on composicao_precos for select to authenticated using ((select is_active_user()));
create policy composicao_precos_insert on composicao_precos for insert to authenticated with check ((select is_admin()));
create policy composicao_precos_update on composicao_precos for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));
create policy composicao_precos_delete on composicao_precos for delete to authenticated using ((select is_admin()));

-- ─── sinapi_importacoes: só admin ────────────────────────────────────────────
alter table sinapi_importacoes enable row level security;
create policy sinapi_importacoes_admin on sinapi_importacoes for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));

-- anon não acessa nada destas tabelas
revoke all on datas_base, insumos, composicoes, composicao_itens, insumo_precos, composicao_precos,
  sinapi_importacoes from anon;
