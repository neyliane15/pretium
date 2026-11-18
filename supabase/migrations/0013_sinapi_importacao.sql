-- =============================================================================
-- 0013 — BACKEND-2: importação SINAPI em lotes (§7.2 "Importação SINAPI", §9)
-- Lotes ≤ 2000 linhas, upsert idempotente (on conflict), erros por linha acumulados em
-- sinapi_importacoes.erros (máx. 500). Uma linha inválida nunca aborta o lote: se o upsert
-- em conjunto falhar, o lote é reprocessado linha a linha com captura de erro.
-- =============================================================================

-- ─── Utilitários internos ───────────────────────────────────────────────────
create or replace function fn_sinapi_tipo_heuristica(p_unidade text, p_descricao text) returns insumo_tipo
language sql immutable parallel safe as $$
  select case
    when upper(coalesce(p_unidade, '')) in ('CHP', 'CHI') then 'equipamento'::insumo_tipo
    when upper(coalesce(p_unidade, '')) in ('H', 'MES') and upper(coalesce(p_descricao, '')) !~ '(EQUIPAMENTO|CAMINHAO|CAMINHÃO|BETONEIRA|VIBRADOR|GUINDASTE|RETROESCAVADEIRA|ESCAVADEIRA|ROLO|COMPACTADOR|LOCACAO|LOCAÇÃO|ALUGUEL)'
      then 'mao_de_obra'::insumo_tipo
    else 'material'::insumo_tipo
  end
$$;

create or replace function fn_sinapi_tipo_insumo(p text) returns insumo_tipo
language sql immutable parallel safe as $$
  select case when lower(btrim(p)) in ('material', 'mao_de_obra', 'equipamento', 'servico', 'taxa', 'outro')
              then lower(btrim(p))::insumo_tipo end
$$;

-- Trava e devolve a importação em andamento.
create or replace function fn_sinapi_importacao_ativa(p_importacao_id uuid) returns sinapi_importacoes
language plpgsql security definer set search_path = public as $$
declare
  v sinapi_importacoes;
begin
  select * into v from sinapi_importacoes where id = p_importacao_id for update;
  if not found then
    raise exception 'Importação não encontrada.' using errcode = 'P0001';
  end if;
  if v.status not in ('pendente', 'processando') then
    raise exception 'Esta importação já foi finalizada ou cancelada.' using errcode = 'P0001';
  end if;
  return v;
end $$;

-- Registra contadores e erros de um lote (mantém no máximo 500 erros).
create or replace function fn_sinapi_registrar_lote(p_importacao_id uuid, p_total integer, p_ok integer, p_erros jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update sinapi_importacoes s
     set total_linhas = s.total_linhas + p_total,
         linhas_ok    = s.linhas_ok + p_ok,
         linhas_erro  = s.linhas_erro + coalesce(jsonb_array_length(p_erros), 0),
         status       = 'processando',
         erros = case
           when jsonb_array_length(s.erros) >= 500 or coalesce(jsonb_array_length(p_erros), 0) = 0 then s.erros
           else (select coalesce(jsonb_agg(e order by o), '[]'::jsonb)
                   from (select e, o from jsonb_array_elements(s.erros || p_erros) with ordinality t(e, o)
                          order by o limit 500) x)
         end
   where s.id = p_importacao_id;
end $$;

create or replace function fn_sinapi_validar_lote(p_linhas jsonb) returns integer
language plpgsql immutable as $$
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'Lote inválido: envie uma lista de linhas.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_linhas) > 2000 then
    raise exception 'Lote muito grande: envie no máximo 2000 linhas por chamada.' using errcode = 'P0001';
  end if;
  return jsonb_array_length(p_linhas);
end $$;

-- ─── Parsers (jsonb → linhas normalizadas + mensagem de erro) ───────────────
create or replace function fn_sinapi_parse_insumos(p_linhas jsonb)
returns table (ord bigint, linha integer, codigo text, descricao text, unidade text, preco numeric,
               origem_preco text, tipo insumo_tipo, tipo_informado boolean, classificacao text,
               erro text, bruto jsonb)
language sql immutable as $$
  select x.ord, x.linha, x.codigo, x.descricao, x.unidade, x.preco, x.origem_preco,
         coalesce(fn_sinapi_tipo_insumo(x.tipo_txt), fn_sinapi_tipo_heuristica(x.unidade, x.descricao)),
         fn_sinapi_tipo_insumo(x.tipo_txt) is not null,
         x.classificacao,
         case
           when x.codigo is null or x.codigo !~ '^\d+$' then 'Código inválido'
           when x.descricao is null then 'Descrição ausente'
           when x.unidade is null then 'Unidade ausente'
           when x.preco_bruto is null or jsonb_typeof(x.preco_bruto) = 'null'
                or (jsonb_typeof(x.preco_bruto) = 'string' and btrim(x.preco_bruto #>> '{}') = '') then 'Preço ausente'
           when x.preco is null then 'Preço inválido'
           when x.preco < 0 then 'Preço negativo'
           when x.preco >= 10000000000 then 'Preço fora do intervalo'
         end,
         x.e
    from (
      select t.o as ord, t.e,
             coalesce(fn_numero_br(t.e -> 'linha')::integer, t.o::integer) as linha,
             fn_sinapi_normalizar_codigo(t.e ->> 'codigo') as codigo,
             nullif(btrim(t.e ->> 'descricao'), '') as descricao,
             nullif(upper(btrim(t.e ->> 'unidade')), '') as unidade,
             t.e -> 'preco' as preco_bruto,
             fn_numero_br(t.e -> 'preco') as preco,
             nullif(upper(btrim(t.e ->> 'origem_preco')), '') as origem_preco,
             t.e ->> 'tipo' as tipo_txt,
             nullif(btrim(t.e ->> 'classificacao'), '') as classificacao
        from jsonb_array_elements(p_linhas) with ordinality t(e, o)
    ) x
$$;

create or replace function fn_sinapi_parse_composicoes(p_linhas jsonb)
returns table (ord bigint, linha integer, codigo text, descricao text, unidade text, grupo text,
               custo numeric, custo_mao_obra numeric, custo_material numeric, custo_equipamento numeric,
               custo_servicos numeric, perc_mao_obra numeric, erro text, bruto jsonb)
language sql immutable as $$
  select x.ord, x.linha, x.codigo, x.descricao, x.unidade, x.grupo, x.custo,
         x.cmo, x.cmat, x.ceq, x.cserv, x.pmo,
         case
           when x.codigo is null or x.codigo !~ '^\d+$' then 'Código inválido'
           when x.descricao is null then 'Descrição ausente'
           when x.unidade is null then 'Unidade ausente'
           when x.custo_bruto is null or jsonb_typeof(x.custo_bruto) = 'null'
                or (jsonb_typeof(x.custo_bruto) = 'string' and btrim(x.custo_bruto #>> '{}') = '') then 'Custo ausente'
           when x.custo is null then 'Custo inválido'
           when x.custo < 0 then 'Custo negativo'
           when x.custo >= 10000000000 then 'Custo fora do intervalo'
           when x.pmo is not null and (x.pmo < 0 or x.pmo > 100000) then 'Percentual de mão de obra inválido'
         end,
         x.e
    from (
      select t.o as ord, t.e,
             coalesce(fn_numero_br(t.e -> 'linha')::integer, t.o::integer) as linha,
             fn_sinapi_normalizar_codigo(t.e ->> 'codigo') as codigo,
             nullif(btrim(t.e ->> 'descricao'), '') as descricao,
             nullif(upper(btrim(t.e ->> 'unidade')), '') as unidade,
             nullif(btrim(t.e ->> 'grupo'), '') as grupo,
             t.e -> 'custo' as custo_bruto,
             fn_numero_br(t.e -> 'custo') as custo,
             fn_numero_br(t.e -> 'custo_mao_obra') as cmo,
             fn_numero_br(t.e -> 'custo_material') as cmat,
             fn_numero_br(t.e -> 'custo_equipamento') as ceq,
             fn_numero_br(t.e -> 'custo_servicos') as cserv,
             fn_numero_br(t.e -> 'perc_mao_obra') as pmo
        from jsonb_array_elements(p_linhas) with ordinality t(e, o)
    ) x
$$;

create or replace function fn_sinapi_parse_composicao_itens(p_linhas jsonb)
returns table (ord bigint, linha integer, composicao_codigo text, tipo_item composicao_item_tipo,
               item_codigo text, coeficiente numeric, descricao text, unidade text, erro text, bruto jsonb)
language sql immutable as $$
  select x.ord, x.linha, x.cc,
         case x.tipo_txt when 'INSUMO' then 'insumo'::composicao_item_tipo
                         when 'COMPOSICAO' then 'composicao'::composicao_item_tipo end,
         x.ic, x.coef, x.descricao, x.unidade,
         case
           when x.cc is null or x.cc !~ '^\d+$' then 'Código da composição inválido'
           when x.tipo_txt is null or x.tipo_txt not in ('INSUMO', 'COMPOSICAO') then 'Tipo de item inválido (use INSUMO ou COMPOSICAO)'
           when x.ic is null or x.ic !~ '^\d+$' then 'Código do item inválido'
           when x.tipo_txt = 'COMPOSICAO' and x.ic = x.cc then 'Composição não pode conter a si mesma'
           when x.coef is null then 'Coeficiente ausente ou inválido'
           when x.coef <= 0 then 'Coeficiente deve ser maior que zero'
           when x.coef >= 100000000000 then 'Coeficiente fora do intervalo'
         end,
         x.e
    from (
      select t.o as ord, t.e,
             coalesce(fn_numero_br(t.e -> 'linha')::integer, t.o::integer) as linha,
             fn_sinapi_normalizar_codigo(t.e ->> 'composicao_codigo') as cc,
             translate(upper(btrim(t.e ->> 'tipo_item')), 'ÇÃ', 'CA') as tipo_txt,
             fn_sinapi_normalizar_codigo(t.e ->> 'item_codigo') as ic,
             round(fn_numero_br(t.e -> 'coeficiente'), 7) as coef,
             nullif(btrim(t.e ->> 'descricao'), '') as descricao,
             nullif(upper(btrim(t.e ->> 'unidade')), '') as unidade
        from jsonb_array_elements(p_linhas) with ordinality t(e, o)
    ) x
$$;

-- ─── Upserts em conjunto (chamados com o lote inteiro ou com uma linha só) ──
create or replace function fn_sinapi_upsert_insumos(p_importacao_id uuid, p_data_base_id uuid, p_linhas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  with v as (
    select distinct on (p.codigo) p.*
      from fn_sinapi_parse_insumos(p_linhas) p
     where p.erro is null
     order by p.codigo, p.ord desc
  ), up as (
    insert into insumos as i (fonte, codigo, descricao, unidade, tipo, classificacao, is_demo, ativo)
    select 'sinapi', v.codigo, v.descricao, v.unidade, v.tipo, v.classificacao, false, true from v
    on conflict (codigo) where organizacao_id is null do update
       set descricao = excluded.descricao,
           unidade = excluded.unidade,
           classificacao = coalesce(excluded.classificacao, i.classificacao),
           is_demo = false,
           ativo = true
    returning i.id, i.codigo
  )
  insert into insumo_precos as ip (data_base_id, insumo_id, preco, origem_preco, importacao_id)
  select p_data_base_id, up.id, v.preco, v.origem_preco, p_importacao_id
    from up join v on v.codigo = up.codigo
  on conflict (data_base_id, insumo_id) do update
     set preco = excluded.preco, origem_preco = excluded.origem_preco, importacao_id = excluded.importacao_id;
  get diagnostics v_n = row_count;

  -- tipo só é sobrescrito quando informado na linha (senão mantém o atual/heurístico)
  update insumos i set tipo = v.tipo
    from (select distinct on (p.codigo) p.codigo, p.tipo, p.tipo_informado
            from fn_sinapi_parse_insumos(p_linhas) p
           where p.erro is null order by p.codigo, p.ord desc) v
   where v.tipo_informado and i.organizacao_id is null and i.codigo = v.codigo and i.tipo is distinct from v.tipo;
  return v_n;
end $$;

create or replace function fn_sinapi_upsert_composicoes(p_importacao_id uuid, p_data_base_id uuid, p_linhas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  with v as (
    select distinct on (p.codigo) p.*
      from fn_sinapi_parse_composicoes(p_linhas) p
     where p.erro is null
     order by p.codigo, p.ord desc
  ), up as (
    insert into composicoes as c (fonte, codigo, descricao, unidade, grupo, is_demo, ativo)
    select 'sinapi', v.codigo, v.descricao, v.unidade, v.grupo, false, true from v
    on conflict (codigo) where organizacao_id is null do update
       set descricao = excluded.descricao,
           unidade = excluded.unidade,
           grupo = coalesce(excluded.grupo, c.grupo),
           is_demo = false,
           ativo = true
    returning c.id, c.codigo
  )
  insert into composicao_precos as cp (data_base_id, composicao_id, custo, custo_mao_obra, custo_material,
                                        custo_equipamento, custo_servicos, perc_mao_obra, importacao_id)
  select p_data_base_id, up.id, v.custo, v.custo_mao_obra, v.custo_material, v.custo_equipamento,
         v.custo_servicos, v.perc_mao_obra, p_importacao_id
    from up join v on v.codigo = up.codigo
  on conflict (data_base_id, composicao_id) do update
     set custo = excluded.custo, custo_mao_obra = excluded.custo_mao_obra,
         custo_material = excluded.custo_material, custo_equipamento = excluded.custo_equipamento,
         custo_servicos = excluded.custo_servicos, perc_mao_obra = excluded.perc_mao_obra,
         importacao_id = excluded.importacao_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function fn_sinapi_upsert_composicao_itens(p_importacao_id uuid, p_linhas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  -- esqueletos: composições-pai
  insert into composicoes (fonte, codigo, descricao, unidade, is_demo)
  select distinct 'sinapi'::fonte_referencia, p.composicao_codigo,
         'COMPOSIÇÃO ' || p.composicao_codigo || ' (sem descrição)', 'UN', false
    from fn_sinapi_parse_composicao_itens(p_linhas) p
   where p.erro is null
  on conflict (codigo) where organizacao_id is null do nothing;

  -- esqueletos: insumos e subcomposições referenciados (descrição/unidade da linha)
  insert into insumos (fonte, codigo, descricao, unidade, tipo, is_demo)
  select distinct on (p.item_codigo) 'sinapi'::fonte_referencia, p.item_codigo,
         coalesce(p.descricao, 'INSUMO ' || p.item_codigo || ' (sem descrição)'),
         coalesce(p.unidade, 'UN'), fn_sinapi_tipo_heuristica(p.unidade, p.descricao), false
    from fn_sinapi_parse_composicao_itens(p_linhas) p
   where p.erro is null and p.tipo_item = 'insumo'
   order by p.item_codigo, p.ord desc
  on conflict (codigo) where organizacao_id is null do nothing;

  insert into composicoes (fonte, codigo, descricao, unidade, is_demo)
  select distinct on (p.item_codigo) 'sinapi'::fonte_referencia, p.item_codigo,
         coalesce(p.descricao, 'COMPOSIÇÃO ' || p.item_codigo || ' (sem descrição)'),
         coalesce(p.unidade, 'UN'), false
    from fn_sinapi_parse_composicao_itens(p_linhas) p
   where p.erro is null and p.tipo_item = 'composicao'
   order by p.item_codigo, p.ord desc
  on conflict (codigo) where organizacao_id is null do nothing;

  -- completa esqueletos antigos quando a linha traz descrição
  update composicoes c set descricao = p.descricao, unidade = coalesce(p.unidade, c.unidade)
    from (select distinct on (item_codigo) item_codigo, descricao, unidade
            from fn_sinapi_parse_composicao_itens(p_linhas)
           where erro is null and tipo_item = 'composicao' and descricao is not null
           order by item_codigo, ord desc) p
   where c.organizacao_id is null and c.codigo = p.item_codigo and c.descricao like '% (sem descrição)';
  update insumos i set descricao = p.descricao, unidade = coalesce(p.unidade, i.unidade)
    from (select distinct on (item_codigo) item_codigo, descricao, unidade
            from fn_sinapi_parse_composicao_itens(p_linhas)
           where erro is null and tipo_item = 'insumo' and descricao is not null
           order by item_codigo, ord desc) p
   where i.organizacao_id is null and i.codigo = p.item_codigo and i.descricao like '% (sem descrição)';

  with v as (
    select distinct on (p.composicao_codigo, p.tipo_item, p.item_codigo) p.*
      from fn_sinapi_parse_composicao_itens(p_linhas) p
     where p.erro is null
     order by p.composicao_codigo, p.tipo_item, p.item_codigo, p.ord desc
  )
  insert into composicao_itens as ci (composicao_id, tipo_item, insumo_id, subcomposicao_id, coeficiente, ordem, importacao_id)
  select c.id, v.tipo_item,
         case when v.tipo_item = 'insumo' then i.id end,
         case when v.tipo_item = 'composicao' then s.id end,
         v.coeficiente, v.linha, p_importacao_id
    from v
    join composicoes c on c.organizacao_id is null and c.codigo = v.composicao_codigo
    left join insumos i on v.tipo_item = 'insumo' and i.organizacao_id is null and i.codigo = v.item_codigo
    left join composicoes s on v.tipo_item = 'composicao' and s.organizacao_id is null and s.codigo = v.item_codigo
  on conflict (composicao_id, tipo_item, (coalesce(insumo_id, subcomposicao_id))) do update
     set coeficiente = excluded.coeficiente, ordem = excluded.ordem, importacao_id = excluded.importacao_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ─── Executor genérico: tenta o lote; se falhar, linha a linha ──────────────
create or replace function fn_sinapi_processar_lote(p_tipo text, p_importacao_id uuid, p_linhas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_imp    sinapi_importacoes;
  v_total  integer;
  v_erros  jsonb;
  v_validas jsonb;
  v_ok     integer := 0;
  r        record;
begin
  perform assert_admin();
  v_total := fn_sinapi_validar_lote(p_linhas);
  v_imp := fn_sinapi_importacao_ativa(p_importacao_id);

  if p_tipo = 'insumos' then
    select coalesce(jsonb_agg(jsonb_build_object('linha', linha, 'codigo', codigo, 'mensagem', erro) order by ord) filter (where erro is not null), '[]'),
           coalesce(jsonb_agg(bruto order by ord) filter (where erro is null), '[]')
      into v_erros, v_validas from fn_sinapi_parse_insumos(p_linhas);
  elsif p_tipo = 'composicoes' then
    select coalesce(jsonb_agg(jsonb_build_object('linha', linha, 'codigo', codigo, 'mensagem', erro) order by ord) filter (where erro is not null), '[]'),
           coalesce(jsonb_agg(bruto order by ord) filter (where erro is null), '[]')
      into v_erros, v_validas from fn_sinapi_parse_composicoes(p_linhas);
  else
    select coalesce(jsonb_agg(jsonb_build_object('linha', linha, 'codigo', composicao_codigo, 'mensagem', erro) order by ord) filter (where erro is not null), '[]'),
           coalesce(jsonb_agg(bruto order by ord) filter (where erro is null), '[]')
      into v_erros, v_validas from fn_sinapi_parse_composicao_itens(p_linhas);
  end if;

  if jsonb_array_length(v_validas) > 0 then
    begin
      if p_tipo = 'insumos' then perform fn_sinapi_upsert_insumos(p_importacao_id, v_imp.data_base_id, v_validas);
      elsif p_tipo = 'composicoes' then perform fn_sinapi_upsert_composicoes(p_importacao_id, v_imp.data_base_id, v_validas);
      else perform fn_sinapi_upsert_composicao_itens(p_importacao_id, v_validas);
      end if;
      v_ok := jsonb_array_length(v_validas);
    exception when others then
      -- reprocessa linha a linha para isolar a(s) linha(s) problemática(s)
      v_ok := 0;
      for r in select e, o from jsonb_array_elements(v_validas) with ordinality t(e, o) loop
        begin
          if p_tipo = 'insumos' then perform fn_sinapi_upsert_insumos(p_importacao_id, v_imp.data_base_id, jsonb_build_array(r.e));
          elsif p_tipo = 'composicoes' then perform fn_sinapi_upsert_composicoes(p_importacao_id, v_imp.data_base_id, jsonb_build_array(r.e));
          else perform fn_sinapi_upsert_composicao_itens(p_importacao_id, jsonb_build_array(r.e));
          end if;
          v_ok := v_ok + 1;
        exception when others then
          v_erros := v_erros || jsonb_build_array(jsonb_build_object(
            'linha', coalesce(fn_numero_br(r.e -> 'linha')::integer, r.o::integer),
            'codigo', coalesce(r.e ->> 'codigo', r.e ->> 'composicao_codigo'),
            'mensagem', sqlerrm));
        end;
      end loop;
    end;
  end if;

  perform fn_sinapi_registrar_lote(p_importacao_id, v_total, v_ok, v_erros);
  return v_ok;
end $$;

-- ─── RPCs públicas ───────────────────────────────────────────────────────────
create or replace function fn_sinapi_iniciar_importacao(
  p_uf char(2), p_ano integer, p_mes integer, p_regime regime_desoneracao,
  p_tipo importacao_tipo, p_arquivo_nome text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uf  text := upper(btrim(p_uf));
  v_db  uuid;
  v_id  uuid;
begin
  perform assert_admin();
  if v_uf is null or v_uf !~ '^[A-Z]{2}$' then
    raise exception 'UF inválida.' using errcode = 'P0001';
  end if;
  if p_ano is null or p_ano not between 2000 and 2100 then
    raise exception 'Ano inválido.' using errcode = 'P0001';
  end if;
  if p_mes is null or p_mes not between 1 and 12 then
    raise exception 'Mês inválido.' using errcode = 'P0001';
  end if;
  if p_regime is null or p_tipo is null then
    raise exception 'Informe o regime e o tipo de planilha.' using errcode = 'P0001';
  end if;

  insert into datas_base (uf, ano, mes, regime, is_demo, status, descricao, fonte_arquivo)
  values (v_uf, p_ano, p_mes, p_regime, false, 'rascunho',
          format('SINAPI %s %s/%s – %s', v_uf, lpad(p_mes::text, 2, '0'), p_ano,
                 case p_regime when 'desonerado' then 'Desonerado' else 'Não desonerado' end),
          p_arquivo_nome)
  on conflict (uf, ano, mes, regime, is_demo) do update
     set fonte_arquivo = case
           when excluded.fonte_arquivo is null then datas_base.fonte_arquivo
           when datas_base.fonte_arquivo is null then excluded.fonte_arquivo
           when position(excluded.fonte_arquivo in datas_base.fonte_arquivo) > 0 then datas_base.fonte_arquivo
           else datas_base.fonte_arquivo || '; ' || excluded.fonte_arquivo end
  returning id into v_db;

  insert into sinapi_importacoes (data_base_id, tipo, status, arquivo_nome)
  values (v_db, p_tipo, 'processando', p_arquivo_nome)
  returning id into v_id;
  return v_id;
end $$;

create or replace function fn_sinapi_importar_insumos(p_importacao_id uuid, p_linhas jsonb) returns integer
language sql security definer set search_path = public as $$
  select fn_sinapi_processar_lote('insumos', p_importacao_id, p_linhas)
$$;

create or replace function fn_sinapi_importar_composicoes(p_importacao_id uuid, p_linhas jsonb) returns integer
language sql security definer set search_path = public as $$
  select fn_sinapi_processar_lote('composicoes', p_importacao_id, p_linhas)
$$;

create or replace function fn_sinapi_importar_composicao_itens(p_importacao_id uuid, p_linhas jsonb) returns integer
language sql security definer set search_path = public as $$
  select fn_sinapi_processar_lote('composicao_itens', p_importacao_id, p_linhas)
$$;

create or replace function fn_sinapi_finalizar_importacao(p_importacao_id uuid, p_publicar boolean default false)
returns sinapi_importacoes
language plpgsql security definer set search_path = public as $$
declare
  v sinapi_importacoes;
  v_removidos integer := 0;
begin
  perform assert_admin();
  v := fn_sinapi_importacao_ativa(p_importacao_id);

  if v.tipo = 'analitico' then
    -- composições SINAPI tocadas nesta importação: remove itens que não vieram nela
    delete from composicao_itens ci
     where ci.composicao_id in (select distinct x.composicao_id from composicao_itens x where x.importacao_id = v.id)
       and ci.importacao_id is distinct from v.id
       and ci.organizacao_id is null;
    get diagnostics v_removidos = row_count;
  end if;

  update sinapi_importacoes
     set status = case when linhas_ok = 0 and linhas_erro > 0 then 'erro'::importacao_status else 'concluida'::importacao_status end,
         finalizado_em = now()
   where id = v.id
  returning * into v;

  if coalesce(p_publicar, false) and v.status = 'concluida' then
    update datas_base set status = 'publicada', publicada_em = now() where id = v.data_base_id;
  end if;

  perform registrar_auditoria('importar_sinapi', 'sinapi_importacoes', v.id::text,
    jsonb_build_object('data_base_id', v.data_base_id, 'tipo', v.tipo, 'status', v.status,
                       'total_linhas', v.total_linhas, 'linhas_ok', v.linhas_ok, 'linhas_erro', v.linhas_erro,
                       'itens_removidos', v_removidos, 'publicada', coalesce(p_publicar, false)),
    null);
  return v;
end $$;

create or replace function fn_sinapi_cancelar_importacao(p_importacao_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  perform fn_sinapi_importacao_ativa(p_importacao_id);
  update sinapi_importacoes set status = 'cancelada', finalizado_em = now() where id = p_importacao_id;
end $$;

create or replace function fn_sinapi_publicar_data_base(p_data_base_id uuid, p_status data_base_status)
returns datas_base
language plpgsql security definer set search_path = public as $$
declare
  v datas_base;
begin
  perform assert_admin();
  if p_status is null then
    raise exception 'Informe o status.' using errcode = 'P0001';
  end if;
  update datas_base
     set status = p_status,
         publicada_em = case when p_status = 'publicada' then coalesce(publicada_em, now()) else publicada_em end
   where id = p_data_base_id
  returning * into v;
  if not found then
    raise exception 'Data-base não encontrada.' using errcode = 'P0001';
  end if;
  perform registrar_auditoria('publicar_data_base', 'datas_base', v.id::text,
    jsonb_build_object('status', p_status, 'uf', v.uf, 'ano', v.ano, 'mes', v.mes, 'regime', v.regime), null);
  return v;
end $$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function
  fn_sinapi_importacao_ativa(uuid), fn_sinapi_registrar_lote(uuid, integer, integer, jsonb),
  fn_sinapi_upsert_insumos(uuid, uuid, jsonb), fn_sinapi_upsert_composicoes(uuid, uuid, jsonb),
  fn_sinapi_upsert_composicao_itens(uuid, jsonb), fn_sinapi_processar_lote(text, uuid, jsonb)
  from public, anon, authenticated;

revoke execute on function
  fn_sinapi_iniciar_importacao(char, integer, integer, regime_desoneracao, importacao_tipo, text),
  fn_sinapi_importar_insumos(uuid, jsonb), fn_sinapi_importar_composicoes(uuid, jsonb),
  fn_sinapi_importar_composicao_itens(uuid, jsonb), fn_sinapi_finalizar_importacao(uuid, boolean),
  fn_sinapi_cancelar_importacao(uuid), fn_sinapi_publicar_data_base(uuid, data_base_status)
  from public, anon;
grant execute on function
  fn_sinapi_iniciar_importacao(char, integer, integer, regime_desoneracao, importacao_tipo, text),
  fn_sinapi_importar_insumos(uuid, jsonb), fn_sinapi_importar_composicoes(uuid, jsonb),
  fn_sinapi_importar_composicao_itens(uuid, jsonb), fn_sinapi_finalizar_importacao(uuid, boolean),
  fn_sinapi_cancelar_importacao(uuid), fn_sinapi_publicar_data_base(uuid, data_base_status)
  to authenticated;
