-- fn_composicao_propria_salvar (0030, TESTES): criação/edição atômica de composição própria
select tests.orc_fixture();
select tests.orc_referencias();

select tests.login(tests.uid('editor_a'));
insert into public.insumos (organizacao_id, fonte, codigo, descricao, unidade, preco_proprio)
values (tests.uid('org_a'), 'propria', 'P-1', 'Bloco ecológico', 'UN', 2);
select tests.set('p1', (select id::text from public.insumos where codigo = 'P-1'));

-- criação
select tests.set('cp', public.fn_composicao_propria_salvar(null,
  jsonb_build_object('organizacao_id', tests.uid('org_a'), 'codigo', ' CP-1 ', 'descricao', 'Alvenaria ecológica', 'unidade', 'm2', 'grupo', 'ALV'),
  jsonb_build_array(
    jsonb_build_object('tipo_item', 'insumo', 'referencia_id', tests.uid('p1'), 'coeficiente', 12.5),
    jsonb_build_object('tipo_item', 'composicao', 'referencia_id', tests.comp('8002'), 'coeficiente', 0.5)
  ))::text);
select tests.igual((select row(organizacao_id, fonte::text, codigo, unidade, grupo)::text from public.composicoes where id = tests.uid('cp')),
  row(tests.uid('org_a'), 'propria', 'CP-1', 'M2', 'ALV')::text, 'cria cabeçalho na org, fonte própria, código aparado, unidade maiúscula');
select tests.igual((select string_agg(ordem || ':' || tipo_item || ':' || coeficiente::numeric(10,2), ',' order by ordem) from public.composicao_itens where composicao_id = tests.uid('cp')),
  '1:insumo:12.50,2:composicao:0.50', 'itens gravados na ordem do array');
select tests.igual((select organizacao_id from public.composicao_itens where composicao_id = tests.uid('cp') limit 1), tests.uid('org_a'), 'itens herdam organizacao_id');
select tests.ok((select preco from public.fn_buscar_referencias('CP-1', tests.uid('db_sp'), tests.uid('org_a'), 'composicao', 5) limit 1) > 25, 'custo calculado aparece na busca (12,5 × 2 + 0,5 × 8002)');

-- edição substitui itens e cabeçalho
select tests.executa(format($q$select public.fn_composicao_propria_salvar(%L, '{"codigo":"CP-1","descricao":"Alvenaria v2","unidade":"M2"}', %L)$q$,
  tests.uid('cp'), jsonb_build_array(jsonb_build_object('tipo_item', 'insumo', 'insumo_id', tests.uid('p1'), 'coeficiente', 10))), 'edita (aceita insumo_id)');
select tests.igual((select descricao || '|' || coalesce(grupo, '-') from public.composicoes where id = tests.uid('cp')), 'Alvenaria v2|-', 'cabeçalho atualizado (grupo omitido ⇒ null)');
select tests.igual(tests.conta(format('select 1 from public.composicao_itens where composicao_id = %L', tests.uid('cp'))), 1::bigint, 'itens substituídos');

-- atomicidade: item inválido ⇒ nada muda
select tests.lanca(format($q$select public.fn_composicao_propria_salvar(%L, '{"codigo":"CP-1","descricao":"NÃO","unidade":"M2"}', %L)$q$,
  tests.uid('cp'), jsonb_build_array(jsonb_build_object('tipo_item', 'insumo', 'referencia_id', tests.uid('p1'), 'coeficiente', 0))), 'P0001', 'coeficiente 0 ⇒ P0001');
select tests.igual((select descricao from public.composicoes where id = tests.uid('cp')), 'Alvenaria v2', 'erro em item não altera o cabeçalho');
select tests.igual(tests.conta(format('select 1 from public.composicao_itens where composicao_id = %L', tests.uid('cp'))), 1::bigint, 'erro em item não apaga os itens');
select tests.lanca(format($q$select public.fn_composicao_propria_salvar(%L, '{"codigo":"CP-1","descricao":"x","unidade":"M2"}', %L)$q$,
  tests.uid('cp'), jsonb_build_array(jsonb_build_object('tipo_item', 'composicao', 'referencia_id', tests.uid('cp'), 'coeficiente', 1))), null, 'auto-referência rejeitada');
select tests.lanca(format($q$select public.fn_composicao_propria_salvar(%L, '{"codigo":"CP-1","descricao":"x","unidade":"M2"}', %L)$q$,
  tests.uid('cp'), jsonb_build_array(jsonb_build_object('tipo_item', 'xyz', 'referencia_id', tests.uid('p1'), 'coeficiente', 1))), 'P0001', 'tipo de item inválido ⇒ P0001');
select tests.lanca(format($q$select public.fn_composicao_propria_salvar(%L, '{"codigo":"","descricao":"x","unidade":"M2"}', '[]')$q$, tests.uid('cp')), 'P0001', 'código vazio ⇒ P0001');
select tests.lanca($q$select public.fn_composicao_propria_salvar(null, '{"codigo":"X","descricao":"x","unidade":"UN"}', '[]')$q$, 'P0001', 'criação sem organizacao_id ⇒ P0001');
select tests.lanca(format($q$select public.fn_composicao_propria_salvar(%L, '{"codigo":"8002","descricao":"x","unidade":"UN"}', '[]')$q$, tests.comp('8002')), '42501', 'composição SINAPI não é editável ⇒ 42501');
select tests.lanca(format($q$select public.fn_composicao_propria_salvar(null, '{"organizacao_id":"%s","codigo":"CP-1","descricao":"dup","unidade":"UN"}', '[]')$q$, tests.uid('org_a')), '23505', 'código duplicado na org ⇒ 23505');

-- permissões
select tests.login(tests.uid('viewer_a'));
select tests.lanca(format($q$select public.fn_composicao_propria_salvar(%L, '{"codigo":"CP-1","descricao":"viewer","unidade":"M2"}', '[]')$q$, tests.uid('cp')), '42501', 'viewer não edita ⇒ 42501');
select tests.lanca(format($q$select public.fn_composicao_propria_salvar(null, '{"organizacao_id":"%s","codigo":"V","descricao":"v","unidade":"UN"}', '[]')$q$, tests.uid('org_a')), '42501', 'viewer não cria ⇒ 42501');
select tests.login(tests.uid('owner_b'));
select tests.lanca(format($q$select public.fn_composicao_propria_salvar(%L, '{"codigo":"CP-1","descricao":"B","unidade":"M2"}', '[]')$q$, tests.uid('cp')), 'P0001', 'org B não enxerga a composição da org A (não encontrada)');
select tests.lanca(format($q$select public.fn_composicao_propria_salvar(null, '{"organizacao_id":"%s","codigo":"B","descricao":"b","unidade":"UN"}', '[]')$q$, tests.uid('org_a')), '42501', 'org B não cria na org A ⇒ 42501');
select tests.lanca(format($q$select public.fn_composicao_propria_salvar(null, '{"organizacao_id":"%s","codigo":"B","descricao":"b","unidade":"UN"}', %L)$q$,
  tests.uid('org_b'), jsonb_build_array(jsonb_build_object('tipo_item', 'insumo', 'referencia_id', tests.uid('p1'), 'coeficiente', 1))), 'P0001', 'org B não usa insumo próprio da org A');
select tests.igual(tests.conta($q$select 1 from public.composicoes where codigo = 'B'$q$), 0::bigint, 'falha não deixa cabeçalho órfão (atômico)');
select tests.login(tests.uid('pendente'));
select tests.lanca(format($q$select public.fn_composicao_propria_salvar(null, '{"organizacao_id":"%s","codigo":"Z","descricao":"z","unidade":"UN"}', '[]')$q$, tests.uid('org_a')), '42501', 'usuário pendente ⇒ 42501');
select tests.login_anon();
select tests.lanca($q$select public.fn_composicao_propria_salvar(null, '{}', '[]')$q$, '42501', 'anon sem EXECUTE');
