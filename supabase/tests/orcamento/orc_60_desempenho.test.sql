-- Desempenho: recálculo de orçamento com 1.000+ itens (< 3 s) e lote de importação de 2.000 linhas
select tests.orc_fixture();
select tests.set('db', (select id::text from public.datas_base where is_demo and regime = 'nao_desonerado'));
select tests.login(tests.uid('editor_a'));
select tests.set('orc', public.fn_orcamento_criar(tests.uid('obra_a'), 'Grande', tests.uid('db'))::text);
insert into public.orcamento_etapas (orcamento_id, ordem, nome)
select tests.uid('orc'), g, 'Etapa ' || g from generate_series(2, 10) g;
insert into public.orcamento_etapas (orcamento_id, parent_id, ordem, nome)
select tests.uid('orc'), e.id, 1, 'Sub ' || e.nome from public.orcamento_etapas e where e.orcamento_id = tests.uid('orc');
-- 1.100 itens: composições do seed (com subcomposições) + insumos + livres
insert into public.orcamento_itens (orcamento_id, etapa_id, ordem, referencia_tipo, composicao_id, insumo_id, descricao, unidade, quantidade, custo_unitario)
select tests.uid('orc'), e.id, g,
       case when g % 10 = 0 then 'livre'::public.item_referencia_tipo when g % 7 = 0 then 'insumo' else 'composicao' end,
       case when g % 10 <> 0 and g % 7 <> 0 then c.id end,
       case when g % 10 <> 0 and g % 7 = 0 then i.id end,
       'item ' || g, 'UN', (g % 37) + 0.5, case when g % 10 = 0 then 12.34 else 0 end
  from generate_series(1, 1100) g
  cross join lateral (select id from public.orcamento_etapas where orcamento_id = tests.uid('orc') order by id offset (g % 20) limit 1) e
  cross join lateral (select id from public.composicoes where is_demo order by codigo offset (g % 19) limit 1) c
  cross join lateral (select id from public.insumos where is_demo order by codigo offset (g % 38) limit 1) i;
-- com cotação (força a descida completa da árvore)
insert into public.orcamento_insumo_precos (orcamento_id, insumo_id, preco) select tests.uid('orc'), id, 1.00 from public.insumos where codigo = '1379';

do $$
declare t0 timestamptz; ms numeric; v record;
begin
  t0 := clock_timestamp();
  select * into v from public.fn_orcamento_recalcular(tests.uid('orc'));
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform tests.ok(ms < 3000, 'recalcular 1.100 itens < 3 s (com cotação)', round(ms) || ' ms; total ' || v.total);
  perform tests.ok(v.total > 0 and v.itens_sem_preco = 0, 'recalcular: totais preenchidos', v.total::text);
  t0 := clock_timestamp();
  perform public.fn_orcamento_renumerar(tests.uid('orc'));
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform tests.ok(ms < 3000, 'renumerar 1.100 itens < 3 s', round(ms) || ' ms');
  t0 := clock_timestamp();
  perform count(*) from public.fn_curva_abc_insumos(tests.uid('orc'));
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform tests.ok(ms < 3000, 'curva ABC de insumos 1.100 itens < 3 s', round(ms) || ' ms');
  t0 := clock_timestamp();
  perform public.fn_orcamento_duplicar(tests.uid('orc'));
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform tests.ok(ms < 5000, 'duplicar orçamento de 1.100 itens < 5 s', round(ms) || ' ms');
end $$;
select tests.ok((select count(distinct codigo) = count(*) from public.orcamento_itens where orcamento_id = tests.uid('orc')), 'numeração única');
-- total do orçamento = Σ itens (sem novo arredondamento)
select tests.ok((select total = (select sum(total) from public.orcamento_itens where orcamento_id = tests.uid('orc')) from public.orcamentos where id = tests.uid('orc')), 'total do orçamento = Σ total dos itens');

select tests.login(tests.uid('admin'));
do $$
declare t0 timestamptz; ms numeric; imp uuid; n int;
begin
  imp := public.fn_sinapi_iniciar_importacao('RJ', 2026, 8, 'nao_desonerado', 'insumos');
  t0 := clock_timestamp();
  n := public.fn_sinapi_importar_insumos(imp, (select jsonb_agg(jsonb_build_object('codigo', (100000 + g)::text, 'descricao', 'INSUMO ' || g, 'unidade', 'UN', 'preco', g / 10.0)) from generate_series(1, 2000) g));
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform tests.ok(n = 2000 and ms < 5000, 'lote de 2.000 insumos', n || ' linhas em ' || round(ms) || ' ms');
  t0 := clock_timestamp();
  n := public.fn_sinapi_importar_insumos(imp, (select jsonb_agg(jsonb_build_object('codigo', (100000 + g)::text, 'descricao', 'INSUMO ' || g, 'unidade', 'UN',
         'preco', case when g = 1500 then '-1' else (g / 10.0)::text end)) from generate_series(1, 2000) g));
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform tests.ok(n = 1999 and ms < 5000, 'reimportação 2.000 linhas com 1 inválida', n || ' linhas em ' || round(ms) || ' ms');
end $$;
select tests.logout();
