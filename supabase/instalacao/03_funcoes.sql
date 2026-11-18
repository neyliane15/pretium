-- PRETIUM — Instalação pelo SQL Editor do Supabase
-- PARTE 3 de 3 — funções de cálculo, curva ABC, importação e segurança final
-- Gerado a partir de supabase/migrations. Rode as partes NA ORDEM, cada uma uma única vez.

-- ===== 0020_rpc_custos.sql =====
-- =============================================================================
-- 0020 — BACKEND-2: custos de insumos/composições (§8.2), analítico e busca
-- Motor: fn_custos_composicoes(ids[], data_base, orcamento) — calcula em conjunto, de baixo
-- para cima (folhas primeiro), com proteção de ciclo/profundidade (máx. 10 níveis) e cache
-- em memória (jsonb) por chamada; sem tabelas temporárias (funciona em transação read-only).
-- =============================================================================

-- Permissões de leitura usadas pelas RPCs security definer
create or replace function fn_orc_assert_ler_orcamento(p_orcamento_id uuid) returns orcamentos
language plpgsql stable security definer set search_path = public as $$
declare
  v orcamentos;
begin
  select * into v from orcamentos where id = p_orcamento_id;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0001';
  end if;
  if not is_org_member(v.organizacao_id) then
    raise exception 'Sem permissão de acesso a este orçamento' using errcode = '42501';
  end if;
  return v;
end $$;

create or replace function fn_orc_assert_editar_orcamento(p_orcamento_id uuid) returns orcamentos
language plpgsql security definer set search_path = public as $$
declare
  v orcamentos;
begin
  v := fn_orc_assert_ler_orcamento(p_orcamento_id);
  perform assert_pode_editar(v.organizacao_id);
  return v;
end $$;

-- ─── Preço de insumo (§8.2): cotação → data-base → preço próprio → null ─────
create or replace function fn_preco_insumo_interno(p_insumo_id uuid, p_data_base_id uuid, p_orcamento_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select q.preco from orcamento_insumo_precos q where q.orcamento_id = p_orcamento_id and q.insumo_id = p_insumo_id),
    (select ip.preco from insumo_precos ip where ip.data_base_id = p_data_base_id and ip.insumo_id = p_insumo_id),
    (select i.preco_proprio from insumos i where i.id = p_insumo_id and i.fonte = 'propria')
  )
$$;

-- ─── Motor de custo de composições ──────────────────────────────────────────
-- Retorna, para cada composição alcançada a partir de p_ids (inclusive subcomposições):
--   custo      numeric(…,2) ou null (nenhum componente com preço)
--   sem_preco  algum componente (recursivo) sem preço
--   cotado     a árvore contém insumo com cotação do orçamento
--   oficial    usou o custo publicado (composicao_precos)
create or replace function fn_custos_composicoes(p_ids uuid[], p_data_base_id uuid, p_orcamento_id uuid default null)
returns table (composicao_id uuid, custo numeric, sem_preco boolean, cotado boolean, oficial boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_tem_cot  boolean;
  v_map      jsonb := '{}'::jsonb;
  v_pend     uuid[];
  v_prontos  uuid[];
  v_novos    jsonb;
  v_iter     integer := 0;
  v_prof     integer;
  v_ciclo    uuid;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;
  v_tem_cot := p_orcamento_id is not null
               and exists (select 1 from orcamento_insumo_precos q where q.orcamento_id = p_orcamento_id);

  -- fecho transitivo (para descer só onde necessário: sem cotação, custo oficial encerra o ramo)
  with recursive arv(id, prof, caminho, ciclo) as (
    select x.id, 1, array[x.id], false from (select distinct unnest(p_ids) as id) x
    union all
    select ci.subcomposicao_id, a.prof + 1, a.caminho || ci.subcomposicao_id, ci.subcomposicao_id = any (a.caminho)
      from arv a
      join composicao_itens ci on ci.composicao_id = a.id and ci.tipo_item = 'composicao'
     where not a.ciclo and a.prof <= 10
       and (v_tem_cot or not exists (select 1 from composicoes c join composicao_precos cp
                                       on cp.composicao_id = c.id and cp.data_base_id = p_data_base_id
                                      where c.id = a.id and c.fonte = 'sinapi'))
  )
  select max(prof), (array_agg(id) filter (where ciclo))[1], array_agg(distinct id) filter (where not ciclo)
    into v_prof, v_ciclo, v_pend from arv;

  if v_ciclo is not null then
    raise exception 'Ciclo detectado na estrutura da composição (código %).',
      (select c.codigo from composicoes c where c.id = v_ciclo) using errcode = 'P0001';
  end if;
  if v_prof > 10 then
    raise exception 'A composição excede 10 níveis de subcomposições.' using errcode = 'P0001';
  end if;

  loop
    v_iter := v_iter + 1;
    exit when v_pend is null or cardinality(v_pend) = 0 or v_iter > 12;

    -- prontas: custo oficial direto (sem cotação no orçamento) ou todas as subcomposições já calculadas
    select array_agg(p.id) into v_prontos
      from unnest(v_pend) p(id)
      join composicoes c on c.id = p.id
     where (not v_tem_cot and c.fonte = 'sinapi'
            and exists (select 1 from composicao_precos cp where cp.composicao_id = c.id and cp.data_base_id = p_data_base_id))
        or not exists (select 1 from composicao_itens ci
                        where ci.composicao_id = p.id and ci.tipo_item = 'composicao'
                          and not (v_map ? ci.subcomposicao_id::text));
    exit when v_prontos is null;

    select jsonb_object_agg(r.id::text, jsonb_build_object('c', r.custo, 's', r.sem, 'q', r.cot, 'o', r.ofi))
      into v_novos
      from (
        select c.id,
               case when c.fonte = 'sinapi' and cp.custo is not null and not coalesce(agg.cot, false) then round(cp.custo, 2)
                    when coalesce(agg.algum, false) then round(agg.soma, 2)
                    else null end as custo,
               case when c.fonte = 'sinapi' and cp.custo is not null and not coalesce(agg.cot, false) then false
                    else coalesce(agg.falta, true) end as sem,
               coalesce(agg.cot, false) as cot,
               (c.fonte = 'sinapi' and cp.custo is not null and not coalesce(agg.cot, false)) as ofi
          from unnest(v_prontos) p(id)
          join composicoes c on c.id = p.id
          left join composicao_precos cp on cp.composicao_id = c.id and cp.data_base_id = p_data_base_id
          left join lateral (
            select sum(ci.coeficiente * x.preco) as soma,
                   bool_or(x.preco is not null) as algum,
                   bool_or(x.preco is null or x.sub_sem) as falta,
                   bool_or(x.cot) as cot
              from composicao_itens ci
              cross join lateral (
                select
                  case when ci.tipo_item = 'insumo' then
                         coalesce(q.preco, ip.preco, case when i.fonte = 'propria' then i.preco_proprio end)
                       else (v_map -> ci.subcomposicao_id::text ->> 'c')::numeric end as preco,
                  case when ci.tipo_item = 'insumo' then q.preco is not null
                       else coalesce((v_map -> ci.subcomposicao_id::text ->> 'q')::boolean, false) end as cot,
                  case when ci.tipo_item = 'insumo' then false
                       else coalesce((v_map -> ci.subcomposicao_id::text ->> 's')::boolean, true) end as sub_sem
                  from (select 1) um
                  left join insumos i on i.id = ci.insumo_id
                  left join orcamento_insumo_precos q on q.orcamento_id = p_orcamento_id and q.insumo_id = ci.insumo_id
                  left join insumo_precos ip on ip.data_base_id = p_data_base_id and ip.insumo_id = ci.insumo_id
              ) x
             where ci.composicao_id = c.id
               -- com custo oficial e sem cotação os itens não importam (ramo não foi expandido)
               and (v_tem_cot or cp.custo is null or c.fonte <> 'sinapi')
          ) agg on true
      ) r;

    v_map := v_map || coalesce(v_novos, '{}'::jsonb);
    select array_agg(p.id) into v_pend from unnest(v_pend) p(id) where p.id <> all (v_prontos);
  end loop;

  return query
    select k::uuid, (v ->> 'c')::numeric, (v ->> 's')::boolean, (v ->> 'q')::boolean, (v ->> 'o')::boolean
      from jsonb_each(v_map) e(k, v);
end $$;

-- ─── RPC: fn_custo_insumo ────────────────────────────────────────────────────
create or replace function fn_custo_insumo(p_insumo_id uuid, p_data_base_id uuid, p_orcamento_id uuid default null)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid;
  v_achou boolean;
begin
  if not is_active_user() then
    raise exception 'Usuário sem acesso.' using errcode = '42501';
  end if;
  select true, i.organizacao_id into v_achou, v_org from insumos i where i.id = p_insumo_id;
  if v_achou is null then
    raise exception 'Insumo não encontrado.' using errcode = 'P0001';
  end if;
  if v_org is not null and not is_org_member(v_org) then
    raise exception 'Sem permissão de acesso a este insumo' using errcode = '42501';
  end if;
  if p_orcamento_id is not null then
    perform fn_orc_assert_ler_orcamento(p_orcamento_id);
  end if;
  return fn_preco_insumo_interno(p_insumo_id, p_data_base_id, p_orcamento_id);
end $$;

-- ─── RPC: fn_custo_composicao ────────────────────────────────────────────────
create or replace function fn_custo_composicao(p_composicao_id uuid, p_data_base_id uuid, p_orcamento_id uuid default null)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid;
  v_achou boolean;
begin
  if not is_active_user() then
    raise exception 'Usuário sem acesso.' using errcode = '42501';
  end if;
  select true, c.organizacao_id into v_achou, v_org from composicoes c where c.id = p_composicao_id;
  if v_achou is null then
    raise exception 'Composição não encontrada.' using errcode = 'P0001';
  end if;
  if v_org is not null and not is_org_member(v_org) then
    raise exception 'Sem permissão de acesso a esta composição' using errcode = '42501';
  end if;
  if p_orcamento_id is not null then
    perform fn_orc_assert_ler_orcamento(p_orcamento_id);
  end if;
  return (select f.custo from fn_custos_composicoes(array[p_composicao_id], p_data_base_id, p_orcamento_id) f
           where f.composicao_id = p_composicao_id);
end $$;

-- ─── RPC: fn_composicao_analitica (um nível) ────────────────────────────────
create or replace function fn_composicao_analitica(p_composicao_id uuid, p_data_base_id uuid, p_orcamento_id uuid default null)
returns table (item_id uuid, tipo_item composicao_item_tipo, referencia_id uuid, fonte fonte_referencia, codigo text,
               descricao text, unidade text, insumo_tipo insumo_tipo, coeficiente numeric, preco_unitario numeric,
               custo_parcial numeric, sem_preco boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_org uuid;
  v_achou boolean;
  v_subs uuid[];
begin
  if not is_active_user() then
    raise exception 'Usuário sem acesso.' using errcode = '42501';
  end if;
  select true, c.organizacao_id into v_achou, v_org from composicoes c where c.id = p_composicao_id;
  if v_achou is null then
    raise exception 'Composição não encontrada.' using errcode = 'P0001';
  end if;
  if v_org is not null and not is_org_member(v_org) then
    raise exception 'Sem permissão de acesso a esta composição' using errcode = '42501';
  end if;
  if p_orcamento_id is not null then
    perform fn_orc_assert_ler_orcamento(p_orcamento_id);
  end if;

  select array_agg(ci.subcomposicao_id) into v_subs
    from composicao_itens ci where ci.composicao_id = p_composicao_id and ci.tipo_item = 'composicao';

  return query
  with subc as (
    select f.composicao_id, f.custo, f.sem_preco from fn_custos_composicoes(coalesce(v_subs, '{}'), p_data_base_id, p_orcamento_id) f
  )
  select ci.id, ci.tipo_item,
         coalesce(ci.insumo_id, ci.subcomposicao_id),
         coalesce(i.fonte, s.fonte),
         coalesce(i.codigo, s.codigo),
         coalesce(i.descricao, s.descricao),
         coalesce(i.unidade, s.unidade),
         i.tipo,
         ci.coeficiente,
         x.preco,
         ci.coeficiente * x.preco,
         case when ci.tipo_item = 'insumo' then x.preco is null else (x.preco is null or coalesce(sc.sem_preco, true)) end
    from composicao_itens ci
    left join insumos i on i.id = ci.insumo_id
    left join composicoes s on s.id = ci.subcomposicao_id
    left join subc sc on sc.composicao_id = ci.subcomposicao_id
    cross join lateral (
      select case when ci.tipo_item = 'insumo' then fn_preco_insumo_interno(ci.insumo_id, p_data_base_id, p_orcamento_id)
                  else sc.custo end as preco
    ) x
   where ci.composicao_id = p_composicao_id
   order by ci.ordem, coalesce(i.codigo, s.codigo), ci.id;
end $$;

-- ─── RPC: fn_buscar_referencias ──────────────────────────────────────────────
create or replace function fn_buscar_referencias(
  p_termo text, p_data_base_id uuid, p_organizacao_id uuid default null, p_tipo text default null, p_limite integer default 50
) returns table (tipo text, id uuid, fonte fonte_referencia, codigo text, descricao text, unidade text,
                 insumo_tipo insumo_tipo, preco numeric, is_demo boolean, rank real)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_termo  text := btrim(coalesce(p_termo, ''));
  v_num    boolean;
  v_q      tsquery;
  v_like   text;
  v_lim    integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_org    uuid := p_organizacao_id;
begin
  if not is_active_user() then
    raise exception 'Usuário sem acesso.' using errcode = '42501';
  end if;
  if p_tipo is not null and p_tipo not in ('insumo', 'composicao') then
    raise exception 'Tipo de referência inválido.' using errcode = 'P0001';
  end if;
  if v_org is not null and not is_org_member(v_org) then
    raise exception 'Sem permissão de acesso a esta organização' using errcode = '42501';
  end if;

  v_num := v_termo ~ '^\d+$';
  if v_num then
    v_termo := coalesce(fn_sinapi_normalizar_codigo(v_termo), v_termo);
  end if;
  if not v_num and v_termo <> '' then
    v_q := websearch_to_tsquery('portuguese', f_unaccent(v_termo));
  end if;
  v_like := '%' || replace(replace(replace(f_unaccent(v_termo), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  with cand as (
    -- insumos
    select 'insumo'::text as tipo, i.id, i.fonte, i.codigo, i.descricao, i.unidade, i.tipo as insumo_tipo,
           coalesce(ip.preco, case when i.fonte = 'propria' then i.preco_proprio end) as preco,
           i.is_demo,
           (case
              when v_termo = '' then 0
              when v_num and i.codigo = v_termo then 10
              when v_num and i.codigo like v_termo || '%' then 5
              when v_num then 0
              else coalesce(ts_rank(i.busca, v_q), 0)
                   + case when f_unaccent(i.descricao) ilike f_unaccent(v_termo) || '%' then 1.0
                          when f_unaccent(i.descricao) ilike v_like then 0.5 else 0 end
            end)::real as rank
      from insumos i
      left join insumo_precos ip on ip.insumo_id = i.id and ip.data_base_id = p_data_base_id
     where (p_tipo is null or p_tipo = 'insumo')
       and i.ativo
       and ((i.organizacao_id is null and ip.preco is not null) or (v_org is not null and i.organizacao_id = v_org))
       and (v_termo = ''
            or (v_num and (i.codigo like v_termo || '%' or i.descricao ilike '%' || v_termo || '%'))
            or (not v_num and (i.busca @@ v_q or f_unaccent(i.descricao) ilike v_like)))
    union all
    -- composições
    select 'composicao', c.id, c.fonte, c.codigo, c.descricao, c.unidade, null::insumo_tipo,
           round(cp.custo, 2),
           c.is_demo,
           (case
              when v_termo = '' then 0
              when v_num and c.codigo = v_termo then 10
              when v_num and c.codigo like v_termo || '%' then 5
              when v_num then 0
              else coalesce(ts_rank(c.busca, v_q), 0)
                   + case when f_unaccent(c.descricao) ilike f_unaccent(v_termo) || '%' then 1.0
                          when f_unaccent(c.descricao) ilike v_like then 0.5 else 0 end
            end)::real
      from composicoes c
      left join composicao_precos cp on cp.composicao_id = c.id and cp.data_base_id = p_data_base_id
     where (p_tipo is null or p_tipo = 'composicao')
       and c.ativo
       and ((c.organizacao_id is null and cp.custo is not null) or (v_org is not null and c.organizacao_id = v_org))
       and (v_termo = ''
            or (v_num and (c.codigo like v_termo || '%' or c.descricao ilike '%' || v_termo || '%'))
            or (not v_num and (c.busca @@ v_q or f_unaccent(c.descricao) ilike v_like)))
  ), top as (
    select * from cand
     order by cand.rank desc, fn_codigo_ordem(cand.codigo) nulls last, cand.codigo, cand.id
     limit v_lim
  ), custos_proprios as (
    select f.composicao_id, f.custo
      from fn_custos_composicoes(
             (select coalesce(array_agg(t.id), '{}') from top t where t.tipo = 'composicao' and t.fonte = 'propria'),
             p_data_base_id, null) f
  )
  select t.tipo, t.id, t.fonte, t.codigo, t.descricao, t.unidade, t.insumo_tipo,
         case when t.tipo = 'composicao' and t.fonte = 'propria' then cpp.custo else t.preco end,
         t.is_demo, t.rank
    from top t
    left join custos_proprios cpp on cpp.composicao_id = t.id
   order by t.rank desc, fn_codigo_ordem(t.codigo) nulls last, t.codigo, t.id;
end $$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function fn_orc_assert_ler_orcamento(uuid), fn_orc_assert_editar_orcamento(uuid),
  fn_preco_insumo_interno(uuid, uuid, uuid), fn_custos_composicoes(uuid[], uuid, uuid)
  from public, anon, authenticated;
revoke execute on function fn_custo_insumo(uuid, uuid, uuid), fn_custo_composicao(uuid, uuid, uuid),
  fn_composicao_analitica(uuid, uuid, uuid), fn_buscar_referencias(text, uuid, uuid, text, integer)
  from public, anon;
grant execute on function fn_custo_insumo(uuid, uuid, uuid), fn_custo_composicao(uuid, uuid, uuid),
  fn_composicao_analitica(uuid, uuid, uuid), fn_buscar_referencias(text, uuid, uuid, text, integer)
  to authenticated;

-- ===== 0021_rpc_orcamento.sql =====
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

-- ===== 0022_rpc_abc_cronograma_medicao.sql =====
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

-- ===== 0030_composicao_propria_salvar.sql =====
-- =============================================================================
-- 0030 — TESTES: RPC atômica para salvar composição própria (cabeçalho + itens)
-- Proposta do FRONTEND-2 (CONTRATO_ALTERACOES, 2026-11-18, item 4). Substitui a sequência
-- update/insert do cabeçalho + delete + insert dos itens feita pelo front em 3 requisições
-- (não atômica: uma falha no insert deixava a composição sem itens).
--
-- fn_composicao_propria_salvar(p_id uuid, p_cabecalho jsonb, p_itens jsonb) returns uuid
--   p_id        null ⇒ cria; senão atualiza a composição própria p_id.
--   p_cabecalho {codigo, descricao, unidade, grupo?, observacao?, ativo?, organizacao_id (obrigatório ao criar)}
--   p_itens     [{tipo_item: 'insumo'|'composicao', referencia_id | insumo_id | subcomposicao_id, coeficiente}]
--               (ordem = posição no array; a lista SUBSTITUI os itens atuais)
-- SECURITY INVOKER: a RLS de composicoes/composicao_itens continua valendo; a checagem explícita
-- (assert_pode_editar) só dá mensagens melhores. Tudo numa transação: qualquer erro desfaz tudo.
-- =============================================================================

create or replace function public.fn_composicao_propria_salvar(p_id uuid, p_cabecalho jsonb, p_itens jsonb default '[]'::jsonb)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id    uuid := p_id;
  v_org   uuid;
  v_item  jsonb;
  v_tipo  composicao_item_tipo;
  v_ref   uuid;
  v_coef  numeric;
  v_ordem integer := 0;
begin
  if p_cabecalho is null or jsonb_typeof(p_cabecalho) <> 'object' then
    raise exception 'Cabeçalho da composição inválido.' using errcode = '22023';
  end if;
  if p_itens is not null and jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Itens da composição devem ser uma lista.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_cabecalho->>'codigo'), '') = '' or coalesce(btrim(p_cabecalho->>'descricao'), '') = ''
     or coalesce(btrim(p_cabecalho->>'unidade'), '') = '' then
    raise exception 'Informe código, descrição e unidade da composição.' using errcode = 'P0001';
  end if;

  if v_id is null then
    v_org := try_uuid(p_cabecalho->>'organizacao_id');
    if v_org is null then
      raise exception 'Organização da composição não informada.' using errcode = 'P0001';
    end if;
    perform assert_pode_editar(v_org);
    insert into composicoes (organizacao_id, fonte, codigo, descricao, unidade, grupo, observacao, ativo)
    values (v_org, 'propria', btrim(p_cabecalho->>'codigo'), btrim(p_cabecalho->>'descricao'),
            upper(btrim(p_cabecalho->>'unidade')), nullif(btrim(p_cabecalho->>'grupo'), ''),
            nullif(btrim(p_cabecalho->>'observacao'), ''), coalesce((p_cabecalho->>'ativo')::boolean, true))
    returning id into v_id;
  else
    select organizacao_id into v_org from composicoes where id = v_id;
    if not found then
      raise exception 'Composição não encontrada.' using errcode = 'P0001';
    end if;
    if v_org is null then
      raise exception 'Composições SINAPI não podem ser editadas.' using errcode = '42501';
    end if;
    perform assert_pode_editar(v_org);
    update composicoes
       set codigo = btrim(p_cabecalho->>'codigo'),
           descricao = btrim(p_cabecalho->>'descricao'),
           unidade = upper(btrim(p_cabecalho->>'unidade')),
           grupo = nullif(btrim(p_cabecalho->>'grupo'), ''),
           observacao = nullif(btrim(p_cabecalho->>'observacao'), ''),
           ativo = coalesce((p_cabecalho->>'ativo')::boolean, ativo)
     where id = v_id;
    if not found then
      raise exception 'Sem permissão para editar esta composição.' using errcode = '42501';
    end if;
    delete from composicao_itens where composicao_id = v_id;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_ordem := v_ordem + 1;
    begin
      v_tipo := (v_item->>'tipo_item')::composicao_item_tipo;
    exception when invalid_text_representation then
      raise exception 'Item %: tipo inválido (use insumo ou composicao).', v_ordem using errcode = 'P0001';
    end;
    v_ref := try_uuid(coalesce(v_item->>'referencia_id',
                               case when v_tipo = 'insumo' then v_item->>'insumo_id' else v_item->>'subcomposicao_id' end));
    if v_ref is null then
      raise exception 'Item %: referência não informada.', v_ordem using errcode = 'P0001';
    end if;
    v_coef := (v_item->>'coeficiente')::numeric;
    if v_coef is null or v_coef <= 0 then
      raise exception 'Item %: coeficiente deve ser maior que zero.', v_ordem using errcode = 'P0001';
    end if;
    insert into composicao_itens (composicao_id, tipo_item, insumo_id, subcomposicao_id, coeficiente, ordem)
    values (v_id, v_tipo,
            case when v_tipo = 'insumo' then v_ref end,
            case when v_tipo = 'composicao' then v_ref end,
            v_coef, v_ordem);
  end loop;

  return v_id;
end $$;

revoke all on function public.fn_composicao_propria_salvar(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.fn_composicao_propria_salvar(uuid, jsonb, jsonb) to authenticated, service_role;

comment on function public.fn_composicao_propria_salvar(uuid, jsonb, jsonb) is
  'Cria/atualiza composição própria e substitui seus itens numa única transação (TESTES, 0030).';

-- ===== 0031_endurecimento_seguranca.sql =====
-- ============================================================================
-- 0031 — Endurecimento de segurança (REVISÃO FINAL)
--
-- 1. search_path das funções do schema public:
--    * As funções de B2 (0010–0022) foram criadas com `set search_path = public`. Nessa forma o
--      schema temporária da sessão (pg_temp) é pesquisado ANTES de public para tabelas, o que em
--      tese permitiria a uma sessão com acesso SQL direto "sombrear" uma tabela dentro de uma
--      função SECURITY DEFINER. Fixamos `public, pg_temp` (pg_temp por último, recomendação da
--      documentação do PostgreSQL para SECURITY DEFINER).
--    * Funções puras sem search_path (alerta `function_search_path_mutable` do Supabase advisor)
--      recebem o mesmo valor fixo.
--    As funções de B1 (search_path = '') não são tocadas.
-- 2. EXECUTE: o Supabase concede EXECUTE a `anon` em toda função nova. Nenhuma RPC do Pretium é
--    usada sem login, então revogamos de anon/public todas as funções do schema public e
--    mudamos o privilégio padrão para as próximas migrações.
-- 3. CREATE no schema public continua negado a anon/authenticated (0001); reforçado aqui.
-- ============================================================================

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind in ('f', 'p')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and (p.proconfig is null or 'search_path=public' = any (p.proconfig))
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.assinatura);
  end loop;
end $$;

-- Revoga de anon/PUBLIC preservando exatamente o acesso atual de authenticated e service_role
-- (em bancos sem os privilégios padrão do Supabase, como o PGlite dos testes, ele vem de PUBLIC).
do $$
declare
  r record;
  v_auth boolean;
  v_svc boolean;
  v_tem_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
  v_tem_svc boolean := exists (select 1 from pg_roles where rolname = 'service_role');
  v_tem_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
begin
  for r in
    select p.oid, p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    v_auth := v_tem_auth and has_function_privilege('authenticated', r.oid, 'EXECUTE');
    v_svc := v_tem_svc and has_function_privilege('service_role', r.oid, 'EXECUTE');
    execute format('revoke execute on function %s from public', r.assinatura);
    if v_tem_anon then
      execute format('revoke execute on function %s from anon', r.assinatura);
    end if;
    if v_auth then
      execute format('grant execute on function %s to authenticated', r.assinatura);
    end if;
    if v_svc then
      execute format('grant execute on function %s to service_role', r.assinatura);
    end if;
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'alter default privileges in schema public revoke execute on functions from anon';
    execute 'revoke create on schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke create on schema public from authenticated';
  end if;
  execute 'alter default privileges in schema public revoke execute on functions from public';
end $$;

