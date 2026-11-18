-- Orçamento: criação, itens, trigger de cálculo (§8.3), totais com subetapas, EAP (§8.9),
-- cotação × custo oficial, memória de cálculo, bloqueio por status, duplicar, trocar data-base, mover, ABC
select tests.orc_fixture();
select tests.orc_referencias();
select tests.login(tests.uid('editor_a'));

select tests.set('orc', public.fn_orcamento_criar(tests.uid('obra_a'), 'Orçamento teste', tests.uid('db_sp'),
  '{"ac":4,"s":0.4,"r":1.27,"g":0.4,"df":1.23,"l":7.4,"pis":0.65,"cofins":3,"iss":3,"cprb":0}'::jsonb)::text);
select tests.igual((select bdi from public.orcamento_bdis where orcamento_id = tests.uid('orc') and is_padrao), 23.54::numeric(9,4), 'criar: BDI padrão 23,54%');
select tests.igual((select string_agg(codigo || ' ' || nome, ',') from public.orcamento_etapas where orcamento_id = tests.uid('orc')), '1 Serviços preliminares', 'criar: etapa "1 – Serviços preliminares"');
select tests.igual((select organizacao_id from public.orcamentos where id = tests.uid('orc')), tests.uid('org_a'), 'criar: organização herdada da obra');

select tests.set('e1', (select id::text from public.orcamento_etapas where orcamento_id = tests.uid('orc')));
insert into public.orcamento_etapas (orcamento_id, ordem, nome) values (tests.uid('orc'), 2, 'Alvenaria');
select tests.set('e2', (select id::text from public.orcamento_etapas where orcamento_id = tests.uid('orc') and nome = 'Alvenaria'));
insert into public.orcamento_etapas (orcamento_id, parent_id, ordem, nome) values (tests.uid('orc'), tests.uid('e2'), 1, 'Paredes internas');
select tests.set('e21', (select id::text from public.orcamento_etapas where nome = 'Paredes internas'));

select tests.set('i_placa', (public.fn_orcamento_adicionar_item(tests.uid('e1'), 'livre', null, 1, 'Placa de obra', 'un', 500)).id::text);
select tests.set('i_sem', (public.fn_orcamento_adicionar_item(tests.uid('e1'), 'insumo', tests.ins('9005'), 3)).id::text);
select tests.set('i_alv', (public.fn_orcamento_adicionar_item(tests.uid('e2'), 'composicao', tests.comp('8002'), 100)).id::text);
select tests.set('i_arg', (public.fn_orcamento_adicionar_item(tests.uid('e21'), 'composicao', tests.comp('8001'), 2.5)).id::text);
select tests.set('i_ofi', (public.fn_orcamento_adicionar_item(tests.uid('e1'), 'composicao', tests.comp('8003'), 1)).id::text);

select tests.igual((select custo_unitario || '|' || preco_unitario || '|' || total_sem_bdi || '|' || total || '|' || fonte || '|' || referencia_codigo
                      from public.orcamento_itens where id = tests.uid('i_alv')), '33.90|41.88|3390.00|4188.00|SINAPI|8002', 'item composição: custo 33,90 · preço round(33,90×1,2354)=41,88 · totais');
select tests.igual((select custo_unitario || '|' || preco_unitario || '|' || total_sem_bdi || '|' || total from public.orcamento_itens where id = tests.uid('i_arg')),
  '512.37|632.98|1280.93|1582.45', 'item com qtd fracionada: arredondamento por item');
select tests.ok((select sem_preco and custo_unitario = 0 from public.orcamento_itens where id = tests.uid('i_sem')), 'item de insumo sem preço ⇒ custo 0 e sem_preco');
select tests.igual((select custo_unitario from public.orcamento_itens where id = tests.uid('i_ofi')), 50.12::numeric(14,2), 'item SINAPI com custo oficial');

select public.fn_orcamento_recalcular(tests.uid('orc'));
select tests.igual((select total_sem_bdi || '|' || total || '|' || total_bdi || '|' || itens_sem_preco from public.orcamentos where id = tests.uid('orc')),
  '5221.05|6450.07|1229.02|1', 'recalcular: totais do orçamento (Σ etapas de 1º nível; total_bdi = total − sem BDI)');
select tests.igual((select total from public.orcamento_etapas where id = tests.uid('e2')), 5770.45::numeric(16,2), 'etapa inclui subetapa (4188,00 + 1582,45)');
select tests.igual((select total from public.orcamento_etapas where id = tests.uid('e21')), 1582.45::numeric(16,2), 'subetapa');
select tests.igual((select total from public.orcamento_etapas where id = tests.uid('e1')), 679.62::numeric(16,2), 'etapa 1 (617,70 + 0 + 61,92)');

-- numeração EAP: subetapas antes dos itens
select tests.igual((select string_agg(codigo, ',' order by codigo) from public.orcamento_etapas where orcamento_id = tests.uid('orc')), '1,2,2.1', 'EAP: etapas');
select tests.igual((select string_agg(codigo, ',' order by codigo) from public.orcamento_itens where orcamento_id = tests.uid('orc')), '1.1,1.2,1.3,2.1.1,2.2', 'EAP: itens (2.1 é a subetapa, item da etapa 2 vira 2.2)');

-- resumo sintético
select tests.igual((select string_agg(codigo || ':' || nivel || ':' || round(percentual, 2), ',' order by ordem_path) from public.fn_orcamento_resumo(tests.uid('orc'))),
  '1:1:10.54,2:1:89.46,2.1:2:24.53', 'resumo: nível e percentual');

-- cotação de insumo afeta a árvore: oficial deixa de valer
insert into public.orcamento_insumo_precos (orcamento_id, insumo_id, preco, fonte) values (tests.uid('orc'), tests.ins('9001'), 25, 'Cotação teste');
select public.fn_orcamento_recalcular(tests.uid('orc'));
select tests.igual((select custo_unitario from public.orcamento_itens where id = tests.uid('i_ofi')), 50.00::numeric(14,2), 'cotação na árvore ⇒ custo calculado (2×25) em vez do oficial');
select tests.igual((select custo_unitario from public.orcamento_itens where id = tests.uid('i_alv')), 38.90::numeric(14,2), 'cotação propaga para composição com subcomposição (25+7,75+6,14844)');
select tests.igual(public.fn_custo_composicao(tests.comp('8002'), tests.uid('db_sp'), tests.uid('orc')), 38.90::numeric, 'fn_custo_composicao com orçamento usa cotação');
delete from public.orcamento_insumo_precos where orcamento_id = tests.uid('orc');

-- memória de cálculo
update public.orcamento_itens set usa_memoria = true where id = tests.uid('i_alv');
insert into public.orcamento_item_memorias (item_id, ordem, descricao, expressao, resultado) values
  (tests.uid('i_alv'), 1, 'Parede A', '2*(3,50+4,20)*2,80 - 1,20*2,10', 40.6), (tests.uid('i_alv'), 2, 'Parede B', '20*3', 60);
select tests.igual((select quantidade from public.orcamento_itens where id = tests.uid('i_alv')), 100.6::numeric(18,4), 'memória: quantidade = Σ resultados');
update public.orcamento_item_memorias set resultado = 59.4 where item_id = tests.uid('i_alv') and ordem = 2;
select tests.igual((select quantidade from public.orcamento_itens where id = tests.uid('i_alv')), 100::numeric(18,4), 'memória: alteração atualiza quantidade');
update public.orcamento_itens set quantidade = 5 where id = tests.uid('i_alv');
select tests.igual((select quantidade from public.orcamento_itens where id = tests.uid('i_alv')), 100::numeric(18,4), 'memória: com usa_memoria, quantidade digitada é ignorada');
select tests.igual((select organizacao_id from public.orcamento_item_memorias limit 1), tests.uid('org_a'), 'memória herda organização do item');
select public.fn_orcamento_recalcular(tests.uid('orc'));

-- trigger de cálculo × calc.ts (12,345 × 57,89 com BDI 22,12)
update public.orcamento_itens set quantidade = 12.345, custo_unitario = 57.89, bdi_percentual = 22.12 where id = tests.uid('i_placa');
select tests.igual((select jsonb_build_object('custo_unitario', custo_unitario, 'preco_unitario', preco_unitario, 'total_sem_bdi', total_sem_bdi, 'total', total)
                      from public.orcamento_itens where id = tests.uid('i_placa')),
                   tests.get('calc:item')::jsonb, 'paridade calcularItem(): 57,89 · 70,70 · 714,65 · 872,79');
update public.orcamento_itens set quantidade = 1, custo_unitario = 500 where id = tests.uid('i_placa');
select public.fn_orcamento_recalcular(tests.uid('orc'));
select tests.igual((select bdi_percentual from public.orcamento_itens where id = tests.uid('i_placa')), 23.54::numeric(9,4), 'recalcular reaplica o BDI padrão');

-- BDI diferenciado por item
insert into public.orcamento_bdis (orcamento_id, nome, ac, s, r, g, df, l, iss) values (tests.uid('orc'), 'BDI Materiais', 3.45, 0.24, 0.85, 0.24, 0.85, 5.11, 3);
update public.orcamento_itens set bdi_id = (select id from public.orcamento_bdis where nome = 'BDI Materiais') where id = tests.uid('i_arg');
select tests.igual((select bdi_percentual from public.orcamento_itens where id = tests.uid('i_arg')), (select bdi from public.orcamento_bdis where nome = 'BDI Materiais'), 'trocar bdi_id aplica o BDI diferenciado no item');
update public.orcamento_itens set bdi_id = null where id = tests.uid('i_arg');
select public.fn_orcamento_recalcular(tests.uid('orc'));
select tests.igual((select total from public.orcamentos where id = tests.uid('orc')), 6450.07::numeric(16,2), 'de volta ao estado conhecido');

-- trocar data-base
select tests.igual((public.fn_orcamento_trocar_data_base(tests.uid('orc'), tests.uid('db_sp10'))).data_base_id, tests.uid('db_sp10'), 'trocar data-base');
select tests.igual((select custo_unitario from public.orcamento_itens where id = tests.uid('i_alv')), 36.45::numeric(14,2), 'trocar data-base recalcula custos');
select tests.igual((select custo_unitario from public.orcamento_itens where id = tests.uid('i_ofi')), 44.00::numeric(14,2), 'sem custo oficial na nova data-base ⇒ calculado');
select public.fn_orcamento_trocar_data_base(tests.uid('orc'), tests.uid('db_sp'));

-- mover item para o topo da etapa 1
select public.fn_orcamento_mover('item', tests.uid('i_arg'), tests.uid('e1'), 1);
select tests.igual((select string_agg(codigo || '=' || referencia_codigo, ',' order by ordem) from public.orcamento_itens where etapa_id = tests.uid('e1') and referencia_codigo is not null),
  '1.1=8001,1.3=9005,1.4=8003', 'mover item: posição 1 e renumeração');
select tests.igual((select total from public.orcamento_etapas where id = tests.uid('e21')), 0::numeric(16,2), 'mover item atualiza totais das etapas');
select public.fn_orcamento_mover('item', tests.uid('i_arg'), tests.uid('e21'), 99);
select tests.lanca(format('select public.fn_orcamento_mover(''etapa'', %L, %L, 1)', tests.uid('e2'), tests.uid('e21')), 'P0001', 'mover etapa para dentro da própria subetapa ⇒ erro');
insert into public.orcamento_etapas (orcamento_id, parent_id, nome) values (tests.uid('orc'), tests.uid('e21'), 'Nível 3');
select tests.lanca(format($q$insert into public.orcamento_etapas (orcamento_id, parent_id, nome) select %L, id, 'Nível 4' from public.orcamento_etapas where nome = 'Nível 3'$q$, tests.uid('orc')), 'P0001', 'EAP: 4º nível bloqueado');
delete from public.orcamento_etapas where nome = 'Nível 3';
select public.fn_orcamento_mover('etapa', tests.uid('e2'), null, 1);
select tests.igual((select string_agg(codigo || '=' || nome, ',' order by codigo) from public.orcamento_etapas where orcamento_id = tests.uid('orc')),
  '1=Alvenaria,1.1=Paredes internas,2=Serviços preliminares', 'mover etapa: reordena e renumera');
select public.fn_orcamento_mover('etapa', tests.uid('e2'), null, 2);

-- curva ABC de serviços
select tests.igual((select string_agg(classe || ':' || coalesce(referencia_codigo, ''), ',' order by posicao) from public.fn_curva_abc_servicos(tests.uid('orc'))),
  'A:8002,A:8001,B:,C:8003', 'ABC serviços: classes pelo acumulado anterior, exclui total 0');
select tests.igual((select round(max(percentual_acumulado), 6) from public.fn_curva_abc_servicos(tests.uid('orc'))), 100::numeric, 'ABC serviços: acumulado fecha em 100%');

-- curva ABC de insumos (explosão recursiva)
select tests.igual((select quantidade from public.fn_curva_abc_insumos(tests.uid('orc')) where codigo = '9003'), 1110::numeric, 'ABC insumos: cimento = 100×0,012×300 + 2,5×300 = 1110 kg');
select tests.igual((select total from public.fn_curva_abc_insumos(tests.uid('orc')) where codigo = '9003'), 832.50::numeric, 'ABC insumos: total = round2(Σqtd × preço)');
select tests.igual((select quantidade from public.fn_curva_abc_insumos(tests.uid('orc')) where codigo = '9002'), 87::numeric, 'ABC insumos: servente = 100×0,5 + 100×0,012×10 + 2,5×10 = 87 h');
select tests.ok(exists (select 1 from public.fn_curva_abc_insumos(tests.uid('orc')) where insumo_id is null and codigo = '1.1' and total = 500), 'ABC insumos: item livre entra como pseudo-insumo');
select tests.ok((select bool_and(classe in ('A','B','C')) and count(*) > 3 from public.fn_curva_abc_insumos(tests.uid('orc'))), 'ABC insumos: classificação');
select tests.igual((select horas from public.fn_mao_obra_horas_orcamento(tests.uid('orc')) where codigo = '9001'), 102::numeric, 'horas de MO implícitas: pedreiro 100×1 + 1×2 (8003 tem custo oficial mas explode o analítico)');

-- status aprovado ⇒ somente leitura
update public.orcamentos set status = 'aprovado' where id = tests.uid('orc');
select tests.lanca(format('update public.orcamento_itens set quantidade = 1 where id = %L', tests.uid('i_alv')), 'P0001', 'aprovado: item somente leitura');
select tests.lanca(format($q$insert into public.orcamento_etapas (orcamento_id, nome) values (%L, 'x')$q$, tests.uid('orc')), 'P0001', 'aprovado: não cria etapa');
select tests.igual((public.fn_orcamento_recalcular(tests.uid('orc'))).total, 6450.07::numeric(16,2), 'aprovado: recalcular não altera valores');

-- duplicar (nova versão) a partir do aprovado
select tests.set('orc2', public.fn_orcamento_duplicar(tests.uid('orc'), null, true)::text);
select tests.igual((select versao || '|' || status || '|' || total || '|' || (orcamento_origem_id = tests.uid('orc')) from public.orcamentos where id = tests.uid('orc2')),
  '2|rascunho|6450.07|true', 'duplicar: versão 2, rascunho, mesmos totais, origem');
select tests.igual((select count(*) from public.orcamento_itens where orcamento_id = tests.uid('orc2')), 5::bigint, 'duplicar: itens');
select tests.igual((select count(*) from public.orcamento_etapas where orcamento_id = tests.uid('orc2')), 3::bigint, 'duplicar: etapas (árvore)');
select tests.igual((select count(*) from public.orcamento_item_memorias m join public.orcamento_itens i on i.id = m.item_id where i.orcamento_id = tests.uid('orc2')), 2::bigint, 'duplicar: memórias');
select tests.igual((select string_agg(codigo, ',' order by codigo) from public.orcamento_itens where orcamento_id = tests.uid('orc2')), '1.1,1.2,1.3,2.1.1,2.2', 'duplicar: mesma numeração');
select tests.igual((public.fn_orcamento_recalcular(tests.uid('orc2'))).total, 6450.07::numeric(16,2), 'duplicado recalcula para o mesmo total');
select tests.igual((select count(*) from public.orcamento_bdis where orcamento_id = tests.uid('orc2')), 2::bigint, 'duplicar: BDIs');

update public.orcamentos set status = 'rascunho' where id = tests.uid('orc');
select tests.executa(format('update public.orcamento_itens set observacao = ''ok'' where id = %L', tests.uid('i_alv')), 'rascunho novamente: editável');
select tests.logout();
