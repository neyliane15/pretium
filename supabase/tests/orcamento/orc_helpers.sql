-- ============================================================================
-- Fixtures dos testes do BACKEND-2. Carregado depois de core_helpers.sql (schema tests.*).
-- Usuários: admin, owner_a, editor_a, viewer_a (org A), owner_b (org B), pendente.
-- Referências de teste na UF 'SP' (não colidem com o seed demo RJ).
-- ============================================================================

create function tests.orc_fixture() returns void language plpgsql as $$
declare
  v_admin uuid; v_oa uuid; v_ea uuid; v_va uuid; v_ob uuid; v_pend uuid;
  v_org_a uuid; v_org_b uuid;
begin
  perform tests.logout();
  v_admin := tests.novo_usuario('admin', 'admin@teste.dev');
  v_oa := tests.novo_usuario('owner_a', 'owner.a@teste.dev');
  v_ea := tests.novo_usuario('editor_a', 'editor.a@teste.dev');
  v_va := tests.novo_usuario('viewer_a', 'viewer.a@teste.dev');
  v_ob := tests.novo_usuario('owner_b', 'owner.b@teste.dev');
  v_pend := tests.novo_usuario('pendente', 'pendente@teste.dev');
  update public.profiles set papel_global = 'admin', status = 'active' where id = v_admin;
  update public.profiles set papel_global = 'user', status = 'active' where id in (v_oa, v_ea, v_va, v_ob);
  update public.profiles set papel_global = 'user', status = 'pending' where id = v_pend;

  insert into public.organizacoes (nome) values ('Escritório A') returning id into v_org_a;
  insert into public.organizacoes (nome) values ('Escritório B') returning id into v_org_b;
  perform tests.set('org_a', v_org_a::text);
  perform tests.set('org_b', v_org_b::text);
  insert into public.organizacao_membros (organizacao_id, user_id, papel) values
    (v_org_a, v_oa, 'owner'), (v_org_a, v_ea, 'editor'), (v_org_a, v_va, 'viewer'), (v_org_b, v_ob, 'owner');

  insert into public.obras (organizacao_id, nome) values (v_org_a, 'Residência Teste A') returning id into v_admin;
  perform tests.set('obra_a', v_admin::text);
  insert into public.obras (organizacao_id, nome) values (v_org_b, 'Loja Teste B') returning id into v_admin;
  perform tests.set('obra_b', v_admin::text);
end $$;

-- Conjunto de referências SINAPI de teste (UF SP, oficial, publicada)
create function tests.orc_referencias() returns void language plpgsql as $$
declare
  v_db uuid;
  v_i uuid;
begin
  perform tests.logout();
  insert into public.datas_base (uf, ano, mes, regime, status, descricao)
  values ('SP', 2026, 9, 'nao_desonerado', 'publicada', 'teste SP') returning id into v_db;
  perform tests.set('db_sp', v_db::text);
  insert into public.datas_base (uf, ano, mes, regime, status, descricao)
  values ('SP', 2026, 10, 'nao_desonerado', 'publicada', 'teste SP 10') returning id into v_db;
  perform tests.set('db_sp10', v_db::text);

  insert into public.insumos (fonte, codigo, descricao, unidade, tipo) values
    ('sinapi', '9001', 'PEDREIRO TESTE', 'H', 'mao_de_obra'),
    ('sinapi', '9002', 'SERVENTE TESTE', 'H', 'mao_de_obra'),
    ('sinapi', '9003', 'CIMENTO TESTE', 'KG', 'material'),
    ('sinapi', '9004', 'AREIA TESTE', 'M3', 'material'),
    ('sinapi', '9005', 'INSUMO SEM PRECO', 'UN', 'material'),
    ('sinapi', '9010', 'INSUMO A 10,333', 'UN', 'material'),
    ('sinapi', '9011', 'INSUMO B 3,1', 'UN', 'material'),
    ('sinapi', '9012', 'INSUMO C SEM PRECO', 'UN', 'material');
  insert into public.insumo_precos (data_base_id, insumo_id, preco)
  select tests.uid('db_sp'), i.id, p.preco
    from (values ('9001', 20.00), ('9002', 15.50), ('9003', 0.75), ('9004', 120.333), ('9010', 10.333), ('9011', 3.1)) p(cod, preco)
    join public.insumos i on i.codigo = p.cod and i.organizacao_id is null;
  -- data-base 10: preços diferentes
  insert into public.insumo_precos (data_base_id, insumo_id, preco)
  select tests.uid('db_sp10'), i.id, p.preco
    from (values ('9001', 22.00), ('9002', 16.00), ('9003', 0.80), ('9004', 125.00)) p(cod, preco)
    join public.insumos i on i.codigo = p.cod and i.organizacao_id is null;

  insert into public.composicoes (fonte, codigo, descricao, unidade) values
    ('sinapi', '8001', 'ARGAMASSA TESTE', 'M3'),
    ('sinapi', '8002', 'ALVENARIA TESTE', 'M2'),
    ('sinapi', '8003', 'SERVICO COM CUSTO OFICIAL', 'M2'),
    ('sinapi', '8004', 'SERVICO SEM PRECO', 'UN'),
    ('sinapi', '8005', 'SERVICO PARCIAL', 'UN'),
    ('sinapi', '8006', 'PARIDADE CALC 9,04', 'UN'),
    ('sinapi', '8007', 'SO CUSTO OFICIAL SEM ANALITICO', 'UN');
  insert into public.composicao_itens (composicao_id, tipo_item, insumo_id, subcomposicao_id, coeficiente, ordem)
  select c.id, x.tipo::public.composicao_item_tipo,
         (select id from public.insumos where codigo = x.item and organizacao_id is null and x.tipo = 'insumo'),
         (select id from public.composicoes where codigo = x.item and organizacao_id is null and x.tipo = 'composicao'),
         x.coef, x.ordem
    from (values
      ('8001', 'insumo', '9003', 300, 1), ('8001', 'insumo', '9004', 1.1, 2), ('8001', 'insumo', '9002', 10, 3),
      ('8002', 'insumo', '9001', 1.0, 1), ('8002', 'insumo', '9002', 0.5, 2), ('8002', 'composicao', '8001', 0.012, 3),
      ('8003', 'insumo', '9001', 2, 1),
      ('8004', 'insumo', '9005', 1, 1),
      ('8005', 'insumo', '9001', 1, 1), ('8005', 'insumo', '9005', 1, 2),
      ('8006', 'insumo', '9010', 0.5, 1), ('8006', 'insumo', '9011', 1.25, 2), ('8006', 'insumo', '9012', 2, 3)
    ) x(comp, tipo, item, coef, ordem)
    join public.composicoes c on c.codigo = x.comp and c.organizacao_id is null;
  insert into public.composicao_precos (data_base_id, composicao_id, custo)
  select tests.uid('db_sp'), c.id, x.custo
    from (values ('8003', 50.1234), ('8007', 77.777)) x(cod, custo)
    join public.composicoes c on c.codigo = x.cod and c.organizacao_id is null;
end $$;

create function tests.ins(p_codigo text) returns uuid language sql stable as $$
  select id from public.insumos where codigo = p_codigo and organizacao_id is null $$;
create function tests.comp(p_codigo text) returns uuid language sql stable as $$
  select id from public.composicoes where codigo = p_codigo and organizacao_id is null $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
