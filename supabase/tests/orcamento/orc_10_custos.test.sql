-- Custos de insumo/composição (§8.2), subcomposições, ciclo, custo oficial × cotação, BDI TCU (§8.1)
select tests.orc_fixture();
select tests.orc_referencias();
select tests.login(tests.uid('editor_a'));

-- ── custo de insumo
select tests.igual(public.fn_custo_insumo(tests.ins('9004'), tests.uid('db_sp')), 120.333::numeric, 'insumo: preço da data-base sem arredondar');
select tests.igual(public.fn_custo_insumo(tests.ins('9005'), tests.uid('db_sp')), null::numeric, 'insumo: sem preço ⇒ null');

-- ── composição: Σ coef × preço arredondado no fim (calc.ts custoComposicao)
select tests.igual(public.fn_custo_composicao(tests.comp('8001'), tests.uid('db_sp')), 512.37::numeric, 'composição: 300×0,75 + 1,1×120,333 + 10×15,5 = 512,37');
select tests.igual(public.fn_custo_composicao(tests.comp('8002'), tests.uid('db_sp')), 33.90::numeric, 'composição com subcomposição (usa C(sub) já arredondado): 20 + 7,75 + 0,012×512,37 = 33,90');
select tests.igual(public.fn_custo_composicao(tests.comp('8002'), tests.uid('db_sp10')), 36.45::numeric, 'outra data-base: 22 + 8 + 0,012×537,50 = 36,45');
select tests.igual(public.fn_custo_composicao(tests.comp('8006'), tests.uid('db_sp')), (tests.get('calc:custo_comp_9_04'))::numeric, 'paridade calc.ts: 0,5×10,333 + 1,25×3,1 + 2×null = 9,04');
select tests.igual(public.fn_custo_composicao(tests.comp('8004'), tests.uid('db_sp')), null::numeric, 'composição sem nenhum preço ⇒ null');
select tests.igual(public.fn_custo_composicao(tests.comp('8003'), tests.uid('db_sp')), 50.12::numeric, 'SINAPI com custo oficial ⇒ round(oficial,2) (não o calculado 40,00)');
select tests.igual(public.fn_custo_composicao(tests.comp('8007'), tests.uid('db_sp')), 77.78::numeric, 'SINAPI só com custo oficial (sem analítico)');
select tests.igual(public.fn_custo_composicao(tests.comp('8003'), tests.uid('db_sp10')), 44.00::numeric, 'sem custo oficial na data-base ⇒ calculado (2×22)');

-- analítico de um nível
select tests.igual((select count(*) from public.fn_composicao_analitica(tests.comp('8002'), tests.uid('db_sp'))), 3::bigint, 'analítico: 3 linhas (um nível)');
select tests.igual((select custo_parcial from public.fn_composicao_analitica(tests.comp('8002'), tests.uid('db_sp')) where codigo = '8001'), 6.14844::numeric, 'analítico: subcomposição com custo_parcial = coef × C(sub) sem arredondar');
select tests.ok((select sem_preco from public.fn_composicao_analitica(tests.comp('8005'), tests.uid('db_sp')) where codigo = '9005'), 'analítico: insumo sem preço sinalizado');

-- ── ciclo: A → B → A é bloqueado; auto-referência também
select tests.logout();
insert into public.composicoes (fonte, codigo, descricao, unidade) values ('sinapi', '7001', 'CICLO A', 'UN'), ('sinapi', '7002', 'CICLO B', 'UN'), ('sinapi', '7003', 'CICLO C', 'UN');
insert into public.composicao_itens (composicao_id, tipo_item, subcomposicao_id, coeficiente) values (tests.comp('7001'), 'composicao', tests.comp('7002'), 1);
insert into public.composicao_itens (composicao_id, tipo_item, subcomposicao_id, coeficiente) values (tests.comp('7002'), 'composicao', tests.comp('7003'), 1);
select tests.lanca(format('insert into public.composicao_itens (composicao_id, tipo_item, subcomposicao_id, coeficiente) values (%L, ''composicao'', %L, 1)', tests.comp('7003'), tests.comp('7001')), 'P0001', 'ciclo A→B→C→A detectado pelo trigger');
select tests.lanca(format('insert into public.composicao_itens (composicao_id, tipo_item, subcomposicao_id, coeficiente) values (%L, ''composicao'', %L, 1)', tests.comp('7001'), tests.comp('7001')), null, 'auto-referência bloqueada');
-- ciclo que entrou por fora (trigger desativado) é detectado no cálculo
set session_replication_role = replica;
insert into public.composicao_itens (composicao_id, tipo_item, subcomposicao_id, coeficiente) values (tests.comp('7003'), 'composicao', tests.comp('7001'), 1);
set session_replication_role = origin;
select tests.login(tests.uid('editor_a'));
select tests.lanca(format('select public.fn_custo_composicao(%L, %L)', tests.comp('7001'), tests.uid('db_sp')), 'P0001', 'ciclo pré-existente: cálculo recursivo aborta com erro (sem loop infinito)');

-- profundidade > 10 bloqueada
select tests.logout();
delete from public.composicao_itens where composicao_id = tests.comp('7003');
do $$
declare k int;
begin
  for k in 1..12 loop
    insert into public.composicoes (fonte, codigo, descricao, unidade) values ('sinapi', (6000 + k)::text, 'NIVEL ' || k, 'UN');
  end loop;
  for k in 1..11 loop
    insert into public.composicao_itens (composicao_id, tipo_item, subcomposicao_id, coeficiente)
    values (tests.comp((6000 + k)::text), 'composicao', tests.comp((6000 + k + 1)::text), 1);
  end loop;
  insert into public.composicao_itens (composicao_id, tipo_item, insumo_id, coeficiente) values (tests.comp('6012'), 'insumo', tests.ins('9001'), 1);
end $$;
select tests.login(tests.uid('editor_a'));
select tests.lanca(format('select public.fn_custo_composicao(%L, %L)', tests.comp('6001'), tests.uid('db_sp')), 'P0001', 'profundidade > 10 níveis ⇒ erro');
select tests.igual(public.fn_custo_composicao(tests.comp('6003'), tests.uid('db_sp')), 20.00::numeric, '10 níveis exatos ⇒ calcula');

-- ── regras de organização nas composições próprias
select tests.executa(format($q$insert into public.composicoes (organizacao_id, fonte, codigo, descricao, unidade) values (%L, 'propria', 'P-1', 'Composição própria A', 'M2')$q$, tests.uid('org_a')), 'editor cria composição própria');
select tests.executa(format($q$insert into public.composicao_itens (composicao_id, tipo_item, insumo_id, coeficiente) select id, 'insumo', %L, 2 from public.composicoes where codigo = 'P-1'$q$, tests.ins('9001')), 'composição própria usa insumo SINAPI');
select tests.igual((select ci.organizacao_id from public.composicao_itens ci join public.composicoes c on c.id = ci.composicao_id where c.codigo = 'P-1' limit 1), tests.uid('org_a'), 'composicao_itens herda organizacao_id do pai');
select tests.lanca(format($q$insert into public.composicao_itens (composicao_id, tipo_item, subcomposicao_id, coeficiente) select %L, 'composicao', id, 1 from public.composicoes where codigo = 'P-1'$q$, tests.comp('8001')), null, 'composição SINAPI não pode usar item próprio (RLS/trigger)');
select tests.lanca($q$insert into public.composicoes (fonte, codigo, descricao, unidade) values ('sinapi', '5555', 'X', 'UN')$q$, '42501', 'editor não escreve no catálogo SINAPI');
select tests.igual((select preco from public.fn_buscar_referencias('Composição própria', tests.uid('db_sp'), tests.uid('org_a'), 'composicao', 5) where codigo = 'P-1'), 40.00::numeric, 'busca inclui próprias da org com custo calculado');
select tests.login(tests.uid('owner_b'));
select tests.ok(not exists (select 1 from public.composicoes where codigo = 'P-1'), 'outra org não vê composição própria alheia');
select tests.lanca(format('select public.fn_custo_composicao(%L, %L)', (select id from public.composicoes where codigo = 'P-1' and organizacao_id is not null), tests.uid('db_sp')), null, 'outra org não calcula composição alheia');
select tests.ok(not exists (select 1 from public.fn_buscar_referencias('Composição própria', tests.uid('db_sp'), tests.uid('org_b'), null, 5)), 'busca de outra org não traz próprias alheias');
select tests.lanca(format('select * from public.fn_buscar_referencias(''x'', %L, %L)', tests.uid('db_sp'), tests.uid('org_a')), '42501', 'busca com org alheia ⇒ 42501');
select tests.logout();

-- ── BDI TCU (coluna gerada) × calc.ts
create temp table bdi_t as select 1;
insert into public.orcamentos (organizacao_id, obra_id, nome, data_base_id) values (tests.uid('org_a'), tests.uid('obra_a'), 'BDI', tests.uid('db_sp'));
insert into public.orcamento_bdis (orcamento_id, nome, ac, s, r, g, df, l, pis, cofins, iss, cprb)
select o.id, x.nome, x.ac, x.s, x.r, x.g, x.df, x.l, x.pis, x.cofins, x.iss, x.cprb
  from public.orcamentos o, (values
    ('iss5', 4, 0.4, 1.27, 0.4, 1.23, 7.4, 0.65, 3, 5, 0),
    ('iss3', 4, 0.4, 1.27, 0.4, 1.23, 7.4, 0.65, 3, 3, 0),
    ('q1',   3, 0.4, 0.97, 0.4, 0.59, 6.16, 0.65, 3, 2.5, 0),
    ('cprb', 4, 0.4, 1.27, 0.4, 1.23, 7.4, 0.65, 3, 5, 4.5),
    ('zero', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)) x(nome, ac, s, r, g, df, l, pis, cofins, iss, cprb)
 where o.nome = 'BDI';
select tests.igual((select bdi from public.orcamento_bdis where nome = 'iss5'), 26.24::numeric(9,4), 'BDI TCU AC 4 · S+G 0,8 · R 1,27 · DF 1,23 · L 7,4 · I 8,65 = 26,24%');
select tests.igual((select bdi from public.orcamento_bdis where nome = 'iss5'), tests.get('calc:bdi_tcu_iss5')::numeric(9,4), 'BDI iss5 = calcularBdi() de calc.ts');
select tests.igual((select bdi from public.orcamento_bdis where nome = 'iss3'), tests.get('calc:bdi_tcu_iss3')::numeric(9,4), 'BDI iss3 = calc.ts (23,54)');
select tests.igual((select bdi from public.orcamento_bdis where nome = 'q1'), tests.get('calc:bdi_quartil1')::numeric(9,4), 'BDI 1º quartil = calc.ts');
select tests.igual((select bdi from public.orcamento_bdis where nome = 'cprb'), tests.get('calc:bdi_desonerado')::numeric(9,4), 'BDI com CPRB = calc.ts');
select tests.igual((select i_total from public.orcamento_bdis where nome = 'cprb'), 13.15::numeric(9,4), 'i_total = PIS+COFINS+ISS+CPRB');
select tests.igual((select bdi from public.orcamento_bdis where nome = 'zero'), 0::numeric(9,4), 'BDI zero');
select tests.lanca($q$insert into public.orcamento_bdis (orcamento_id, pis, cofins) select id, 50, 50 from public.orcamentos where nome = 'BDI'$q$, '23514', 'I ≥ 100% bloqueado (check)');
