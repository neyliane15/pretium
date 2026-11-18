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
