-- Curva ABC (caso de calc.test.ts), cronograma (§8.9), medições, mão de obra (§8.6),
-- honorários (§8.7), encargos e dashboard
select tests.orc_fixture();
select tests.orc_referencias();
select tests.login(tests.uid('editor_a'));
select tests.set('orc', public.fn_orcamento_criar(tests.uid('obra_a'), 'ABC', tests.uid('db_sp'))::text);
select tests.igual((select bdi from public.orcamento_bdis where orcamento_id = tests.uid('orc')), 3.79::numeric(9,4), 'BDI nulo ⇒ zeros + PIS 0,65/COFINS 3 (3,79%)');
update public.orcamento_bdis set pis = 0, cofins = 0 where orcamento_id = tests.uid('orc');
select tests.set('e1', (select id::text from public.orcamento_etapas where orcamento_id = tests.uid('orc')));
insert into public.orcamento_etapas (orcamento_id, ordem, nome) values (tests.uid('orc'), 2, 'Estrutura');
select tests.set('e2', (select id::text from public.orcamento_etapas where nome = 'Estrutura'));
select public.fn_orcamento_adicionar_item(tests.uid('e1'), 'livre', null, 1, 'S1', null, 70);
select public.fn_orcamento_adicionar_item(tests.uid('e1'), 'livre', null, 1, 'S2', null, 15);
select public.fn_orcamento_adicionar_item(tests.uid('e2'), 'livre', null, 1, 'S3', null, 10);
select public.fn_orcamento_adicionar_item(tests.uid('e2'), 'livre', null, 2, 'S4', null, 2.5);
select public.fn_orcamento_adicionar_item(tests.uid('e2'), 'livre', null, 1, 'S5', null, 0);
select public.fn_orcamento_recalcular(tests.uid('orc'));
select tests.igual((select string_agg(classe, ',' order by posicao) from public.fn_curva_abc_servicos(tests.uid('orc'))), 'A,A,B,C', 'ABC = calc.test.ts (70/15/10/5/0 ⇒ A,A,B,C; total 0 excluído)');
select tests.igual((select total from public.orcamentos where id = tests.uid('orc')), 100::numeric(16,2), 'total 100');

-- ── cronograma
select tests.set('cron', public.fn_cronograma_salvar(tests.uid('orc'), '2026-01-31', 'mensal', 3::smallint,
  jsonb_build_array(jsonb_build_object('etapa_id', tests.uid('e1'), 'periodo', 1, 'percentual', 60),
                    jsonb_build_object('etapa_id', tests.uid('e1'), 'periodo', 2, 'percentual', 40),
                    jsonb_build_object('etapa_id', tests.uid('e2'), 'periodo', 3, 'percentual', 100),
                    jsonb_build_object('etapa_id', tests.uid('e2'), 'periodo', 7, 'percentual', 10)))::text);
select tests.igual((select count(*) from public.fn_cronograma_fisico_financeiro(tests.uid('orc'))), 6::bigint, 'cronograma: etapa × período (inclui zeros)');
select tests.igual((select jsonb_agg(jsonb_build_object('periodo', periodo, 'inicio', data_inicio, 'fim', data_fim) order by periodo)
                      from public.fn_cronograma_fisico_financeiro(tests.uid('orc')) where etapa_id = tests.uid('e1'))::text,
                   (select jsonb_agg(e)::text from jsonb_array_elements(tests.get('calc:periodos_mensal')::jsonb) e), 'períodos mensais = gerarPeriodos() (31/01 → 28/02 → 31/03)');
select tests.igual((select valor || '|' || percentual_acumulado || '|' || valor_acumulado from public.fn_cronograma_fisico_financeiro(tests.uid('orc')) where etapa_id = tests.uid('e1') and periodo = 2),
  '34.00|100.0000|85.00', 'cronograma: valor = round2(total × pct) e acumulados');
select tests.lanca(format($q$select public.fn_cronograma_salvar(%L, '2026-01-01', 'semanal', 2::smallint, %L::jsonb)$q$, tests.uid('orc'),
  jsonb_build_array(jsonb_build_object('etapa_id', tests.uid('e1'), 'periodo', 1, 'percentual', 70), jsonb_build_object('etapa_id', tests.uid('e1'), 'periodo', 2, 'percentual', 40))), 'P0001', 'cronograma: Σ% da etapa > 100 bloqueado');
select public.fn_cronograma_salvar(tests.uid('orc'), '2026-11-02', 'quinzenal', 3::smallint, '[]'::jsonb);
select tests.igual((select jsonb_agg(jsonb_build_object('periodo', periodo, 'inicio', data_inicio, 'fim', data_fim) order by periodo)
                      from public.fn_cronograma_fisico_financeiro(tests.uid('orc')) where etapa_id = tests.uid('e1'))::text,
                   (select jsonb_agg(e)::text from jsonb_array_elements(tests.get('calc:periodos_quinzenal')::jsonb) e), 'períodos quinzenais = gerarPeriodos()');

-- ── medições
select tests.lanca(format($q$select public.fn_medicao_criar(%L, '2026-01-01', '2026-01-31')$q$, tests.uid('orc')), 'P0001', 'medição exige orçamento aprovado/em revisão');
update public.orcamentos set status = 'em_revisao' where id = tests.uid('orc');
select tests.set('m1', public.fn_medicao_criar(tests.uid('orc'), '2026-01-01', '2026-01-31')::text);
select tests.set('i4', (select id::text from public.orcamento_itens where descricao = 'S4'));
insert into public.medicao_itens (medicao_id, item_id, quantidade) values (tests.uid('m1'), tests.uid('i4'), 0.5);
select tests.igual((select valor from public.medicao_itens where medicao_id = tests.uid('m1')), 1.25::numeric(16,2), 'medição: valor = round2(qtd × preço)');
select tests.igual((select total from public.medicoes where id = tests.uid('m1')), 1.25::numeric(16,2), 'medição: total');
update public.medicoes set status = 'fechada' where id = tests.uid('m1');
select tests.lanca(format('update public.medicao_itens set quantidade = 1 where medicao_id = %L', tests.uid('m1')), 'P0001', 'medição fechada: itens somente leitura');
select tests.set('m2', public.fn_medicao_criar(tests.uid('orc'), '2026-02-01', '2026-02-28')::text);
select tests.igual((select numero from public.medicoes where id = tests.uid('m2')), 2, 'medição: numeração sequencial');
select tests.lanca(format('insert into public.medicao_itens (medicao_id, item_id, quantidade) values (%L, %L, 1.6)', tests.uid('m2'), tests.uid('i4')), 'P0001', 'acumulado > orçado ⇒ "Quantidade medida excede o orçado"');
insert into public.medicao_itens (medicao_id, item_id, quantidade) values (tests.uid('m2'), tests.uid('i4'), 1.5);
select tests.ok((select quantidade_anterior = 0.5 and quantidade_atual = 1.5 and quantidade_saldo = 0 and valor_anterior = 1.25 and valor_atual = 3.75
                      and valor_acumulado = 5 and valor_saldo = 0 and percentual_acumulado = 100
                      from public.fn_medicao_resumo(tests.uid('m2')) where item_id = tests.uid('i4')), 'boletim: anterior/atual/saldo/acumulado');

-- ── mão de obra
update public.orcamentos o set encargos_sociais_id = e.id from public.encargos_sociais e where o.id = tests.uid('orc') and e.is_demo and e.regime = 'nao_desonerado';
insert into public.orcamento_equipes (orcamento_id, nome) values (tests.uid('orc'), 'Equipe 1');
insert into public.orcamento_equipe_membros (equipe_id, funcao, salario_hora, aplicar_encargos, quantidade, horas_dia, dias)
select id, 'Servente', 10, true, 2, 8, 10 from public.orcamento_equipes where nome = 'Equipe 1';
insert into public.orcamento_equipe_membros (equipe_id, funcao, insumo_id, quantidade, horas_dia, dias)
select id, 'Pedreiro', tests.ins('9001'), 1, 8, 5 from public.orcamento_equipes where nome = 'Equipe 1';
select tests.igual((select horas_totais || '|' || custo_hora || '|' || custo_total from public.fn_mao_obra_resumo(tests.uid('orc')) where funcao = 'Servente'),
  '160.00|21.3620|3417.92', 'MO: salário × (1 + encargos 113,62%) — 160 h × 21,362');
select tests.igual((select custo_total from public.fn_mao_obra_resumo(tests.uid('orc')) where funcao = 'Pedreiro'), 800.00::numeric, 'MO: com insumo usa o preço do insumo (40 h × 20)');
-- paridade calc.ts custoMembro(…, 100%)
update public.encargos_sociais set organizacao_id = organizacao_id where false;
select tests.logout();
insert into public.encargos_sociais (nome, regime, organizacao_id) values ('Cem por cento', 'nao_desonerado', tests.uid('org_a'));
insert into public.encargos_sociais_itens (encargos_sociais_id, grupo, codigo, descricao, horista, mensalista)
select id, 'A', 'A1', 'X', 100, 0 from public.encargos_sociais where nome = 'Cem por cento';
update public.orcamentos o set encargos_sociais_id = e.id from public.encargos_sociais e where o.id = tests.uid('orc') and e.nome = 'Cem por cento';
select tests.login(tests.uid('editor_a'));
select tests.igual((select jsonb_build_object('horas_totais', horas_totais, 'custo_hora', custo_hora, 'custo_total', custo_total) from public.fn_mao_obra_resumo(tests.uid('orc')) where funcao = 'Servente'),
  tests.get('calc:membro')::jsonb, 'paridade custoMembro() de calc.ts');

-- ── encargos: duplicar global para a org
select tests.set('enc', public.fn_encargos_duplicar((select id from public.encargos_sociais where is_demo and regime = 'nao_desonerado'), tests.uid('org_a'), 'Minha tabela')::text);
select tests.igual((select total_horista || '|' || organizacao_id from public.encargos_sociais where id = tests.uid('enc')), '113.6200|' || tests.get('org_a'), 'encargos duplicados para a org com totais');
select tests.igual(tests.afetadas($q$update public.encargos_sociais_itens set horista = 77.77 where encargos_sociais_id in (select id from public.encargos_sociais where organizacao_id is null)$q$), 0::bigint, 'tabela global não é editável por usuário (RLS: 0 linhas)');
select tests.ok((select count(*) from public.encargos_sociais_itens where horista = 77.77) = 0, 'tabela global intacta');
select tests.executa(format('update public.encargos_sociais_itens set horista = 77.77 where encargos_sociais_id = %L and codigo = ''A1''', tests.uid('enc')), 'cópia da org é editável');
select tests.igual((select total_horista from public.encargos_sociais where id = tests.uid('enc')), 171.3900::numeric(9,4), 'total da cópia recalculado (113,62 − 20 + 77,77)');

-- ── honorários
insert into public.honorarios (organizacao_id, obra_id, orcamento_id, nome, area_m2, desconto_percentual, impostos_percentual)
values (tests.uid('org_a'), tests.uid('obra_a'), null, 'Proposta', 120, 10, 10);
select tests.set('hon', (select id::text from public.honorarios where nome = 'Proposta'));
insert into public.honorario_disciplinas (honorario_id, disciplina, metodo, valor_m2) values (tests.uid('hon'), 'arquitetonico', 'area', 45.5);
insert into public.honorario_disciplinas (honorario_id, disciplina, metodo, valor_obra, percentual) values (tests.uid('hon'), 'estrutural', 'percentual_obra', 100000, 5);
select tests.igual((select subtotal || '|' || total from public.honorarios where id = tests.uid('hon')), '10460.00|' || tests.get('calc:honorarios_total') || '.00', 'honorários = totalHonorarios() (impostos por dentro)');
update public.honorarios set orcamento_id = tests.uid('orc') where id = tests.uid('hon');
update public.honorario_disciplinas set valor_obra = null where disciplina = 'estrutural';
select tests.igual((select valor from public.honorario_disciplinas where disciplina = 'estrutural'), 5.00::numeric(16,2), 'percentual_obra sem valor usa orcamentos.total (100 × 5%)');
select tests.igual((public.fn_honorario_recalcular(tests.uid('hon'))).subtotal, 5465.00::numeric(16,2), 'fn_honorario_recalcular');

-- ── dashboard
select tests.ok((select ((r->>'orcamentos_total')::int = 1 and (r->>'medido_total')::numeric = 5 and r->'data_base_mais_recente' is not null
                   and jsonb_array_length(r->'ultimos_orcamentos') = 1 and (r->'obras_por_status'->>'planejamento')::int = 1)
                   from (select public.fn_dashboard_resumo(tests.uid('org_a')) r) x), 'dashboard: KPIs da organização');
select tests.login(tests.uid('owner_b'));
select tests.lanca(format('select public.fn_dashboard_resumo(%L)', tests.uid('org_a')), '42501', 'dashboard de outra org ⇒ 42501');
select tests.logout();
