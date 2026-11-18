-- Importação SINAPI em lotes: validação por linha, upsert idempotente, esqueletos, ciclos, finalizar/publicar
select tests.orc_fixture();
select tests.login(tests.uid('admin'));

select tests.set('imp1', public.fn_sinapi_iniciar_importacao('rj', 2026, 10, 'nao_desonerado', 'insumos', 'SINAPI_Preco_Ref_Insumos_RJ_202610_NaoDesonerado.xlsx')::text);
select tests.set('db', (select data_base_id::text from public.sinapi_importacoes where id = tests.uid('imp1')));
select tests.igual((select uf || '|' || status || '|' || is_demo || '|' || descricao from public.datas_base where id = tests.uid('db')),
  'RJ|rascunho|false|SINAPI RJ 10/2026 – Não desonerado', 'iniciar: cria data-base oficial em rascunho');

create temp table lote_ins as select $j$[
  {"codigo": "00370", "descricao": "AREIA MEDIA - POSTO JAZIDA/FORNECEDOR", "unidade": "m3", "preco": 130.5, "origem_preco": "C", "linha": 7},
  {"codigo": "1379.0", "descricao": "CIMENTO PORTLAND COMPOSTO CP II-32", "unidade": "KG", "preco": "0,91", "linha": 8},
  {"codigo": "4750", "descricao": "PEDREIRO", "unidade": "H", "preco": "1.234,56", "linha": 9},
  {"codigo": "88888", "descricao": "PRIMEIRA VERSAO", "unidade": "UN", "preco": 1, "linha": 10},
  {"codigo": "88888", "descricao": "SEGUNDA VERSAO (VALE A ÚLTIMA)", "unidade": "UN", "preco": 2, "tipo": "servico", "linha": 11},
  {"codigo": "ABC", "descricao": "TITULO", "unidade": "UN", "preco": 1, "linha": 12},
  {"codigo": "5555", "descricao": "SEM PRECO", "unidade": "UN", "preco": null, "linha": 13},
  {"codigo": "5556", "descricao": "PRECO TEXTO", "unidade": "UN", "preco": "abc", "linha": 14},
  {"codigo": "5557", "descricao": "", "unidade": "UN", "preco": 1, "linha": 15}
]$j$::jsonb as j;
select tests.igual(public.fn_sinapi_importar_insumos(tests.uid('imp1'), (select j from lote_ins)), 5, 'insumos: 5 linhas válidas no lote (duplicata conta, última vence)');
select tests.igual((select total_linhas || '|' || linhas_ok || '|' || linhas_erro from public.sinapi_importacoes where id = tests.uid('imp1')), '9|5|4', 'insumos: contadores do lote');
select tests.igual((select string_agg((e->>'linha') || ':' || (e->>'mensagem'), ', ' order by (e->>'linha')::int) from public.sinapi_importacoes, jsonb_array_elements(erros) e where id = tests.uid('imp1')),
  '12:Código inválido, 13:Preço ausente, 14:Preço inválido, 15:Descrição ausente', 'insumos: erros por linha');
select tests.igual((select ip.preco from public.insumo_precos ip join public.insumos i on i.id = ip.insumo_id where i.codigo = '370' and ip.data_base_id = tests.uid('db')), 130.5::numeric(14,4), 'código normalizado (00370 → 370) e unidade maiúscula');
select tests.igual((select ip.preco from public.insumo_precos ip join public.insumos i on i.id = ip.insumo_id where i.codigo = '4750' and ip.data_base_id = tests.uid('db')), 1234.56::numeric(14,4), 'preço texto pt-BR "1.234,56"');
select tests.igual((select descricao || '|' || tipo from public.insumos where codigo = '88888'), 'SEGUNDA VERSAO (VALE A ÚLTIMA)|servico', 'duplicata no lote: última linha vence; tipo informado');
select tests.igual((select tipo::text from public.insumos where codigo = '4750'), 'mao_de_obra', 'tipo pela heurística (unidade H)');
select tests.igual((select is_demo from public.insumos where codigo = '1379'), false, 'insumo do seed passa a oficial (is_demo = false) ao ser importado');

-- idempotência: mesmo lote de novo
create temp table cont as select (select count(*) from public.insumos) a, (select count(*) from public.insumo_precos) b;
select public.fn_sinapi_importar_insumos(tests.uid('imp1'), (select j from lote_ins));
select tests.ok((select a = (select count(*) from public.insumos) and b = (select count(*) from public.insumo_precos) from cont), 'reimportar o mesmo lote não duplica (upsert)');
select public.fn_sinapi_importar_insumos(tests.uid('imp1'), '[{"codigo":"370","descricao":"AREIA MEDIA","unidade":"M3","preco":140}]'::jsonb);
select tests.igual((select ip.preco from public.insumo_precos ip join public.insumos i on i.id = ip.insumo_id where i.codigo = '370' and ip.data_base_id = tests.uid('db')), 140::numeric(14,4), 'reimportação atualiza preço');
select tests.lanca(format('select public.fn_sinapi_importar_insumos(%L, (select jsonb_agg(jsonb_build_object(''codigo'', g::text, ''descricao'', ''x'', ''unidade'', ''UN'', ''preco'', 1)) from generate_series(1, 2001) g))', tests.uid('imp1')), 'P0001', 'lote > 2000 linhas ⇒ erro');
select tests.igual((public.fn_sinapi_finalizar_importacao(tests.uid('imp1'), false)).status::text, 'concluida', 'finalizar sem publicar');
select tests.igual((select status::text from public.datas_base where id = tests.uid('db')), 'rascunho', 'data-base continua rascunho');
select tests.lanca(format('select public.fn_sinapi_importar_insumos(%L, ''[]''::jsonb)', tests.uid('imp1')), 'P0001', 'importação finalizada não aceita lotes');
select tests.igual((select count(*) from public.auditoria_logs where acao = 'importar_sinapi'), 1::bigint, 'auditoria importar_sinapi');

-- composições (sintético)
select tests.set('imp2', public.fn_sinapi_iniciar_importacao('RJ', 2026, 10, 'nao_desonerado', 'composicoes')::text);
select tests.igual((select data_base_id from public.sinapi_importacoes where id = tests.uid('imp2')), tests.uid('db'), 'iniciar reutiliza a data-base existente');
select tests.igual(public.fn_sinapi_importar_composicoes(tests.uid('imp2'), $j$[
  {"codigo":"87503","descricao":"ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS 9X19X19","unidade":"M2","grupo":"ALVENARIA","custo":"78,45","perc_mao_obra":45.2,"linha":2},
  {"codigo":"99999","descricao":"SEM CUSTO","unidade":"M2","linha":3}
]$j$::jsonb), 1, 'composições: 1 ok, 1 erro (custo ausente)');
select tests.igual((select cp.custo from public.composicao_precos cp join public.composicoes c on c.id = cp.composicao_id where c.codigo = '87503' and cp.data_base_id = tests.uid('db')), 78.45::numeric(14,4), 'composições: custo publicado gravado');
select public.fn_sinapi_finalizar_importacao(tests.uid('imp2'));

-- analítico com esqueletos e ciclo isolado por linha
select tests.set('imp3', public.fn_sinapi_iniciar_importacao('RJ', 2026, 10, 'nao_desonerado', 'analitico')::text);
select tests.igual(public.fn_sinapi_importar_composicao_itens(tests.uid('imp3'), $j$[
  {"composicao_codigo":"70001","tipo_item":"INSUMO","item_codigo":"370","coeficiente":"0,5","linha":1},
  {"composicao_codigo":"70001","tipo_item":"COMPOSIÇÃO","item_codigo":"70002","coeficiente":2,"descricao":"SUBCOMPOSIÇÃO NOVA","unidade":"m2","linha":2},
  {"composicao_codigo":"70002","tipo_item":"INSUMO","item_codigo":"77777","coeficiente":1.5,"descricao":"INSUMO NOVO","unidade":"kg","linha":3},
  {"composicao_codigo":"70002","tipo_item":"COMPOSICAO","item_codigo":"70001","coeficiente":1,"linha":4},
  {"composicao_codigo":"70003","tipo_item":"INSUMO","item_codigo":"370","coeficiente":0,"linha":5},
  {"composicao_codigo":"70003","tipo_item":"XPTO","item_codigo":"370","coeficiente":1,"linha":6}
]$j$::jsonb), 3, 'analítico: 3 ok; ciclo (linha 4) isolado linha a linha; coeficiente 0 e tipo inválido rejeitados');
select tests.ok((select bool_or((e->>'linha') = '4' and (e->>'mensagem') like 'Ciclo%') from public.sinapi_importacoes, jsonb_array_elements(erros) e where id = tests.uid('imp3')), 'analítico: erro de ciclo registrado na linha 4');
select tests.igual((select descricao || '|' || unidade from public.composicoes where codigo = '70002'), 'SUBCOMPOSIÇÃO NOVA|M2', 'esqueleto de subcomposição com descrição da linha');
select tests.igual((select descricao || '|' || unidade || '|' || tipo from public.insumos where codigo = '77777'), 'INSUMO NOVO|KG|material', 'esqueleto de insumo com descrição da linha');
select tests.ok((select descricao like '%(sem descrição)' from public.composicoes where codigo = '70001'), 'esqueleto de composição-pai sem descrição');
select public.fn_sinapi_importar_composicoes(tests.uid('imp3'), '[{"codigo":"70001","descricao":"COMPOSIÇÃO PAI","unidade":"M3","custo":10}]'::jsonb);
select tests.igual((select descricao from public.composicoes where codigo = '70001'), 'COMPOSIÇÃO PAI', 'cabeçalho do analítico completa a descrição');
select tests.igual((public.fn_sinapi_finalizar_importacao(tests.uid('imp3'), true)).status::text, 'concluida', 'finalizar analítico publicando');
select tests.igual((select status::text from public.datas_base where id = tests.uid('db')), 'publicada', 'data-base publicada');

-- nova carga analítica de 70001 sem o insumo 370 ⇒ item antigo removido na finalização
select tests.set('imp4', public.fn_sinapi_iniciar_importacao('RJ', 2026, 10, 'nao_desonerado', 'analitico')::text);
select public.fn_sinapi_importar_composicao_itens(tests.uid('imp4'), '[{"composicao_codigo":"70001","tipo_item":"COMPOSICAO","item_codigo":"70002","coeficiente":3}]'::jsonb);
select public.fn_sinapi_finalizar_importacao(tests.uid('imp4'));
select tests.igual((select string_agg(coalesce(i.codigo, s.codigo) || '×' || ci.coeficiente::numeric(10,2), ',') from public.composicao_itens ci
                     left join public.insumos i on i.id = ci.insumo_id left join public.composicoes s on s.id = ci.subcomposicao_id
                    where ci.composicao_id = (select id from public.composicoes where codigo = '70001')), '70002×3.00', 'finalizar analítico remove itens não reenviados e atualiza coeficiente');
select tests.igual((select count(*) from public.composicao_itens where composicao_id = (select id from public.composicoes where codigo = '70002')), 1::bigint, 'composições não tocadas na carga ficam intactas');

-- cancelar e publicar/arquivar
select tests.set('imp5', public.fn_sinapi_iniciar_importacao('RJ', 2026, 11, 'desonerado', 'insumos')::text);
select public.fn_sinapi_cancelar_importacao(tests.uid('imp5'));
select tests.igual((select status::text from public.sinapi_importacoes where id = tests.uid('imp5')), 'cancelada', 'cancelar importação');
select tests.igual((public.fn_sinapi_publicar_data_base(tests.uid('db'), 'arquivada')).status::text, 'arquivada', 'arquivar data-base');
select tests.ok((select publicada_em is not null from public.datas_base where id = tests.uid('db')), 'publicada_em preservado');
-- insumo SINAPI em uso não pode ser excluído
select tests.lanca($q$do $x$ begin set constraints all immediate; delete from public.insumos where codigo = '77777' and organizacao_id is null; end $x$$q$, '23503', 'insumo usado em composição não pode ser excluído');
select tests.logout();
