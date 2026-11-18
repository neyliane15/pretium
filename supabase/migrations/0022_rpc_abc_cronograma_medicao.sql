-- =============================================================================
-- 0022 — BACKEND-2: curvas ABC (§8.4, §8.5), cronograma (§8.9), medições, mão de obra (§8.6),
-- honorários (§8.7), encargos e dashboard
-- =============================================================================

-- ─── Interno: explosão de insumos do orçamento (§8.4) ───────────────────────
-- Uma linha por "folha": insumo (insumo_id), composição sem itens analíticos (composicao_id) ou
-- item livre/custo manual (item_id). quantidade = item.quantidade × Π coeficientes.
create or replace function fn_orcamento_explosao(p_orcamento_id uuid)
returns table (insumo_id uuid, composicao_id uuid, item_id uuid, quantidade numeric)
language sql stable security definer set search_path = public as $$
  with recursive base as (
    select i.id, i.referencia_tipo, i.composicao_id, i.insumo_id, i.quantidade, i.custo_manual
      from orcamento_itens i
     where i.orcamento_id = p_orcamento_id and i.quantidade > 0
  ), exp(comp_id, qtd, prof, caminho) as (
    select b.composicao_id, b.quantidade::numeric, 1, array[b.composicao_id]
      from base b where b.referencia_tipo = 'composicao' and not b.custo_manual
    union all
    select ci.subcomposicao_id, e.qtd * ci.coeficiente, e.prof + 1, e.caminho || ci.subcomposicao_id
      from exp e join composicao_itens ci on ci.composicao_id = e.comp_id and ci.tipo_item = 'composicao'
     where e.prof < 11 and not (ci.subcomposicao_id = any (e.caminho))
  )
  -- insumos das composições explodidas
  select ci.insumo_id, null::uuid, null::uuid, e.qtd * ci.coeficiente
    from exp e join composicao_itens ci on ci.composicao_id = e.comp_id and ci.tipo_item = 'insumo'
  union all
  -- composições sem itens analíticos ⇒ pseudo-insumo
  select null, e.comp_id, null, e.qtd
    from exp e where not exists (select 1 from composicao_itens ci where ci.composicao_id = e.comp_id)
  union all
  -- itens de insumo direto
  select b.insumo_id, null, null, b.quantidade from base b where b.referencia_tipo = 'insumo' and not b.custo_manual
  union all
  -- itens livres e com custo manual ⇒ pseudo-insumo com o custo do item
  select null, null, b.id, b.quantidade from base b where b.referencia_tipo = 'livre' or b.custo_manual
$$;

-- ─── fn_curva_abc_servicos ───────────────────────────────────────────────────
create or replace function fn_curva_abc_servicos(p_orcamento_id uuid)
returns table (posicao integer, item_id uuid, codigo text, referencia_codigo text, descricao text, unidade text,
               quantidade numeric, preco_unitario numeric, total numeric, percentual numeric,
               percentual_acumulado numeric, classe char(1))
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform fn_orc_assert_ler_orcamento(p_orcamento_id);
  return query
  with l as (
    select i.id, i.codigo, i.referencia_codigo, i.descricao, i.unidade, i.quantidade, i.preco_unitario, i.total::numeric as total
      from orcamento_itens i where i.orcamento_id = p_orcamento_id and i.total > 0
  ), o as (
    select l.*,
           row_number() over w as pos,
           sum(l.total) over () as soma,
           sum(l.total) over (w rows between unbounded preceding and current row) as acum
      from l
    window w as (order by l.total desc, fn_codigo_ordem(l.codigo) nulls last, l.codigo, l.id)
  )
  select o.pos::integer, o.id, o.codigo, o.referencia_codigo, o.descricao, o.unidade, o.quantidade::numeric,
         o.preco_unitario::numeric, o.total,
         o.total / o.soma * 100,
         o.acum / o.soma * 100,
         (case when (o.acum - o.total) / o.soma * 100 < 80 then 'A'
               when (o.acum - o.total) / o.soma * 100 < 95 then 'B' else 'C' end)::char(1)
    from o order by o.pos;
end $$;

-- ─── fn_curva_abc_insumos ────────────────────────────────────────────────────
create or replace function fn_curva_abc_insumos(p_orcamento_id uuid)
returns table (posicao integer, insumo_id uuid, fonte fonte_referencia, codigo text, descricao text, unidade text,
               insumo_tipo insumo_tipo, quantidade numeric, preco_unitario numeric, total numeric, percentual numeric,
               percentual_acumulado numeric, classe char(1))
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v orcamentos;
  v_comps uuid[];
begin
  v := fn_orc_assert_ler_orcamento(p_orcamento_id);
  select coalesce(array_agg(distinct x.composicao_id) filter (where x.composicao_id is not null), '{}') into v_comps
    from fn_orcamento_explosao(p_orcamento_id) x;

  return query
  with ex as (
    select * from fn_orcamento_explosao(p_orcamento_id)
  ), cc as (
    select f.composicao_id, f.custo from fn_custos_composicoes(v_comps, v.data_base_id, p_orcamento_id) f
  ), l as (
    -- insumos
    select i.id as chave, i.id as insumo_id, i.fonte, i.codigo, i.descricao, i.unidade, i.tipo as insumo_tipo,
           g.q as quantidade, fn_preco_insumo_interno(i.id, v.data_base_id, p_orcamento_id) as preco
      from (select ex.insumo_id, sum(ex.quantidade) as q from ex where ex.insumo_id is not null group by ex.insumo_id) g
      join insumos i on i.id = g.insumo_id
    union all
    -- composições sem analítico
    select c.id, null::uuid, c.fonte, c.codigo, c.descricao, c.unidade, null::insumo_tipo, g.q, cc.custo
      from (select ex.composicao_id, sum(ex.quantidade) as q from ex where ex.composicao_id is not null group by ex.composicao_id) g
      join composicoes c on c.id = g.composicao_id
      left join cc on cc.composicao_id = c.id
    union all
    -- itens livres / custo manual
    select it.id, null::uuid, null::fonte_referencia, it.codigo, it.descricao, it.unidade, null::insumo_tipo, ex.quantidade,
           it.custo_unitario::numeric
      from ex join orcamento_itens it on it.id = ex.item_id
  ), t as (
    select l.*, round(l.quantidade * coalesce(l.preco, 0), 2) as total from l
  ), o as (
    select t.*,
           row_number() over w as pos,
           sum(t.total) over () as soma,
           sum(t.total) over (w rows between unbounded preceding and current row) as acum
      from t where t.total > 0
    window w as (order by t.total desc, fn_codigo_ordem(t.codigo) nulls last, t.codigo, t.chave)
  )
  select o.pos::integer, o.insumo_id, o.fonte, o.codigo, o.descricao, o.unidade, o.insumo_tipo, o.quantidade,
         o.preco, o.total, o.total / o.soma * 100, o.acum / o.soma * 100,
         (case when (o.acum - o.total) / o.soma * 100 < 80 then 'A'
               when (o.acum - o.total) / o.soma * 100 < 95 then 'B' else 'C' end)::char(1)
    from o order by o.pos;
end $$;

-- ─── Cronograma ──────────────────────────────────────────────────────────────
-- Início do período k (1-based), igual a gerarPeriodos() de calc.ts.
create or replace function fn_cronograma_inicio_periodo(p_data_inicio date, p_periodicidade cronograma_periodicidade, p_k integer)
returns date language sql immutable as $$
  select case p_periodicidade
    when 'mensal' then (p_data_inicio + make_interval(months => p_k - 1))::date
    when 'quinzenal' then p_data_inicio + (p_k - 1) * 15
    else p_data_inicio + (p_k - 1) * 7
  end
$$;

create or replace function fn_cronograma_fisico_financeiro(p_orcamento_id uuid)
returns table (etapa_id uuid, etapa_codigo text, etapa_nome text, etapa_total numeric, periodo integer,
               data_inicio date, data_fim date, percentual numeric, valor numeric,
               percentual_acumulado numeric, valor_acumulado numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform fn_orc_assert_ler_orcamento(p_orcamento_id);
  return query
  with c as (
    select * from cronogramas where orcamento_id = p_orcamento_id
  ), base as (
    select e.id, e.codigo, e.nome, e.total::numeric as total, e.ordem, k.k,
           fn_cronograma_inicio_periodo(c.data_inicio, c.periodicidade, k.k) as ini,
           fn_cronograma_inicio_periodo(c.data_inicio, c.periodicidade, k.k + 1) - 1 as fim,
           coalesce(d.percentual, 0)::numeric as pct
      from c
      join orcamento_etapas e on e.orcamento_id = p_orcamento_id and e.parent_id is null
      cross join lateral generate_series(1, c.num_periodos) k(k)
      left join cronograma_distribuicoes d on d.cronograma_id = c.id and d.etapa_id = e.id and d.periodo = k.k
  )
  select b.id, b.codigo, b.nome, b.total, b.k, b.ini, b.fim, b.pct,
         round(b.total * b.pct / 100, 2),
         sum(b.pct) over (partition by b.id order by b.k),
         sum(round(b.total * b.pct / 100, 2)) over (partition by b.id order by b.k)
    from base b
   order by fn_codigo_ordem(b.codigo) nulls last, b.ordem, b.id, b.k;
end $$;

create or replace function fn_cronograma_salvar(p_orcamento_id uuid, p_data_inicio date, p_periodicidade cronograma_periodicidade,
                                                p_num_periodos smallint, p_distribuicoes jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform fn_orc_assert_editar_orcamento(p_orcamento_id);
  if p_data_inicio is null then
    raise exception 'Informe a data de início.' using errcode = 'P0001';
  end if;
  if p_num_periodos is null or p_num_periodos not between 1 and 120 then
    raise exception 'O número de períodos deve estar entre 1 e 120.' using errcode = 'P0001';
  end if;
  if p_distribuicoes is not null and jsonb_typeof(p_distribuicoes) <> 'array' then
    raise exception 'Distribuições inválidas.' using errcode = 'P0001';
  end if;

  insert into cronogramas (orcamento_id, data_inicio, periodicidade, num_periodos)
  values (p_orcamento_id, p_data_inicio, coalesce(p_periodicidade, 'mensal'), p_num_periodos)
  on conflict (orcamento_id) do update
     set data_inicio = excluded.data_inicio, periodicidade = excluded.periodicidade, num_periodos = excluded.num_periodos
  returning id into v_id;

  delete from cronograma_distribuicoes where cronograma_id = v_id;

  insert into cronograma_distribuicoes (cronograma_id, etapa_id, periodo, percentual)
  select v_id, x.etapa_id, x.periodo, sum(x.percentual)
    from (select (e ->> 'etapa_id')::uuid as etapa_id,
                 fn_numero_br(e -> 'periodo')::smallint as periodo,
                 round(coalesce(fn_numero_br(e -> 'percentual'), 0), 4) as percentual
            from jsonb_array_elements(coalesce(p_distribuicoes, '[]'::jsonb)) e) x
   where x.etapa_id is not null and x.periodo between 1 and p_num_periodos and x.percentual <> 0
   group by x.etapa_id, x.periodo;
  return v_id;
end $$;

-- ─── Medições ────────────────────────────────────────────────────────────────
create or replace function fn_medicao_criar(p_orcamento_id uuid, p_periodo_inicio date, p_periodo_fim date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v orcamentos;
  v_id uuid;
begin
  v := fn_orc_assert_editar_orcamento(p_orcamento_id);
  if v.status not in ('aprovado', 'em_revisao') then
    raise exception 'A medição exige orçamento aprovado ou em revisão.' using errcode = 'P0001';
  end if;
  if p_periodo_inicio is null or p_periodo_fim is null or p_periodo_fim < p_periodo_inicio then
    raise exception 'Período da medição inválido.' using errcode = 'P0001';
  end if;
  perform 1 from orcamentos where id = p_orcamento_id for update;
  insert into medicoes (orcamento_id, numero, periodo_inicio, periodo_fim)
  values (p_orcamento_id, coalesce((select max(m.numero) from medicoes m where m.orcamento_id = p_orcamento_id), 0) + 1,
          p_periodo_inicio, p_periodo_fim)
  returning id into v_id;
  return v_id;
end $$;

create or replace function fn_medicao_resumo(p_medicao_id uuid)
returns table (item_id uuid, etapa_id uuid, codigo text, descricao text, unidade text, preco_unitario numeric,
               quantidade_orcada numeric, valor_orcado numeric, quantidade_anterior numeric, quantidade_atual numeric,
               quantidade_acumulada numeric, quantidade_saldo numeric, valor_anterior numeric, valor_atual numeric,
               valor_acumulado numeric, valor_saldo numeric, percentual_acumulado numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_med medicoes;
begin
  select * into v_med from medicoes where id = p_medicao_id;
  if not found then
    raise exception 'Medição não encontrada.' using errcode = 'P0001';
  end if;
  perform fn_orc_assert_ler_orcamento(v_med.orcamento_id);
  return query
  with ant as (
    select mi.item_id, sum(mi.quantidade) as q, sum(mi.valor) as val
      from medicao_itens mi join medicoes m on m.id = mi.medicao_id
     where m.orcamento_id = v_med.orcamento_id and m.numero < v_med.numero
     group by mi.item_id
  ), atu as (
    select mi.item_id, mi.quantidade as q, mi.valor as val from medicao_itens mi where mi.medicao_id = v_med.id
  )
  select i.id, i.etapa_id, i.codigo, i.descricao, i.unidade, i.preco_unitario::numeric,
         i.quantidade::numeric, i.total::numeric,
         coalesce(ant.q, 0), coalesce(atu.q, 0),
         coalesce(ant.q, 0) + coalesce(atu.q, 0),
         i.quantidade - coalesce(ant.q, 0) - coalesce(atu.q, 0),
         coalesce(ant.val, 0), coalesce(atu.val, 0),
         coalesce(ant.val, 0) + coalesce(atu.val, 0),
         i.total - coalesce(ant.val, 0) - coalesce(atu.val, 0),
         case when i.quantidade = 0 then 0::numeric
              else (coalesce(ant.q, 0) + coalesce(atu.q, 0)) / i.quantidade * 100 end
    from orcamento_itens i
    left join ant on ant.item_id = i.id
    left join atu on atu.item_id = i.id
   where i.orcamento_id = v_med.orcamento_id
   order by fn_codigo_ordem(i.codigo) nulls last, i.codigo, i.id;
end $$;

-- ─── Mão de obra (§8.6) ──────────────────────────────────────────────────────
create or replace function fn_mao_obra_resumo(p_orcamento_id uuid)
returns table (equipe_id uuid, equipe_nome text, membro_id uuid, funcao text, quantidade numeric, horas_dia numeric,
               dias numeric, horas_totais numeric, custo_hora numeric, custo_total numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v orcamentos;
  v_enc numeric;
begin
  v := fn_orc_assert_ler_orcamento(p_orcamento_id);
  select e.total_horista into v_enc from encargos_sociais e where e.id = v.encargos_sociais_id;
  v_enc := coalesce(v_enc, 0);
  return query
  with m as (
    select q.id as eq_id, q.nome as eq_nome, q.ordem as eq_ordem, mb.*,
           round(mb.quantidade * mb.horas_dia * mb.dias, 2) as ht,
           round(coalesce(
             case when mb.insumo_id is not null then fn_preco_insumo_interno(mb.insumo_id, v.data_base_id, p_orcamento_id) end,
             coalesce(mb.salario_hora, 0) * (1 + (case when mb.aplicar_encargos then v_enc else 0 end) / 100)
           ), 4) as ch
      from orcamento_equipes q join orcamento_equipe_membros mb on mb.equipe_id = q.id
     where q.orcamento_id = p_orcamento_id
  )
  select m.eq_id, m.eq_nome, m.id, m.funcao, m.quantidade::numeric, m.horas_dia::numeric, m.dias::numeric,
         m.ht, m.ch, round(m.ht * m.ch, 2)
    from m order by m.eq_ordem, m.eq_nome, m.eq_id, m.ordem, m.id;
end $$;

create or replace function fn_mao_obra_horas_orcamento(p_orcamento_id uuid)
returns table (insumo_id uuid, codigo text, descricao text, unidade text, horas numeric, custo numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v orcamentos;
begin
  v := fn_orc_assert_ler_orcamento(p_orcamento_id);
  return query
  select i.id, i.codigo, i.descricao, i.unidade, g.q,
         round(g.q * coalesce(fn_preco_insumo_interno(i.id, v.data_base_id, p_orcamento_id), 0), 2)
    from (select x.insumo_id, sum(x.quantidade) as q from fn_orcamento_explosao(p_orcamento_id) x
           where x.insumo_id is not null group by x.insumo_id) g
    join insumos i on i.id = g.insumo_id and i.tipo = 'mao_de_obra'
   order by g.q desc, fn_codigo_ordem(i.codigo) nulls last, i.codigo;
end $$;

-- ─── Honorários (§8.7) ───────────────────────────────────────────────────────
create or replace function fn_honorario_recalcular(p_honorario_id uuid) returns honorarios
language plpgsql security definer set search_path = public as $$
declare
  v honorarios;
begin
  select * into v from honorarios where id = p_honorario_id;
  if not found then
    raise exception 'Proposta de honorários não encontrada.' using errcode = 'P0001';
  end if;
  perform assert_pode_editar(v.organizacao_id);
  update honorario_disciplinas set valor = valor where honorario_id = p_honorario_id;   -- trigger recalcula
  update honorarios h
     set subtotal = coalesce((select sum(d.valor) from honorario_disciplinas d where d.honorario_id = h.id), 0)
   where h.id = p_honorario_id
  returning * into v;
  return v;
end $$;

-- ─── Encargos ────────────────────────────────────────────────────────────────
create or replace function fn_encargos_duplicar(p_encargos_id uuid, p_organizacao_id uuid, p_nome text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v encargos_sociais;
  v_id uuid;
begin
  perform assert_pode_editar(p_organizacao_id);
  select * into v from encargos_sociais where id = p_encargos_id;
  if not found or (v.organizacao_id is not null and not is_org_member(v.organizacao_id)) then
    raise exception 'Tabela de encargos não encontrada.' using errcode = 'P0001';
  end if;
  if v.organizacao_id is null and not is_active_user() then
    raise exception 'Usuário sem acesso.' using errcode = '42501';
  end if;
  insert into encargos_sociais (organizacao_id, nome, uf, regime, vigencia, is_demo)
  values (p_organizacao_id, coalesce(nullif(btrim(p_nome), ''), v.nome || ' (cópia)'), v.uf, v.regime, v.vigencia, v.is_demo)
  returning id into v_id;
  insert into encargos_sociais_itens (encargos_sociais_id, grupo, codigo, descricao, horista, mensalista, ordem)
  select v_id, i.grupo, i.codigo, i.descricao, i.horista, i.mensalista, i.ordem
    from encargos_sociais_itens i where i.encargos_sociais_id = p_encargos_id;
  return v_id;
end $$;

-- ─── Dashboard ───────────────────────────────────────────────────────────────
create or replace function fn_dashboard_resumo(p_organizacao_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org organizacoes;
  v_res jsonb;
begin
  if not is_org_member(p_organizacao_id) then
    raise exception 'Sem permissão de acesso a esta organização' using errcode = '42501';
  end if;
  select * into v_org from organizacoes where id = p_organizacao_id;

  select jsonb_build_object(
    'obras_por_status', coalesce((select jsonb_object_agg(s.status, s.n)
                                    from (select o.status, count(*) as n from obras o
                                           where o.organizacao_id = p_organizacao_id group by o.status) s), '{}'::jsonb),
    'orcamentos_total', (select count(*) from orcamentos o where o.organizacao_id = p_organizacao_id),
    'valor_orcado_total', coalesce((select sum(o.total) from orcamentos o
                                     where o.organizacao_id = p_organizacao_id and o.status <> 'arquivado'), 0),
    'valor_aprovado_total', coalesce((select sum(o.total) from orcamentos o
                                       where o.organizacao_id = p_organizacao_id and o.status = 'aprovado'), 0),
    'medido_total', coalesce((select sum(m.total) from medicoes m where m.organizacao_id = p_organizacao_id), 0),
    'ultimos_orcamentos', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'obra_nome', x.obra_nome,
                                                                        'total', x.total, 'status', x.status, 'updated_at', x.updated_at)
                                                     order by x.updated_at desc)
                                      from (select o.id, o.nome, ob.nome as obra_nome, o.total, o.status, o.updated_at
                                              from orcamentos o join obras ob on ob.id = o.obra_id
                                             where o.organizacao_id = p_organizacao_id
                                             order by o.updated_at desc limit 5) x), '[]'::jsonb),
    'data_base_mais_recente', (select jsonb_build_object('id', d.id, 'uf', d.uf, 'ano', d.ano, 'mes', d.mes,
                                                         'regime', d.regime, 'is_demo', d.is_demo)
                                 from datas_base d
                                where d.status = 'publicada' and d.uf = coalesce(v_org.uf_padrao, 'RJ')
                                order by d.is_demo, d.ano desc, d.mes desc, (d.regime = v_org.regime_padrao) desc
                                limit 1)
  ) into v_res;
  return v_res;
end $$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function fn_orcamento_explosao(uuid) from public, anon, authenticated;
revoke execute on function
  fn_curva_abc_servicos(uuid), fn_curva_abc_insumos(uuid), fn_cronograma_fisico_financeiro(uuid),
  fn_cronograma_salvar(uuid, date, cronograma_periodicidade, smallint, jsonb),
  fn_medicao_criar(uuid, date, date), fn_medicao_resumo(uuid), fn_mao_obra_resumo(uuid),
  fn_mao_obra_horas_orcamento(uuid), fn_honorario_recalcular(uuid), fn_encargos_duplicar(uuid, uuid, text),
  fn_dashboard_resumo(uuid)
  from public, anon;
grant execute on function
  fn_curva_abc_servicos(uuid), fn_curva_abc_insumos(uuid), fn_cronograma_fisico_financeiro(uuid),
  fn_cronograma_salvar(uuid, date, cronograma_periodicidade, smallint, jsonb),
  fn_medicao_criar(uuid, date, date), fn_medicao_resumo(uuid), fn_mao_obra_resumo(uuid),
  fn_mao_obra_horas_orcamento(uuid), fn_honorario_recalcular(uuid), fn_encargos_duplicar(uuid, uuid, text),
  fn_dashboard_resumo(uuid)
  to authenticated;
