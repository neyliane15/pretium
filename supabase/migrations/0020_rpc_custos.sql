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
