-- =============================================================================
-- 0015 — BACKEND-2: triggers do orçamento
-- herança de organização, updated_at, bloqueio por status, validações da EAP,
-- fn_orcamento_itens_calc (§8.3), memória → quantidade, auditoria
-- =============================================================================

-- ─── Herança de organização ──────────────────────────────────────────────────
create trigger trg_10_orcamentos_herda_org before insert or update of obra_id, organizacao_id on orcamentos
  for each row execute function fn_herda_organizacao('obras', 'obra_id');
create trigger trg_10_orcamento_bdis_herda_org before insert or update of orcamento_id, organizacao_id on orcamento_bdis
  for each row execute function fn_herda_organizacao('orcamentos', 'orcamento_id');
create trigger trg_10_orcamento_etapas_herda_org before insert or update of orcamento_id, organizacao_id on orcamento_etapas
  for each row execute function fn_herda_organizacao('orcamentos', 'orcamento_id');
create trigger trg_10_orcamento_itens_herda_org before insert or update of orcamento_id, organizacao_id on orcamento_itens
  for each row execute function fn_herda_organizacao('orcamentos', 'orcamento_id');
create trigger trg_10_orcamento_insumo_precos_herda_org before insert or update of orcamento_id, organizacao_id on orcamento_insumo_precos
  for each row execute function fn_herda_organizacao('orcamentos', 'orcamento_id');
create trigger trg_10_orcamento_item_memorias_herda_org before insert or update of item_id, organizacao_id on orcamento_item_memorias
  for each row execute function fn_herda_organizacao('orcamento_itens', 'item_id');

-- ─── updated_at ──────────────────────────────────────────────────────────────
create trigger trg_orcamentos_updated_at before update on orcamentos for each row execute function set_updated_at();
create trigger trg_orcamento_bdis_updated_at before update on orcamento_bdis for each row execute function set_updated_at();
create trigger trg_orcamento_etapas_updated_at before update on orcamento_etapas for each row execute function set_updated_at();
create trigger trg_orcamento_itens_updated_at before update on orcamento_itens for each row execute function set_updated_at();
create trigger trg_orcamento_insumo_precos_updated_at before update on orcamento_insumo_precos for each row execute function set_updated_at();
create trigger trg_orcamento_item_memorias_updated_at before update on orcamento_item_memorias for each row execute function set_updated_at();

-- ─── Bloqueio por status (aprovado/arquivado ⇒ somente leitura, exceto admin) ─
-- TG_ARGV[0]: 'orcamento_id' (coluna direta) ou 'item_id' (memórias).
-- Contexto sem usuário (auth.uid() nulo: migrações, seed, service_role) não é bloqueado.
create or replace function fn_orcamento_bloqueio_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row    jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_orc    uuid;
  v_status orcamento_status;
begin
  if auth.uid() is null or is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_argv[0] = 'item_id' then
    select i.orcamento_id into v_orc from orcamento_itens i where i.id = (v_row ->> 'item_id')::uuid;
  else
    v_orc := (v_row ->> 'orcamento_id')::uuid;
  end if;
  select o.status into v_status from orcamentos o where o.id = v_orc;
  -- orçamento inexistente (exclusão em cascata do próprio orçamento) ⇒ não bloqueia
  if v_status in ('aprovado', 'arquivado') then
    raise exception 'Orçamento % está somente leitura. Volte o status para rascunho ou em revisão para editar.',
      case v_status when 'aprovado' then 'aprovado' else 'arquivado' end using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger trg_05_orcamento_bdis_bloqueio before insert or update or delete on orcamento_bdis
  for each row execute function fn_orcamento_bloqueio_status('orcamento_id');
create trigger trg_05_orcamento_etapas_bloqueio before insert or update or delete on orcamento_etapas
  for each row execute function fn_orcamento_bloqueio_status('orcamento_id');
create trigger trg_05_orcamento_itens_bloqueio before insert or update or delete on orcamento_itens
  for each row execute function fn_orcamento_bloqueio_status('orcamento_id');
create trigger trg_05_orcamento_insumo_precos_bloqueio before insert or update or delete on orcamento_insumo_precos
  for each row execute function fn_orcamento_bloqueio_status('orcamento_id');
create trigger trg_05_orcamento_item_memorias_bloqueio before insert or update or delete on orcamento_item_memorias
  for each row execute function fn_orcamento_bloqueio_status('item_id');

-- ─── Etapas: mesmo orçamento do pai, profundidade ≤ 3, sem ciclo ────────────
create or replace function fn_orcamento_etapas_valida() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pai_orc uuid;
  v_nivel   integer;
  v_altura  integer := 0;
  v_ciclo   boolean;
begin
  if new.parent_id is null then
    v_nivel := 1;
  else
    select e.orcamento_id into v_pai_orc from orcamento_etapas e where e.id = new.parent_id;
    if v_pai_orc is null then
      raise exception 'Etapa-pai não encontrada.' using errcode = 'P0001';
    end if;
    if v_pai_orc <> new.orcamento_id then
      raise exception 'A etapa-pai pertence a outro orçamento.' using errcode = 'P0001';
    end if;
    -- nível do pai e detecção de ciclo (mover para dentro de uma descendente)
    with recursive anc(id, parent_id, n, caminho) as (
      select e.id, e.parent_id, 1, array[e.id] from orcamento_etapas e where e.id = new.parent_id
      union all
      select e.id, e.parent_id, a.n + 1, a.caminho || e.id
        from anc a join orcamento_etapas e on e.id = a.parent_id
       where a.n < 10 and not (e.id = any (a.caminho))
    )
    select count(*) + 1, coalesce(bool_or(id = new.id), false) into v_nivel, v_ciclo from anc;
    if v_ciclo then
      raise exception 'Uma etapa não pode ser movida para dentro de si mesma.' using errcode = 'P0001';
    end if;
  end if;

  -- altura da subárvore abaixo desta etapa (relevante ao mover)
  if tg_op = 'UPDATE' then
    with recursive des(id, n) as (
      select e.id, 1 from orcamento_etapas e where e.parent_id = new.id
      union all
      select e.id, d.n + 1 from des d join orcamento_etapas e on e.parent_id = d.id where d.n < 10
    ) select coalesce(max(n), 0) into v_altura from des;
  else
    v_altura := 0;
  end if;

  if v_nivel + v_altura > 3 then
    raise exception 'A EAP admite no máximo 3 níveis de etapas.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger trg_20_orcamento_etapas_valida before insert or update of parent_id, orcamento_id on orcamento_etapas
  for each row execute function fn_orcamento_etapas_valida();

-- ─── Itens: validações + cálculo (§8.3) ──────────────────────────────────────
create or replace function fn_orcamento_itens_calc() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_etapa_orc uuid;
  v_ref_org   uuid;
  v_achou     boolean;
  v_bdi       numeric;
  v_bdi_orc   uuid;
begin
  -- etapa do mesmo orçamento
  if tg_op = 'INSERT' or new.etapa_id is distinct from old.etapa_id or new.orcamento_id is distinct from old.orcamento_id then
    select e.orcamento_id into v_etapa_orc from orcamento_etapas e where e.id = new.etapa_id;
    if v_etapa_orc is distinct from new.orcamento_id then
      raise exception 'A etapa informada pertence a outro orçamento.' using errcode = 'P0001';
    end if;
  end if;

  -- referência: SINAPI ou própria da mesma organização
  if tg_op = 'INSERT' or new.composicao_id is distinct from old.composicao_id or new.insumo_id is distinct from old.insumo_id then
    if new.composicao_id is not null then
      select true, c.organizacao_id into v_achou, v_ref_org from composicoes c where c.id = new.composicao_id;
    elsif new.insumo_id is not null then
      select true, i.organizacao_id into v_achou, v_ref_org from insumos i where i.id = new.insumo_id;
    end if;
    if v_ref_org is not null and v_ref_org <> new.organizacao_id then
      raise exception 'Referência própria de outra organização não pode ser usada.' using errcode = 'P0001';
    end if;
  end if;

  -- BDI aplicado: na inclusão e quando o BDI do item muda
  if tg_op = 'INSERT' or new.bdi_id is distinct from old.bdi_id then
    if new.bdi_id is not null then
      select b.orcamento_id, b.bdi into v_bdi_orc, v_bdi from orcamento_bdis b where b.id = new.bdi_id;
      if v_bdi_orc is distinct from new.orcamento_id then
        raise exception 'O BDI informado pertence a outro orçamento.' using errcode = 'P0001';
      end if;
    else
      select b.bdi into v_bdi from orcamento_bdis b where b.orcamento_id = new.orcamento_id and b.is_padrao;
    end if;
    new.bdi_percentual := coalesce(v_bdi, 0);
  end if;

  -- quantidade pela memória de cálculo
  if new.usa_memoria then
    select round(coalesce(sum(m.resultado), 0), 4) into new.quantidade
      from orcamento_item_memorias m where m.item_id = new.id;
  end if;

  new.custo_unitario := round(coalesce(new.custo_unitario, 0), 2);
  new.quantidade     := coalesce(new.quantidade, 0);
  new.bdi_percentual := coalesce(new.bdi_percentual, 0);
  new.preco_unitario := round(new.custo_unitario * (1 + new.bdi_percentual / 100), 2);
  new.total_sem_bdi  := round(new.quantidade * new.custo_unitario, 2);
  new.total          := round(new.quantidade * new.preco_unitario, 2);
  return new;
end $$;

create trigger trg_30_orcamento_itens_calc before insert or update on orcamento_itens
  for each row execute function fn_orcamento_itens_calc();

-- ─── Memória de cálculo → quantidade do item ─────────────────────────────────
create or replace function fn_orcamento_memorias_atualiza_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update orcamento_itens set quantidade = quantidade where id = old.item_id and usa_memoria;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.item_id is distinct from old.item_id) then
    update orcamento_itens set quantidade = quantidade where id = new.item_id and usa_memoria;
  end if;
  return null;
end $$;

create trigger trg_orcamento_item_memorias_qtd after insert or update or delete on orcamento_item_memorias
  for each row execute function fn_orcamento_memorias_atualiza_item();

-- ─── Cotações: insumo SINAPI ou próprio da mesma organização ────────────────
create or replace function fn_orcamento_insumo_precos_valida() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select i.organizacao_id into v_org from insumos i where i.id = new.insumo_id;
  if v_org is not null and v_org <> new.organizacao_id then
    raise exception 'Insumo próprio de outra organização não pode ser cotado.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_20_orcamento_insumo_precos_valida before insert or update on orcamento_insumo_precos
  for each row execute function fn_orcamento_insumo_precos_valida();

-- ─── Orçamento: data-base e encargos visíveis ───────────────────────────────
create or replace function fn_orcamentos_valida() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_status data_base_status;
begin
  if tg_op = 'INSERT' or new.data_base_id is distinct from old.data_base_id then
    select d.status into v_status from datas_base d where d.id = new.data_base_id;
    if v_status is null then
      raise exception 'Data-base não encontrada.' using errcode = 'P0001';
    end if;
    if v_status <> 'publicada' and auth.uid() is not null and not is_admin() then
      raise exception 'Data-base indisponível (não publicada).' using errcode = 'P0001';
    end if;
  end if;
  if new.orcamento_origem_id is not null and (tg_op = 'INSERT' or new.orcamento_origem_id is distinct from old.orcamento_origem_id)
     and not exists (select 1 from orcamentos o where o.id = new.orcamento_origem_id and o.organizacao_id = new.organizacao_id) then
    raise exception 'Orçamento de origem inválido.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_20_orcamentos_valida before insert or update of data_base_id, orcamento_origem_id on orcamentos
  for each row execute function fn_orcamentos_valida();

-- ─── Auditoria ───────────────────────────────────────────────────────────────
create trigger trg_orcamentos_auditoria after insert or update or delete on orcamentos
  for each row execute function fn_auditoria_trigger();
create trigger trg_orcamento_bdis_auditoria after insert or update or delete on orcamento_bdis
  for each row execute function fn_auditoria_trigger();

revoke execute on function fn_orcamento_bloqueio_status(), fn_orcamento_etapas_valida(), fn_orcamento_itens_calc(),
  fn_orcamento_memorias_atualiza_item(), fn_orcamento_insumo_precos_valida(), fn_orcamentos_valida()
  from public, anon;
