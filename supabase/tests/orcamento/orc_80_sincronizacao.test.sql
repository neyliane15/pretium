-- Sincronização automática da SINAPI (0032): service_role importa; usuários só leem o histórico
select tests.orc_fixture();

-- service_role (função de servidor) passa por assert_admin e importa/publica
select set_config('role', 'postgres', false);
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claim.role', 'service_role', false);
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select set_config('role', 'service_role', false);

select tests.set('imp', public.fn_sinapi_iniciar_importacao('SP', 2026, 9, 'desonerado', 'insumos', 'https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais/SINAPI-2026-09-formato-xlsx.zip')::text);
select tests.igual(public.fn_sinapi_importar_insumos(tests.uid('imp'), '[{"codigo":"370","descricao":"AREIA MEDIA","unidade":"M3","preco":120,"linha":12}]'::jsonb), 1, 'service_role importa lote');
select tests.igual((public.fn_sinapi_finalizar_importacao(tests.uid('imp'), true)).status::text, 'concluida', 'service_role finaliza e publica');
select tests.set('db', (select data_base_id::text from public.sinapi_importacoes where id = tests.uid('imp')));
select tests.igual((select status::text || '|' || is_demo from public.datas_base where id = tests.uid('db')), 'publicada|false', 'data-base SP oficial publicada');

insert into public.sinapi_sincronizacoes (ano, mes, ufs, origem, status) values (2026, 9, '{SP}', 'automatica', 'concluida');
select tests.ok((select 'SP' = any(public.fn_sinapi_ufs_em_uso())), 'UF com tabela oficial entra nas UFs em uso');
select tests.ok((select 'RJ' = any(public.fn_sinapi_ufs_em_uso())), 'UF padrão das organizações entra nas UFs em uso');

-- usuário comum: lê o histórico, não escreve, não chama RPC administrativa
select tests.login(tests.uid('editor_a'));
select tests.igual((select count(*)::int from public.sinapi_sincronizacoes), 1, 'usuário ativo lê o histórico');
select tests.lanca($$insert into public.sinapi_sincronizacoes (ano, mes, ufs) values (2026, 9, '{RJ}')$$, '42501', 'usuário não grava no histórico');
select tests.lanca($$select public.fn_sinapi_iniciar_importacao('RJ', 2026, 9, 'desonerado', 'insumos')$$, '42501', 'usuário não inicia importação');
select tests.igual((select count(*)::int from public.fn_sinapi_disponibilidade('sp')), 1, 'disponibilidade por UF');

-- anon: nada
select tests.login_anon();
select tests.lanca($$select count(*) from public.sinapi_sincronizacoes$$, '42501', 'anon não lê o histórico');
