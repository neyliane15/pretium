-- =============================================================================
-- 0021 — BACKEND-2: RPCs do orçamento (§7.2)
-- fn_orcamento_criar / recalcular / renumerar / duplicar / trocar_data_base / mover /
-- adicionar_item / resumo  (+ fn_orcamento_totalizar interno)
-- =============================================================================

-- ─── Interno: totais de etapas (recursivo) e do orçamento (§8.3) ────────────
create or replace function fn_orcamento_totalizar(p_orcamento_id uuid) returns orcamentos
language plpgsql security definer set search_path = public as $$
declare
  v orcamentos;
begin
  with recursive fecho(ancestral, etapa) as (
    select e.id, e.id from orcamento_etapas e where e.orcamento_id = p_orcamento_id
    union all
    select f.ancestral, e.id from fecho f join orcamento_etapas e on e.parent_id = f.etapa
  ), tot as (
    select f.ancestral as id,
           coalesce(sum(i.total_sem_bdi), 0) as total_sem_bdi,
           coalesce(sum(i.total), 0) as total
      from fecho f left join orcamento_itens i on i.etapa_id = f.etapa
     group by f.ancestral
  )
  update orcamento_etapas e set total_sem_bdi = t.total_sem_bdi, total = t.total
    from tot t
   where e.id = t.id and (e.total_sem_bdi, e.total) is distinct from (t.total_sem_bdi, t.total);

  update orcamentos o
     set total_sem_bdi   = x.sem,
         total           = x.com,
         total_bdi       = x.com - x.sem,
         itens_sem_preco = x.n_sem,
         recalculado_em  = now()
    from (select coalesce((select sum(e.total_sem_bdi) from orcamento_etapas e where e.orcamento_id = p_orcamento_id and e.parent_id is null), 0) as sem,
                 coalesce((select sum(e.total) from orcamento_etapas e where e.orcamento_id = p_orcamento_id and e.parent_id is null), 0) as com,
                 (select count(*) from orcamento_itens i where i.orcamento_id = p_orcamento_id and i.sem_preco)::integer as n_sem) x
   where o.id = p_orcamento_id
  returning o.* into v;
  return v;
end $$;

-- ─── fn_orcamento_renumerar (§8.9) ───────────────────────────────────────────
create or replace function fn_orcamento_renumerar(p_orcamento_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform fn_orc_assert_editar_orcamento(p_orcamento_id);

  with recursive irm as (
    select e.id, e.parent_id,
           row_number() over (partition by e.parent_id order by e.ordem, e.id) as rn
      from orcamento_etapas e where e.orcamento_id = p_orcamento_id
  ), cod(id, codigo) as (
    select irm.id, irm.rn::text from irm where irm.parent_id is null
    union all
    select irm.id, cod.codigo || '.' || irm.rn from irm join cod on irm.parent_id = cod.id
  )
  update orcamento_etapas e set codigo = cod.codigo
    from cod where e.id = cod.id and e.codigo is distinct from cod.codigo;

  with nsub as (
    select e.id, (select count(*) from orcamento_etapas s where s.parent_id = e.id) as n, e.codigo
      from orcamento_etapas e where e.orcamento_id = p_orcamento_id
  ), novos as (
    select i.id,
           nsub.codigo || '.' || (nsub.n + row_number() over (partition by i.etapa_id order by i.ordem, i.id)) as codigo
      from orcamento_itens i join nsub on nsub.id = i.etapa_id
     where i.orcamento_id = p_orcamento_id
  )
  update orcamento_itens i set codigo = novos.codigo
    from novos where i.id = novos.id and i.codigo is distinct from novos.codigo;
end $$;

-- ─── fn_orcamento_criar ──────────────────────────────────────────────────────
create or replace function fn_orcamento_criar(p_obra_id uuid, p_nome text, p_data_base_id uuid, p_bdi_padrao jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_obra  obras;
  v_db    datas_base;
  v_id    uuid;
  v_enc   uuid;
  b       jsonb := coalesce(p_bdi_padrao, '{}'::jsonb);
  v_pis   numeric;
  v_cof   numeric;
begin
  select * into v_obra from obras where id = p_obra_id;
  if not found then
    raise exception 'Obra não encontrada.' using errcode = 'P0001';
  end if;
  perform assert_pode_editar(v_obra.organizacao_id);
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Informe o nome do orçamento.' using errcode = 'P0001';
  end if;
  select * into v_db from datas_base where id = p_data_base_id;
  if not found or (v_db.status <> 'publicada' and not is_admin()) then
    raise exception 'Data-base indisponível.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(b) <> 'object' then
    raise exception 'Parâmetros de BDI inválidos.' using errcode = 'P0001';
  end if;
  v_pis := coalesce(fn_numero_br(b -> 'pis'), 0.65);
  v_cof := coalesce(fn_numero_br(b -> 'cofins'), 3.00);
  if v_pis + v_cof + coalesce(fn_numero_br(b -> 'iss'), 0) + coalesce(fn_numero_br(b -> 'cprb'), 0) >= 100 then
    raise exception 'A soma dos tributos (I) deve ser menor que 100%%.' using errcode = 'P0001';
  end if;

  -- tabela de encargos de referência mais recente da mesma UF/regime (se houver)
  select e.id into v_enc from encargos_sociais e
   where e.organizacao_id is null and e.regime = v_db.regime and (e.uf = v_db.uf or e.uf is null)
   order by (e.uf = v_db.uf) desc nulls last, e.is_demo = v_db.is_demo desc, e.vigencia desc nulls last, e.created_at desc
   limit 1;

  insert into orcamentos (organizacao_id, obra_id, nome, data_base_id, encargos_sociais_id, versao)
  values (v_obra.organizacao_id, p_obra_id, btrim(p_nome), p_data_base_id, v_enc, 1)
  returning id into v_id;

  insert into orcamento_bdis (orcamento_id, nome, is_padrao, ac, s, r, g, df, l, pis, cofins, iss, cprb)
  values (v_id, coalesce(nullif(btrim(b ->> 'nome'), ''), 'BDI Serviços'), true,
          coalesce(fn_numero_br(b -> 'ac'), 0), coalesce(fn_numero_br(b -> 's'), 0),
          coalesce(fn_numero_br(b -> 'r'), 0), coalesce(fn_numero_br(b -> 'g'), 0),
          coalesce(fn_numero_br(b -> 'df'), 0), coalesce(fn_numero_br(b -> 'l'), 0),
          v_pis, v_cof, coalesce(fn_numero_br(b -> 'iss'), 0), coalesce(fn_numero_br(b -> 'cprb'), 0));

  insert into orcamento_etapas (orcamento_id, ordem, codigo, nome)
  values (v_id, 1, '1', 'Serviços preliminares');

  return v_id;
end $$;

-- ─── fn_orcamento_recalcular ─────────────────────────────────────────────────
create or replace function fn_orcamento_recalcular(p_orcamento_id uuid) returns orcamentos
language plpgsql security definer set search_path = public as $$
declare
  v       orcamentos;
  v_comps uuid[];
  v_bdi_padrao numeric;
begin
  v := fn_orc_assert_editar_orcamento(p_orcamento_id);
  -- aprovado/arquivado: valores congelados (itens somente leitura) — devolve sem alterar
  if v.status in ('aprovado', 'arquivado') and not is_admin() then
    return v;
  end if;

  select coalesce(array_agg(distinct i.composicao_id), '{}') into v_comps
    from orcamento_itens i
   where i.orcamento_id = p_orcamento_id and i.referencia_tipo = 'composicao' and not i.custo_manual;

  select b.bdi into v_bdi_padrao from orcamento_bdis b where b.orcamento_id = p_orcamento_id and b.is_padrao;

  with custos as (
    select f.composicao_id, f.custo, f.sem_preco from fn_custos_composicoes(v_comps, v.data_base_id, p_orcamento_id) f
  ), novos as (
    select i.id,
           case
             when i.custo_manual or i.referencia_tipo = 'livre' then i.custo_unitario
             when i.referencia_tipo = 'composicao' then coalesce(c.custo, 0)
             else round(coalesce(fn_preco_insumo_interno(i.insumo_id, v.data_base_id, p_orcamento_id), 0), 2)
           end as custo,
           case
             when i.custo_manual or i.referencia_tipo = 'livre' then i.custo_unitario = 0
             when i.referencia_tipo = 'composicao' then c.custo is null or coalesce(c.sem_preco, true)
             else fn_preco_insumo_interno(i.insumo_id, v.data_base_id, p_orcamento_id) is null
           end as sem,
           coalesce(b.bdi, v_bdi_padrao, 0) as bdi
      from orcamento_itens i
      left join custos c on c.composicao_id = i.composicao_id
      left join orcamento_bdis b on b.id = i.bdi_id
     where i.orcamento_id = p_orcamento_id
  )
  update orcamento_itens i
     set custo_unitario = n.custo, sem_preco = n.sem, bdi_percentual = n.bdi
    from novos n
   where i.id = n.id
     and (i.custo_unitario, i.sem_preco, i.bdi_percentual) is distinct from (round(n.custo, 2), n.sem, n.bdi::numeric(9,4));

  return fn_orcamento_totalizar(p_orcamento_id);
end $$;

-- ─── fn_orcamento_trocar_data_base ───────────────────────────────────────────
create or replace function fn_orcamento_trocar_data_base(p_orcamento_id uuid, p_data_base_id uuid) returns orcamentos
language plpgsql security definer set search_path = public as $$
declare
  v orcamentos;
  v_db datas_base;
begin
  v := fn_orc_assert_editar_orcamento(p_orcamento_id);
  if v.status in ('aprovado', 'arquivado') and not is_admin() then
    raise exception 'Orçamento aprovado/arquivado não pode trocar de data-base.' using errcode = 'P0001';
  end if;
  select * into v_db from datas_base where id = p_data_base_id;
  if not found or (v_db.status <> 'publicada' and not is_admin()) then
    raise exception 'Data-base indisponível.' using errcode = 'P0001';
  end if;
  update orcamentos set data_base_id = p_data_base_id where id = p_orcamento_id;
  return fn_orcamento_recalcular(p_orcamento_id);
end $$;

-- ─── fn_orcamento_adicionar_item ─────────────────────────────────────────────
create or replace function fn_orcamento_adicionar_item(
  p_etapa_id uuid, p_referencia_tipo item_referencia_tipo, p_referencia_id uuid default null,
  p_quantidade numeric default 0, p_descricao text default null, p_unidade text default null,
  p_custo_unitario numeric default null
) returns orcamento_itens
language plpgsql security definer set search_path = public as $$
declare
  v_etapa  orcamento_etapas;
  v        orcamentos;
  v_item   orcamento_itens;
  v_cod    text;
  v_desc   text;
  v_un     text;
  v_fonte  text;
  v_org    uuid;
  v_custo  numeric;
  v_sem    boolean;
  v_achou  boolean;
  v_id     uuid;
begin
  select * into v_etapa from orcamento_etapas where id = p_etapa_id;
  if not found then
    raise exception 'Etapa não encontrada.' using errcode = 'P0001';
  end if;
  v := fn_orc_assert_editar_orcamento(v_etapa.orcamento_id);
  if p_quantidade is not null and p_quantidade < 0 then
    raise exception 'A quantidade não pode ser negativa.' using errcode = 'P0001';
  end if;

  if p_referencia_tipo = 'composicao' then
    select true, c.codigo, c.descricao, c.unidade, c.organizacao_id into v_achou, v_cod, v_desc, v_un, v_org
      from composicoes c where c.id = p_referencia_id;
    if v_achou is null or (v_org is not null and v_org <> v.organizacao_id) then
      raise exception 'Composição não encontrada.' using errcode = 'P0001';
    end if;
    select f.custo, f.custo is null or f.sem_preco into v_custo, v_sem
      from fn_custos_composicoes(array[p_referencia_id], v.data_base_id, v.id) f where f.composicao_id = p_referencia_id;
  elsif p_referencia_tipo = 'insumo' then
    select true, i.codigo, i.descricao, i.unidade, i.organizacao_id into v_achou, v_cod, v_desc, v_un, v_org
      from insumos i where i.id = p_referencia_id;
    if v_achou is null or (v_org is not null and v_org <> v.organizacao_id) then
      raise exception 'Insumo não encontrado.' using errcode = 'P0001';
    end if;
    v_custo := fn_preco_insumo_interno(p_referencia_id, v.data_base_id, v.id);
    v_sem := v_custo is null;
  elsif p_referencia_tipo = 'livre' then
    if p_referencia_id is not null then
      raise exception 'Item livre não tem referência.' using errcode = 'P0001';
    end if;
    if p_descricao is null or btrim(p_descricao) = '' then
      raise exception 'Informe a descrição do item.' using errcode = 'P0001';
    end if;
    v_desc := btrim(p_descricao);
    v_un := 'UN';
    v_custo := coalesce(p_custo_unitario, 0);
    v_sem := v_custo = 0;
  else
    raise exception 'Tipo de referência inválido.' using errcode = 'P0001';
  end if;

  v_fonte := case when p_referencia_tipo = 'livre' or v_org is not null then 'PRÓPRIA' else 'SINAPI' end;
  if p_referencia_tipo <> 'livre' and p_custo_unitario is not null then
    v_custo := p_custo_unitario;
    v_sem := p_custo_unitario = 0;
  end if;

  insert into orcamento_itens (orcamento_id, etapa_id, ordem, referencia_tipo, composicao_id, insumo_id, fonte,
                               referencia_codigo, descricao, unidade, quantidade, custo_unitario, custo_manual, sem_preco)
  values (v.id, p_etapa_id,
          coalesce((select max(i.ordem) from orcamento_itens i where i.etapa_id = p_etapa_id), 0) + 1,
          p_referencia_tipo,
          case when p_referencia_tipo = 'composicao' then p_referencia_id end,
          case when p_referencia_tipo = 'insumo' then p_referencia_id end,
          v_fonte, v_cod,
          coalesce(nullif(btrim(p_descricao), ''), v_desc),
          coalesce(nullif(upper(btrim(p_unidade)), ''), v_un),
          coalesce(p_quantidade, 0),
          coalesce(v_custo, 0),
          p_referencia_tipo <> 'livre' and p_custo_unitario is not null,
          coalesce(v_sem, true))
  returning id into v_id;

  perform fn_orcamento_renumerar(v.id);
  perform fn_orcamento_totalizar(v.id);
  select * into v_item from orcamento_itens where id = v_id;
  return v_item;
end $$;

-- ─── fn_orcamento_mover ──────────────────────────────────────────────────────
-- p_nova_ordem = posição 1-based entre os irmãos de destino (≤ 1 ⇒ primeiro; > n ⇒ último).
create or replace function fn_orcamento_mover(p_tipo text, p_id uuid, p_novo_pai_id uuid, p_nova_ordem integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_orc      uuid;
  v_pai_orc  uuid;
  v_ant_pai  uuid;
begin
  if p_tipo = 'etapa' then
    select e.orcamento_id, e.parent_id into v_orc, v_ant_pai from orcamento_etapas e where e.id = p_id;
    if v_orc is null then
      raise exception 'Etapa não encontrada.' using errcode = 'P0001';
    end if;
    perform fn_orc_assert_editar_orcamento(v_orc);
    if p_novo_pai_id is not null then
      select e.orcamento_id into v_pai_orc from orcamento_etapas e where e.id = p_novo_pai_id;
      if v_pai_orc is distinct from v_orc then
        raise exception 'Etapa de destino inválida.' using errcode = 'P0001';
      end if;
    end if;
    -- (ciclo e profundidade validados pelo trigger fn_orcamento_etapas_valida)
    update orcamento_etapas set parent_id = p_novo_pai_id, ordem = -1 where id = p_id;

    with irm as (
      select e.id, row_number() over (order by e.ordem, e.id) as rn
        from orcamento_etapas e
       where e.orcamento_id = v_orc and e.parent_id is not distinct from p_novo_pai_id and e.id <> p_id
    ), pos as (
      select least(greatest(coalesce(p_nova_ordem, 1), 1), (select count(*) from irm) + 1) as p
    ), nova as (
      select irm.id, case when irm.rn < pos.p then irm.rn else irm.rn + 1 end as ordem from irm, pos
      union all
      select p_id, pos.p from pos
    )
    update orcamento_etapas e set ordem = nova.ordem from nova where e.id = nova.id and e.ordem is distinct from nova.ordem;

    if v_ant_pai is distinct from p_novo_pai_id then
      update orcamento_etapas e set ordem = x.rn
        from (select id, row_number() over (order by ordem, id) as rn from orcamento_etapas
               where orcamento_id = v_orc and parent_id is not distinct from v_ant_pai) x
       where e.id = x.id and e.ordem is distinct from x.rn;
    end if;

  elsif p_tipo = 'item' then
    select i.orcamento_id, i.etapa_id into v_orc, v_ant_pai from orcamento_itens i where i.id = p_id;
    if v_orc is null then
      raise exception 'Item não encontrado.' using errcode = 'P0001';
    end if;
    perform fn_orc_assert_editar_orcamento(v_orc);
    select e.orcamento_id into v_pai_orc from orcamento_etapas e where e.id = p_novo_pai_id;
    if p_novo_pai_id is null or v_pai_orc is distinct from v_orc then
      raise exception 'Etapa de destino inválida.' using errcode = 'P0001';
    end if;
    update orcamento_itens set etapa_id = p_novo_pai_id, ordem = -1 where id = p_id;

    with irm as (
      select i.id, row_number() over (order by i.ordem, i.id) as rn
        from orcamento_itens i where i.etapa_id = p_novo_pai_id and i.id <> p_id
    ), pos as (
      select least(greatest(coalesce(p_nova_ordem, 1), 1), (select count(*) from irm) + 1) as p
    ), nova as (
      select irm.id, case when irm.rn < pos.p then irm.rn else irm.rn + 1 end as ordem from irm, pos
      union all
      select p_id, pos.p from pos
    )
    update orcamento_itens i set ordem = nova.ordem from nova where i.id = nova.id and i.ordem is distinct from nova.ordem;

    if v_ant_pai is distinct from p_novo_pai_id then
      update orcamento_itens i set ordem = x.rn
        from (select id, row_number() over (order by ordem, id) as rn from orcamento_itens where etapa_id = v_ant_pai) x
       where i.id = x.id and i.ordem is distinct from x.rn;
    end if;
  else
    raise exception 'Tipo inválido: use etapa ou item.' using errcode = 'P0001';
  end if;

  perform fn_orcamento_renumerar(v_orc);
  perform fn_orcamento_totalizar(v_orc);
end $$;

-- ─── fn_orcamento_duplicar ───────────────────────────────────────────────────
create or replace function fn_orcamento_duplicar(p_orcamento_id uuid, p_nome text default null, p_nova_versao boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v       orcamentos;
  v_novo  uuid := gen_random_uuid();
  m_bdi   jsonb;
  m_eta   jsonb;
  m_item  jsonb;
  m_eq    jsonb;
  v_cron  uuid;
begin
  v := fn_orc_assert_editar_orcamento(p_orcamento_id);

  insert into orcamentos (id, organizacao_id, obra_id, codigo, nome, descricao, versao, orcamento_origem_id, status,
                          data_base_id, encargos_sociais_id, data_orcamento, validade_dias, total_sem_bdi, total_bdi,
                          total, itens_sem_preco, recalculado_em, observacoes)
  values (v_novo, v.organizacao_id, v.obra_id, v.codigo,
          coalesce(nullif(btrim(p_nome), ''), case when coalesce(p_nova_versao, true) then v.nome else v.nome || ' (cópia)' end),
          v.descricao,
          case when coalesce(p_nova_versao, true)
               then (select max(o.versao) from orcamentos o where o.obra_id = v.obra_id) + 1
               else v.versao end,
          v.id, 'rascunho', v.data_base_id, v.encargos_sociais_id, current_date, v.validade_dias,
          v.total_sem_bdi, v.total_bdi, v.total, v.itens_sem_preco, v.recalculado_em, v.observacoes);

  -- BDIs
  select coalesce(jsonb_object_agg(b.id::text, gen_random_uuid()), '{}') into m_bdi from orcamento_bdis b where b.orcamento_id = v.id;
  insert into orcamento_bdis (id, orcamento_id, nome, is_padrao, ac, s, r, g, df, l, pis, cofins, iss, cprb)
  select (m_bdi ->> b.id::text)::uuid, v_novo, b.nome, b.is_padrao, b.ac, b.s, b.r, b.g, b.df, b.l, b.pis, b.cofins, b.iss, b.cprb
    from orcamento_bdis b where b.orcamento_id = v.id;

  -- Etapas (nível a nível, para o trigger enxergar o pai)
  select coalesce(jsonb_object_agg(e.id::text, gen_random_uuid()), '{}') into m_eta from orcamento_etapas e where e.orcamento_id = v.id;
  for v_nivel in 1..3 loop
    with recursive niv(id, n) as (
      select e.id, 1 from orcamento_etapas e where e.orcamento_id = v.id and e.parent_id is null
      union all
      select e.id, niv.n + 1 from niv join orcamento_etapas e on e.parent_id = niv.id
    )
    insert into orcamento_etapas (id, orcamento_id, parent_id, ordem, codigo, nome, total_sem_bdi, total)
    select (m_eta ->> e.id::text)::uuid, v_novo, (m_eta ->> e.parent_id::text)::uuid, e.ordem, e.codigo, e.nome, e.total_sem_bdi, e.total
      from orcamento_etapas e join niv on niv.id = e.id
     where niv.n = v_nivel;
  end loop;

  -- Itens
  select coalesce(jsonb_object_agg(i.id::text, gen_random_uuid()), '{}') into m_item from orcamento_itens i where i.orcamento_id = v.id;
  insert into orcamento_itens (id, orcamento_id, etapa_id, ordem, codigo, referencia_tipo, composicao_id, insumo_id, fonte,
                               referencia_codigo, descricao, unidade, quantidade, usa_memoria, custo_unitario, custo_manual,
                               bdi_id, bdi_percentual, sem_preco, observacao)
  select (m_item ->> i.id::text)::uuid, v_novo, (m_eta ->> i.etapa_id::text)::uuid, i.ordem, i.codigo, i.referencia_tipo,
         i.composicao_id, i.insumo_id, i.fonte, i.referencia_codigo, i.descricao, i.unidade, i.quantidade,
         false, i.custo_unitario, i.custo_manual, (m_bdi ->> i.bdi_id::text)::uuid, i.bdi_percentual, i.sem_preco, i.observacao
    from orcamento_itens i where i.orcamento_id = v.id;

  -- Memórias (depois liga usa_memoria, preservando a quantidade = Σ resultado)
  insert into orcamento_item_memorias (item_id, ordem, descricao, expressao, resultado)
  select (m_item ->> m.item_id::text)::uuid, m.ordem, m.descricao, m.expressao, m.resultado
    from orcamento_item_memorias m join orcamento_itens i on i.id = m.item_id
   where i.orcamento_id = v.id;
  update orcamento_itens n set usa_memoria = true
    from orcamento_itens o
   where o.orcamento_id = v.id and o.usa_memoria and n.id = (m_item ->> o.id::text)::uuid;
  -- BDI copiado explicitamente (o trigger recalcularia pelo BDI novo, que é idêntico)
  update orcamento_itens n set bdi_percentual = o.bdi_percentual
    from orcamento_itens o
   where o.orcamento_id = v.id and n.id = (m_item ->> o.id::text)::uuid and n.bdi_percentual is distinct from o.bdi_percentual;

  -- Cotações
  insert into orcamento_insumo_precos (orcamento_id, insumo_id, preco, fonte)
  select v_novo, q.insumo_id, q.preco, q.fonte from orcamento_insumo_precos q where q.orcamento_id = v.id;

  -- Cronograma
  insert into cronogramas (orcamento_id, data_inicio, periodicidade, num_periodos)
  select v_novo, c.data_inicio, c.periodicidade, c.num_periodos from cronogramas c where c.orcamento_id = v.id
  returning id into v_cron;
  if v_cron is not null then
    insert into cronograma_distribuicoes (cronograma_id, etapa_id, periodo, percentual)
    select v_cron, (m_eta ->> d.etapa_id::text)::uuid, d.periodo, d.percentual
      from cronograma_distribuicoes d join cronogramas c on c.id = d.cronograma_id
     where c.orcamento_id = v.id;
  end if;

  -- Equipes e membros
  select coalesce(jsonb_object_agg(q.id::text, gen_random_uuid()), '{}') into m_eq from orcamento_equipes q where q.orcamento_id = v.id;
  insert into orcamento_equipes (id, orcamento_id, nome, descricao, ordem)
  select (m_eq ->> q.id::text)::uuid, v_novo, q.nome, q.descricao, q.ordem from orcamento_equipes q where q.orcamento_id = v.id;
  insert into orcamento_equipe_membros (equipe_id, funcao, insumo_id, salario_hora, aplicar_encargos, quantidade, horas_dia, dias, ordem)
  select (m_eq ->> mb.equipe_id::text)::uuid, mb.funcao, mb.insumo_id, mb.salario_hora, mb.aplicar_encargos, mb.quantidade,
         mb.horas_dia, mb.dias, mb.ordem
    from orcamento_equipe_membros mb join orcamento_equipes q on q.id = mb.equipe_id
   where q.orcamento_id = v.id;

  perform fn_orcamento_totalizar(v_novo);
  return v_novo;
end $$;

-- ─── fn_orcamento_resumo (sintético) ─────────────────────────────────────────
create or replace function fn_orcamento_resumo(p_orcamento_id uuid)
returns table (etapa_id uuid, parent_id uuid, codigo text, nome text, nivel integer, ordem_path text,
               total_sem_bdi numeric, total numeric, percentual numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v orcamentos;
begin
  v := fn_orc_assert_ler_orcamento(p_orcamento_id);
  return query
  with recursive irm as (
    select e.*, row_number() over (partition by e.parent_id order by e.ordem, e.id) as rn
      from orcamento_etapas e where e.orcamento_id = p_orcamento_id
  ), arv as (
    select irm.id, irm.parent_id, irm.codigo, irm.nome, 1 as nivel, lpad(irm.rn::text, 4, '0') as caminho,
           irm.total_sem_bdi, irm.total
      from irm where irm.parent_id is null
    union all
    select irm.id, irm.parent_id, irm.codigo, irm.nome, arv.nivel + 1, arv.caminho || '.' || lpad(irm.rn::text, 4, '0'),
           irm.total_sem_bdi, irm.total
      from irm join arv on irm.parent_id = arv.id
  )
  select arv.id, arv.parent_id, arv.codigo, arv.nome, arv.nivel, arv.caminho, arv.total_sem_bdi::numeric, arv.total::numeric,
         case when v.total = 0 then 0::numeric else arv.total / v.total * 100 end
    from arv
   order by arv.caminho;
end $$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function fn_orcamento_totalizar(uuid) from public, anon, authenticated;
revoke execute on function
  fn_orcamento_criar(uuid, text, uuid, jsonb), fn_orcamento_recalcular(uuid), fn_orcamento_renumerar(uuid),
  fn_orcamento_duplicar(uuid, text, boolean), fn_orcamento_trocar_data_base(uuid, uuid),
  fn_orcamento_mover(text, uuid, uuid, integer),
  fn_orcamento_adicionar_item(uuid, item_referencia_tipo, uuid, numeric, text, text, numeric),
  fn_orcamento_resumo(uuid)
  from public, anon;
grant execute on function
  fn_orcamento_criar(uuid, text, uuid, jsonb), fn_orcamento_recalcular(uuid), fn_orcamento_renumerar(uuid),
  fn_orcamento_duplicar(uuid, text, boolean), fn_orcamento_trocar_data_base(uuid, uuid),
  fn_orcamento_mover(text, uuid, uuid, integer),
  fn_orcamento_adicionar_item(uuid, item_referencia_tipo, uuid, numeric, text, text, numeric),
  fn_orcamento_resumo(uuid)
  to authenticated;
