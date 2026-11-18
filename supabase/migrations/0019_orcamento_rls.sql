-- =============================================================================
-- 0019 — BACKEND-2: RLS de todas as tabelas do orçamento (§6.3, padrão de organização)
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'orcamentos', 'orcamento_bdis', 'orcamento_etapas', 'orcamento_itens', 'orcamento_insumo_precos',
    'orcamento_item_memorias', 'cronogramas', 'cronograma_distribuicoes', 'medicoes', 'medicao_itens',
    'orcamento_equipes', 'orcamento_equipe_membros', 'honorarios', 'honorario_disciplinas'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (is_org_member(organizacao_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (can_edit_org(organizacao_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (can_edit_org(organizacao_id)) with check (can_edit_org(organizacao_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (can_edit_org(organizacao_id))', t || '_delete', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;

  -- referências mistas: tabelas globais (organizacao_id null) leitura p/ ativos, escrita admin
  foreach t in array array['encargos_sociais', 'encargos_sociais_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I for select to authenticated
      using ((organizacao_id is null and (select is_active_user())) or is_org_member(organizacao_id))$p$, t || '_select', t);
    execute format($p$create policy %I on public.%I for insert to authenticated
      with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)))$p$, t || '_insert', t);
    execute format($p$create policy %I on public.%I for update to authenticated
      using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)))
      with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)))$p$, t || '_update', t);
    execute format($p$create policy %I on public.%I for delete to authenticated
      using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)))$p$, t || '_delete', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Colunas calculadas/snapshot não devem ser forjadas pelo cliente: os triggers as recalculam
-- (orcamento_itens.preco_unitario/total_sem_bdi/total, medicao_itens.valor, honorario_disciplinas.valor,
-- encargos_sociais.total_*), então não há revogação por coluna — o supabase-js pode enviar a linha inteira.
