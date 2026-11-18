-- RLS e permissões: isolamento entre organizações, viewer somente leitura, pending/anon sem acesso
select tests.orc_fixture();
select tests.orc_referencias();
select tests.login(tests.uid('editor_a'));
select tests.set('orc', public.fn_orcamento_criar(tests.uid('obra_a'), 'Orçamento A', tests.uid('db_sp'))::text);
select tests.set('e1', (select id::text from public.orcamento_etapas where orcamento_id = tests.uid('orc')));
select tests.set('item', (public.fn_orcamento_adicionar_item(tests.uid('e1'), 'composicao', tests.comp('8002'), 10)).id::text);
insert into public.insumos (organizacao_id, fonte, codigo, descricao, unidade, preco_proprio) values (tests.uid('org_a'), 'propria', 'MEU-1', 'Insumo próprio A', 'UN', 10);
insert into public.composicoes (organizacao_id, fonte, codigo, descricao, unidade) values (tests.uid('org_a'), 'propria', 'MC-1', 'Composição própria A', 'UN');
insert into public.composicao_itens (composicao_id, tipo_item, insumo_id, coeficiente)
select c.id, 'insumo', i.id, 3 from public.composicoes c, public.insumos i where c.codigo = 'MC-1' and i.codigo = 'MEU-1';
select public.fn_orcamento_adicionar_item(tests.uid('e1'), 'composicao', (select id from public.composicoes where codigo = 'MC-1'), 1);
select tests.igual((select custo_unitario from public.orcamento_itens where referencia_codigo = 'MC-1'), 30.00::numeric(14,2), 'composição própria com insumo de preço próprio (3 × 10)');
insert into public.orcamento_insumo_precos (orcamento_id, insumo_id, preco) values (tests.uid('orc'), tests.ins('9001'), 21);
insert into public.orcamento_item_memorias (item_id, expressao, resultado) values (tests.uid('item'), '10', 10);

select tests.set('meu1', (select id::text from public.insumos where codigo = 'MEU-1'));
-- ── outra organização (owner_b)
select tests.login(tests.uid('owner_b'));
select tests.igual(tests.conta('select 1 from public.orcamentos'), 0::bigint, 'org B não lê orçamentos da org A');
select tests.igual(tests.conta('select 1 from public.orcamento_itens'), 0::bigint, 'org B não lê itens da org A');
select tests.igual(tests.conta('select 1 from public.orcamento_etapas'), 0::bigint, 'org B não lê etapas da org A');
select tests.igual(tests.conta('select 1 from public.orcamento_bdis'), 0::bigint, 'org B não lê BDIs da org A');
select tests.igual(tests.conta('select 1 from public.orcamento_insumo_precos'), 0::bigint, 'org B não lê cotações da org A');
select tests.igual(tests.conta('select 1 from public.orcamento_item_memorias'), 0::bigint, 'org B não lê memórias da org A');
select tests.igual(tests.conta($q$select 1 from public.insumos where organizacao_id is not null$q$), 0::bigint, 'org B não lê insumos próprios da org A');
select tests.igual(tests.afetadas(format('update public.orcamentos set nome = ''x'' where id = %L', tests.uid('orc'))), 0::bigint, 'org B não altera orçamento alheio');
select tests.igual(tests.afetadas(format('delete from public.orcamento_itens where orcamento_id = %L', tests.uid('orc'))), 0::bigint, 'org B não exclui itens alheios');
select tests.lanca(format($q$insert into public.orcamento_etapas (orcamento_id, nome) values (%L, 'invasão')$q$, tests.uid('orc')), '42501', 'org B não insere etapa em orçamento alheio');
select tests.lanca(format('select public.fn_orcamento_recalcular(%L)', tests.uid('orc')), '42501', 'org B: recalcular orçamento alheio ⇒ 42501');
select tests.lanca(format('select * from public.fn_orcamento_resumo(%L)', tests.uid('orc')), '42501', 'org B: resumo alheio ⇒ 42501');
select tests.lanca(format('select * from public.fn_curva_abc_insumos(%L)', tests.uid('orc')), '42501', 'org B: curva ABC alheia ⇒ 42501');
select tests.lanca(format('select public.fn_orcamento_duplicar(%L)', tests.uid('orc')), '42501', 'org B: duplicar orçamento alheio ⇒ 42501');
select tests.lanca(format($q$select public.fn_orcamento_criar(%L, 'x', %L)$q$, tests.uid('obra_a'), tests.uid('db_sp')), '42501', 'org B: criar orçamento em obra alheia ⇒ 42501');
select tests.lanca(format($q$insert into public.orcamentos (organizacao_id, obra_id, nome, data_base_id) values (%L, %L, 'x', %L)$q$, tests.uid('org_b'), tests.uid('obra_a'), tests.uid('db_sp')), 'P0001', 'org B: orçamento com obra alheia (organização divergente) bloqueado');
-- org B não usa insumo próprio da org A
select tests.set('orc_b', public.fn_orcamento_criar(tests.uid('obra_b'), 'Orçamento B', tests.uid('db_sp'))::text);
select tests.lanca(format($q$select public.fn_orcamento_adicionar_item((select id from public.orcamento_etapas where orcamento_id = %L), 'insumo', %L, 1)$q$,
  tests.uid('orc_b'), tests.uid('meu1')), 'P0001', 'org B não usa insumo próprio da org A');
select tests.lanca(format($q$insert into public.orcamento_insumo_precos (orcamento_id, insumo_id, preco) values (%L, %L, 1)$q$, tests.uid('orc_b'), tests.uid('meu1')), 'P0001', 'org B não cota insumo próprio da org A');

-- ── viewer da org A
select tests.login(tests.uid('viewer_a'));
select tests.igual(tests.conta('select 1 from public.orcamentos'), 1::bigint, 'viewer lê orçamento da sua org');
select tests.igual(tests.conta('select 1 from public.orcamento_itens'), 2::bigint, 'viewer lê itens');
select tests.ok((select count(*) from public.fn_orcamento_resumo(tests.uid('orc'))) = 1, 'viewer: resumo sintético');
select tests.ok((select count(*) from public.fn_curva_abc_servicos(tests.uid('orc'))) = 2, 'viewer: curva ABC');
select tests.igual(tests.afetadas(format('update public.orcamentos set nome = ''x'' where id = %L', tests.uid('orc'))), 0::bigint, 'viewer não altera orçamento');
select tests.igual(tests.afetadas(format('update public.orcamento_itens set quantidade = 99 where orcamento_id = %L', tests.uid('orc'))), 0::bigint, 'viewer não altera itens');
select tests.igual(tests.afetadas(format('delete from public.orcamento_etapas where orcamento_id = %L', tests.uid('orc'))), 0::bigint, 'viewer não exclui etapas');
select tests.lanca(format($q$insert into public.orcamento_etapas (orcamento_id, nome) values (%L, 'x')$q$, tests.uid('orc')), '42501', 'viewer não insere etapa');
select tests.lanca(format('select public.fn_orcamento_recalcular(%L)', tests.uid('orc')), '42501', 'viewer: recalcular ⇒ 42501');
select tests.lanca(format($q$select public.fn_orcamento_adicionar_item(%L, 'livre', null, 1, 'x')$q$, tests.uid('e1')), '42501', 'viewer: adicionar item ⇒ 42501');
select tests.lanca(format('select public.fn_orcamento_renumerar(%L)', tests.uid('orc')), '42501', 'viewer: renumerar ⇒ 42501');
select tests.lanca($q$insert into public.insumos (organizacao_id, fonte, codigo, descricao, unidade) select organizacao_id, 'propria', 'V', 'v', 'UN' from public.orcamentos limit 1$q$, '42501', 'viewer não cria insumo próprio');

-- ── editor: catálogo SINAPI e importações
select tests.login(tests.uid('editor_a'));
select tests.lanca(format('insert into public.insumo_precos (data_base_id, insumo_id, preco) values (%L, %L, 1)', tests.uid('db_sp'), tests.ins('9005')), '42501', 'editor não grava preço SINAPI');
select tests.igual(tests.afetadas($q$update public.insumos set descricao = 'x' where organizacao_id is null$q$), 0::bigint, 'editor não altera insumo SINAPI');
select tests.igual(tests.conta('select 1 from public.sinapi_importacoes'), 0::bigint, 'editor não vê importações');
select tests.lanca($q$select public.fn_sinapi_iniciar_importacao('RJ', 2026, 9, 'nao_desonerado', 'insumos')$q$, '42501', 'editor não importa SINAPI');
select tests.ok(tests.conta('select 1 from public.insumos where organizacao_id is null') > 0, 'usuário ativo lê catálogo SINAPI');

-- datas-base em rascunho: invisíveis a usuários, visíveis ao admin
select tests.logout();
insert into public.datas_base (uf, ano, mes, regime, status) values ('SP', 2027, 1, 'nao_desonerado', 'rascunho');
select tests.login(tests.uid('editor_a'));
select tests.igual(tests.conta($q$select 1 from public.datas_base where status = 'rascunho'$q$), 0::bigint, 'usuário não vê data-base em rascunho');
select tests.lanca(format($q$select public.fn_orcamento_trocar_data_base(%L, (select id from public.datas_base where ano = 2027 limit 1))$q$, tests.uid('orc')), null, 'usuário não usa data-base em rascunho');
select tests.login(tests.uid('admin'));
select tests.igual(tests.conta($q$select 1 from public.datas_base where status = 'rascunho'$q$), 1::bigint, 'admin vê data-base em rascunho');
select tests.ok(tests.conta('select 1 from public.orcamentos') = 2, 'admin vê orçamentos de todas as orgs');
-- data-base arquivada continua visível para quem a usa
select tests.logout();
update public.datas_base set status = 'arquivada' where id = tests.uid('db_sp');
select tests.login(tests.uid('viewer_a'));
select tests.igual(tests.conta(format('select 1 from public.datas_base where id = %L', tests.uid('db_sp'))), 1::bigint, 'data-base arquivada visível para a org que a usa');
select tests.login(tests.uid('editor_a'));
select tests.ok((public.fn_orcamento_recalcular(tests.uid('orc'))).total > 0, 'orçamento com data-base arquivada ainda recalcula');
select tests.logout();
update public.datas_base set status = 'publicada' where id = tests.uid('db_sp');

-- ── pending e anon
select tests.login(tests.uid('pendente'));
select tests.igual(tests.conta('select 1 from public.insumos'), 0::bigint, 'pending não lê insumos');
select tests.igual(tests.conta('select 1 from public.datas_base'), 0::bigint, 'pending não lê datas-base');
select tests.igual(tests.conta('select 1 from public.encargos_sociais'), 0::bigint, 'pending não lê encargos');
select tests.lanca(format('select public.fn_custo_insumo(%L, %L)', tests.ins('9001'), tests.uid('db_sp')), '42501', 'pending: fn_custo_insumo ⇒ 42501');
select tests.lanca(format('select * from public.fn_buscar_referencias(''areia'', %L)', tests.uid('db_sp')), '42501', 'pending: busca ⇒ 42501');
select tests.set('ins9001', tests.ins('9001')::text);
select tests.login_anon();
select tests.lanca('select 1 from public.orcamentos', '42501', 'anon: sem privilégio em orcamentos');
select tests.lanca('select 1 from public.insumos', '42501', 'anon: sem privilégio em insumos');
select tests.lanca(format('select public.fn_custo_insumo(%L, %L)', tests.uid('ins9001'), tests.uid('db_sp')), '42501', 'anon: sem execute nas RPCs');

-- ── organização bloqueada ⇒ somente leitura
select tests.logout();
update public.organizacoes set status = 'bloqueada' where id = tests.uid('org_a');
select tests.login(tests.uid('editor_a'));
select tests.igual(tests.conta('select 1 from public.orcamentos'), 1::bigint, 'org bloqueada: leitura mantida');
select tests.lanca(format('select public.fn_orcamento_recalcular(%L)', tests.uid('orc')), '42501', 'org bloqueada: sem edição');
select tests.logout();
update public.organizacoes set status = 'ativa' where id = tests.uid('org_a');

-- ── exclusão da organização em cascata (itens referenciam composição própria)
select tests.executa(format('delete from public.organizacoes where id = %L', tests.uid('org_a')), 'excluir organização remove orçamentos e referências próprias em cascata');
select tests.igual((select count(*) from public.orcamento_itens i where i.organizacao_id = tests.uid('org_a')), 0::bigint, 'cascata completa');
