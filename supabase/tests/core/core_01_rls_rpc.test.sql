-- ============================================================================
-- Testes de RLS / RPC / segurança do núcleo (BACKEND-1).
-- Executado por core_run.mjs. Cada asserção grava em tests.resultados.
-- tests.login(uid) simula uma requisição PostgREST (role authenticated + JWT).
-- ============================================================================

-- ═══ 1. Cadastro e primeiro admin ═══════════════════════════════════════════
select tests.logout();
select tests.novo_usuario('admin', 'Admin@Pretium.dev', 'Admin');
select tests.novo_usuario('ownerA', 'owner.a@ex.com');
select tests.novo_usuario('ownerB', 'owner.b@ex.com');
select tests.novo_usuario('editorA', 'editor.a@ex.com');
select tests.novo_usuario('viewerA', 'viewer.a@ex.com');
select tests.novo_usuario('fora', 'fora@ex.com');
select tests.novo_usuario('pend', 'pendente@ex.com');

select tests.igual((select count(*) from public.profiles), 7::bigint, 'signup cria profile para cada auth.users');
select tests.igual((select papel_global::text || '/' || status from public.profiles where id = tests.uid('admin')),
                   'admin/active', 'primeiro cadastro vira admin ativo (admin_emails vazio)');
select tests.igual((select papel_global::text || '/' || status from public.profiles where id = tests.uid('ownerA')),
                   'user/pending', 'cadastros seguintes entram user/pending (aprovacao_obrigatoria)');
select tests.igual((select email::text from public.profiles where id = tests.uid('admin')), 'admin@pretium.dev',
                   'profile.email normalizado em minúsculas');
select tests.igual((select nome from public.profiles where id = tests.uid('admin')), 'Admin', 'nome vem de raw_user_meta_data.nome');
select tests.ok((select count(*) = 7 from public.auditoria_logs where acao = 'cadastro'), 'auditoria registra cadastros');

-- metadados maliciosos não promovem
insert into auth.users (id, email, raw_user_meta_data)
values (gen_random_uuid(), 'hacker@ex.com', '{"nome":"H","papel_global":"admin","status":"active"}');
select tests.igual((select papel_global::text || '/' || status from public.profiles where email = 'hacker@ex.com'),
                   'user/pending', 'raw_user_meta_data com papel_global/status é ignorado');

-- ═══ 2. Usuário pendente ═════════════════════════════════════════════════════
select tests.login(tests.uid('pend'));
select tests.igual(tests.conta('select 1 from public.profiles'), 1::bigint, 'pending vê só o próprio profile');
select tests.igual(tests.conta('select 1 from public.configuracoes'), 4::bigint, 'pending vê só configurações públicas (4)');
select tests.lanca($s$select public.criar_organizacao('Org P')$s$, '42501', 'pending não cria organização');
select tests.igual(tests.afetadas($s$update public.profiles set nome = 'x' where id = auth.uid()$s$), 0::bigint,
                   'pending não atualiza o próprio profile (RLS)');
select tests.igual(tests.afetadas($s$update public.profiles set status = 'active', papel_global = 'admin' where id = auth.uid()$s$), 0::bigint,
                   'pending não se auto-aprova nem vira admin');
select tests.ok(not public.is_active_user() and not public.is_admin(), 'helpers: pending ⇒ is_active_user/is_admin = false');
select tests.lanca($s$select * from public.admin_listar_usuarios()$s$, '42501', 'pending não usa RPC admin');

-- ═══ 3. Admin aprova usuários ════════════════════════════════════════════════
select tests.login(tests.uid('admin'));
select tests.executa($s$select public.admin_definir_status_usuario(tests.uid('ownerA'), 'active')$s$, 'admin aprova ownerA');
select public.admin_definir_status_usuario(tests.uid(k), 'active') from unnest(array['ownerB','editorA','viewerA','fora']) k;
select tests.igual((select aprovado_por from public.profiles where id = tests.uid('ownerA')), tests.uid('admin'), 'aprovado_por gravado');
select tests.ok((select count(*) >= 5 from public.auditoria_logs where acao = 'aprovar_usuario'), 'auditoria aprovar_usuario');
select tests.ok((select count(*) >= 5 from public.auditoria_logs where entidade = 'profiles' and acao = 'update'),
                'trigger de auditoria registra mudança de status em profiles');
select tests.igual((select (r).total_count from (select r from public.admin_listar_usuarios() r limit 1) s), 8::bigint,
                   'admin_listar_usuarios total_count');
select tests.igual(tests.conta($s$select 1 from public.admin_listar_usuarios('OWNER.')$s$), 2::bigint, 'admin_listar_usuarios busca');
select tests.igual(tests.conta($s$select 1 from public.admin_listar_usuarios(null, 'pending')$s$), 2::bigint, 'admin_listar_usuarios filtro status');
select tests.lanca($s$select public.admin_definir_status_usuario(auth.uid(), 'blocked', 'x')$s$, 'P0001', 'admin não bloqueia a si mesmo');
select tests.lanca($s$select public.admin_definir_papel_global(auth.uid(), 'user')$s$, 'P0001', 'não rebaixa o último admin');

-- ═══ 4. Usuário ativo não escala privilégio ══════════════════════════════════
select tests.login(tests.uid('ownerA'));
select tests.igual(tests.afetadas($s$update public.profiles set nome = 'Owner A', telefone = '21999990000', tema = 'dark' where id = auth.uid()$s$),
                   1::bigint, 'ativo edita o próprio nome/telefone/tema');
select tests.lanca($s$update public.profiles set papel_global = 'admin' where id = auth.uid()$s$, '42501', 'ativo não se promove a admin');
select tests.lanca($s$update public.profiles set status = 'blocked' where id = auth.uid()$s$, '42501', 'ativo não altera o próprio status');
select tests.lanca($s$update public.profiles set aprovado_por = auth.uid() where id = auth.uid()$s$, '42501', 'ativo não altera aprovado_por');
select tests.lanca($s$update public.profiles set email = 'novo@ex.com' where id = auth.uid()$s$, '42501', 'ativo não altera e-mail do profile');
select tests.igual(tests.afetadas($s$update public.profiles set nome = 'hack' where id = tests.uid('ownerB')$s$), 0::bigint,
                   'ativo não edita profile de outro usuário');
select tests.lanca($s$insert into public.profiles (id, email) values (gen_random_uuid(), 'x@ex.com')$s$, '42501', 'ativo não insere profile');
select tests.igual(tests.afetadas($s$delete from public.profiles where id = auth.uid()$s$), 0::bigint, 'ativo não exclui profile');
select tests.lanca($s$insert into public.organizacao_membros (organizacao_id, user_id, papel) values (gen_random_uuid(), auth.uid(), 'owner')$s$,
                   '42501', 'ativo não insere membro diretamente');
select tests.lanca($s$select public.admin_definir_papel_global(auth.uid(), 'admin')$s$, '42501', 'ativo não chama admin_definir_papel_global');
select tests.igual(tests.afetadas($s$update public.configuracoes set valor = '["owner.a@ex.com"]'$s$), 0::bigint,
                   'ativo não altera configuracoes');
select tests.igual((select valor from public.configuracoes where chave = 'admin_emails'), null::jsonb, 'admin_emails invisível a não-admin');

-- ═══ 5. Organizações ═════════════════════════════════════════════════════════
select tests.set('orgA', public.criar_organizacao('  Escritório A ', '12.345.678/0001-90')::text);
select tests.igual((select cnpj from public.organizacoes where id = tests.uid('orgA')), '12345678000190', 'CNPJ normalizado para dígitos');
select tests.igual((select organizacao_ativa_id from public.profiles where id = auth.uid()), tests.uid('orgA'), 'criar_organizacao define org ativa');
select tests.igual(public.org_papel(tests.uid('orgA'))::text, 'owner', 'criador é owner');
select tests.lanca($s$select public.criar_organizacao('X', '123')$s$, 'P0001', 'CNPJ inválido rejeitado');
select tests.lanca($s$select public.criar_organizacao('   ')$s$, 'P0001', 'nome vazio rejeitado');

select tests.login(tests.uid('ownerB'));
select tests.set('orgB', public.criar_organizacao('Escritório B')::text);
select tests.lanca($s$update public.profiles set organizacao_ativa_id = tests.uid('orgA') where id = auth.uid()$s$, '42501',
                   'não define org ativa de organização alheia (update direto)');
select tests.lanca($s$select public.definir_organizacao_ativa(tests.uid('orgA'))$s$, '42501', 'definir_organizacao_ativa exige membro');

-- ═══ 6. Convites ═════════════════════════════════════════════════════════════
select tests.login(tests.uid('ownerA'));
select tests.set('convEditor', public.convidar_membro(tests.uid('orgA'), 'Editor.A@ex.com', 'editor')::text);
select tests.set('convViewer', public.convidar_membro(tests.uid('orgA'), 'viewer.a@ex.com', 'viewer')::text);
select tests.igual(public.convidar_membro(tests.uid('orgA'), 'editor.a@ex.com', 'editor'), tests.uid('convEditor'),
                   'convite pendente repetido retorna o mesmo id');
select tests.lanca($s$select public.convidar_membro(tests.uid('orgA'), 'owner.a@ex.com', 'editor')$s$, 'P0001', 'não convida quem já é membro');
select tests.lanca($s$select public.convidar_membro(tests.uid('orgA'), 'invalido', 'editor')$s$, 'P0001', 'e-mail inválido');
select tests.lanca($s$insert into public.convites (organizacao_id, email) values (tests.uid('orgA'), 'z@ex.com')$s$, '42501',
                   'owner não insere convite direto (só RPC)');

select tests.logout();
select tests.set('tokEditor', (select token::text from public.convites where id = tests.uid('convEditor')));
select tests.set('tokViewer', (select token::text from public.convites where id = tests.uid('convViewer')));

select tests.login(tests.uid('ownerB'));
select tests.lanca($s$select public.convidar_membro(tests.uid('orgA'), 'x@ex.com', 'editor')$s$, '42501', 'owner de outra org não convida na org A');
select tests.igual(tests.conta('select 1 from public.convites'), 0::bigint, 'owner B não vê convites da org A');

select tests.login(tests.uid('fora'));
select tests.igual(tests.conta($s$select 1 from public.obter_convite(tests.uid('tokEditor'))$s$), 1::bigint, 'obter_convite por token');
select tests.lanca($s$select public.aceitar_convite(tests.uid('tokEditor'))$s$, '42501', 'aceitar convite de outro e-mail é negado');
select tests.igual(tests.conta('select 1 from public.meus_convites()'), 0::bigint, 'meus_convites vazio para quem não foi convidado');

select tests.login(tests.uid('editorA'));
select tests.igual(tests.conta('select 1 from public.meus_convites()'), 1::bigint, 'meus_convites lista convite do próprio e-mail');
select tests.igual(tests.conta('select 1 from public.convites'), 1::bigint, 'convidado vê o próprio convite (RLS)');
select tests.igual(public.aceitar_convite(tests.uid('tokEditor')), tests.uid('orgA'), 'aceitar_convite retorna organizacao_id');
select tests.lanca($s$select public.aceitar_convite(tests.uid('tokEditor'))$s$, 'P0001', 'convite aceito não pode ser reutilizado');
select tests.igual(public.org_papel(tests.uid('orgA'))::text, 'editor', 'convidado entra com o papel do convite');
select tests.igual((select organizacao_ativa_id from public.profiles where id = auth.uid()), tests.uid('orgA'), 'aceitar define org ativa');

select tests.login(tests.uid('viewerA'));
select public.aceitar_convite(tests.uid('tokViewer'));
select tests.igual(public.org_papel(tests.uid('orgA'))::text, 'viewer', 'viewer aceitou');

-- convite expirado
select tests.login(tests.uid('ownerA'));
select tests.set('convFora', public.convidar_membro(tests.uid('orgA'), 'fora@ex.com', 'viewer')::text);
select tests.logout();
update public.convites set expira_em = now() - interval '1 minute' where id = tests.uid('convFora');
select tests.set('tokFora', (select token::text from public.convites where id = tests.uid('convFora')));
select tests.login(tests.uid('fora'));
select tests.igual((select status::text from public.obter_convite(tests.uid('tokFora'))), 'expired', 'obter_convite reporta expirado');
select tests.lanca($s$select public.aceitar_convite(tests.uid('tokFora'))$s$, 'P0001', 'convite expirado não é aceito');
-- revogação
select tests.login(tests.uid('editorA'));
select tests.lanca($s$select public.revogar_convite(tests.uid('convFora'))$s$, '42501', 'editor não revoga convite');
select tests.login(tests.uid('ownerA'));
select tests.executa($s$select public.revogar_convite(tests.uid('convFora'))$s$, 'owner revoga convite');

-- ═══ 7. Isolamento entre organizações e papéis ═══════════════════════════════
select tests.login(tests.uid('editorA'));
select tests.executa($s$insert into public.clientes (organizacao_id, tipo, nome, documento, email, uf)
                        values (tests.uid('orgA'), 'PF', 'Fulano', '123.456.789-01', '', 'rj')$s$, 'editor insere cliente');
select tests.set('cliA', (select id::text from public.clientes where nome = 'Fulano'));
select tests.igual((select documento || '|' || coalesce(email::text, '<null>') || '|' || uf from public.clientes where id = tests.uid('cliA')),
                   '12345678901|<null>|RJ', 'cliente normalizado (documento, e-mail vazio, UF)');
select tests.igual((select created_by from public.clientes where id = tests.uid('cliA')), tests.uid('editorA'), 'created_by = auth.uid()');
select tests.executa($s$insert into public.obras (organizacao_id, cliente_id, nome, codigo) values (tests.uid('orgA'), tests.uid('cliA'), 'Casa 1', 'OB-1')$s$,
                     'editor insere obra');
select tests.igual(tests.afetadas($s$update public.obras set status = 'orcamento' where organizacao_id = tests.uid('orgA')$s$), 1::bigint, 'editor atualiza obra');
select tests.igual(tests.afetadas($s$update public.clientes set created_by = tests.uid('ownerB') where id = tests.uid('cliA')$s$), 1::bigint, 'update executa');
select tests.igual((select created_by from public.clientes where id = tests.uid('cliA')), tests.uid('editorA'), 'created_by imutável');
select tests.lanca($s$select public.convidar_membro(tests.uid('orgA'), 'y@ex.com', 'viewer')$s$, '42501', 'editor não convida');
select tests.lanca($s$select public.alterar_papel_membro(tests.uid('orgA'), auth.uid(), 'owner')$s$, '42501', 'editor não se promove a owner');
select tests.igual(tests.afetadas($s$update public.organizacoes set nome = 'X' where id = tests.uid('orgA')$s$), 0::bigint, 'editor não edita dados da organização');
select tests.igual(tests.conta('select 1 from public.auditoria_logs'), 0::bigint, 'editor não lê auditoria');
select tests.igual(tests.conta($s$select 1 from public.profiles$s$), 3::bigint, 'editor vê profiles dos membros da sua org (3)');

select tests.login(tests.uid('viewerA'));
select tests.igual(tests.conta('select 1 from public.clientes'), 1::bigint, 'viewer lê clientes da org');
select tests.igual(tests.conta('select 1 from public.obras'), 1::bigint, 'viewer lê obras da org');
select tests.lanca($s$insert into public.clientes (organizacao_id, nome) values (tests.uid('orgA'), 'V')$s$, '42501', 'viewer não insere cliente');
select tests.lanca($s$insert into public.obras (organizacao_id, nome) values (tests.uid('orgA'), 'V')$s$, '42501', 'viewer não insere obra');
select tests.igual(tests.afetadas($s$update public.clientes set nome = 'V'$s$), 0::bigint, 'viewer não atualiza cliente');
select tests.igual(tests.afetadas($s$delete from public.obras$s$), 0::bigint, 'viewer não exclui obra');
select tests.igual(tests.afetadas($s$update public.organizacao_membros set papel = 'owner' where user_id = auth.uid()$s$), 0::bigint,
                   'viewer não altera o próprio papel');
select tests.igual(tests.conta('select 1 from public.convites'), 1::bigint, 'viewer vê só o próprio convite, não os da org');
select tests.igual(tests.conta($s$select 1 from public.listar_membros(tests.uid('orgA'))$s$), 3::bigint, 'listar_membros para membro');

select tests.login(tests.uid('ownerB'));
select tests.igual(tests.conta('select 1 from public.organizacoes'), 1::bigint, 'owner B vê só a própria organização');
select tests.igual(tests.conta('select 1 from public.clientes'), 0::bigint, 'owner B não vê clientes da org A');
select tests.igual(tests.conta('select 1 from public.obras'), 0::bigint, 'owner B não vê obras da org A');
select tests.igual(tests.conta('select 1 from public.organizacao_membros'), 1::bigint, 'owner B não vê membros da org A');
select tests.igual(tests.conta($s$select 1 from public.profiles where id = tests.uid('ownerA')$s$), 0::bigint, 'owner B não vê profile de owner A');
select tests.lanca($s$insert into public.clientes (organizacao_id, nome) values (tests.uid('orgA'), 'Intruso')$s$, '42501', 'owner B não insere na org A');
select tests.igual(tests.afetadas($s$update public.clientes set nome = 'x' where id = tests.uid('cliA')$s$), 0::bigint, 'owner B não altera cliente da org A');
select tests.lanca($s$select * from public.listar_membros(tests.uid('orgA'))$s$, '42501', 'listar_membros nega não-membro');
select tests.igual(tests.afetadas($s$update public.clientes set organizacao_id = tests.uid('orgB') where id = tests.uid('cliA')$s$), 0::bigint, 'owner B não "puxa" cliente da org A');
select tests.executa($s$insert into public.clientes (organizacao_id, nome) values (tests.uid('orgB'), 'Cliente B')$s$, 'owner B insere na própria org');
select tests.lanca($s$insert into public.obras (organizacao_id, cliente_id, nome) values (tests.uid('orgB'), tests.uid('cliA'), 'Obra cruzada')$s$,
                   'P0001', 'obra não pode usar cliente de outra organização');

-- ═══ 8. Gestão de membros pelo owner ═════════════════════════════════════════
select tests.login(tests.uid('ownerA'));
select tests.igual(tests.conta('select 1 from public.convites'), 3::bigint, 'owner vê convites da org');
select tests.lanca($s$select public.alterar_papel_membro(tests.uid('orgA'), auth.uid(), 'editor')$s$, 'P0001', 'único owner não se rebaixa');
select tests.lanca($s$select public.remover_membro(tests.uid('orgA'), auth.uid())$s$, 'P0001', 'último owner não pode ser removido');
select tests.executa($s$select public.alterar_papel_membro(tests.uid('orgA'), tests.uid('viewerA'), 'editor')$s$, 'owner altera papel do membro');
select tests.igual((select papel::text from public.organizacao_membros where user_id = tests.uid('viewerA')), 'editor', 'papel alterado');
select tests.executa($s$select public.alterar_papel_membro(tests.uid('orgA'), tests.uid('viewerA'), 'viewer')$s$, 'owner volta papel para viewer');
select tests.igual(tests.afetadas($s$update public.organizacoes set nome = 'Escritório A Ltda' where id = tests.uid('orgA')$s$), 1::bigint, 'owner edita dados da organização');
select tests.lanca($s$update public.organizacoes set status = 'bloqueada' where id = tests.uid('orgA')$s$, '42501', 'owner não altera status da organização');
select tests.igual(tests.afetadas($s$delete from public.organizacoes where id = tests.uid('orgA')$s$), 0::bigint, 'owner não exclui organização');
select tests.ok(tests.conta('select 1 from public.auditoria_logs') > 0, 'owner lê auditoria da própria org');
select tests.igual(tests.conta($s$select 1 from public.auditoria_logs where organizacao_id is distinct from tests.uid('orgA')$s$), 0::bigint,
                   'owner não lê auditoria de outras orgs nem global');
select tests.lanca($s$insert into public.auditoria_logs (acao, entidade) values ('x', 'y')$s$, '42501', 'ninguém insere auditoria direto');
select tests.lanca($s$select public.registrar_auditoria('forjado', 'x')$s$, '42501', 'registrar_auditoria não é executável por authenticated');
select tests.lanca($s$delete from public.auditoria_logs$s$, '42501', 'ninguém exclui auditoria');

select tests.login(tests.uid('viewerA'));
select tests.lanca($s$select public.remover_membro(tests.uid('orgA'), tests.uid('editorA'))$s$, '42501', 'viewer não remove outro membro');
select tests.executa($s$select public.remover_membro(tests.uid('orgA'), auth.uid())$s$, 'membro pode sair da organização');
select tests.igual(tests.conta('select 1 from public.clientes'), 0::bigint, 'ex-membro perde acesso');
select tests.logout();
select tests.igual((select organizacao_ativa_id from public.profiles where id = tests.uid('viewerA')), null::uuid, 'org ativa limpa ao sair');

-- ═══ 9. Admin vê e altera tudo ═══════════════════════════════════════════════
select tests.login(tests.uid('admin'));
select tests.igual(tests.conta('select 1 from public.organizacoes'), 2::bigint, 'admin vê todas as organizações');
select tests.igual(tests.conta('select 1 from public.clientes'), 2::bigint, 'admin vê clientes de todas as orgs');
select tests.igual(tests.conta('select 1 from public.profiles'), 8::bigint, 'admin vê todos os profiles');
select tests.ok(tests.conta('select 1 from public.auditoria_logs') > 20, 'admin lê toda a auditoria');
select tests.igual(tests.conta('select 1 from public.configuracoes'), 6::bigint, 'admin vê todas as configurações');
select tests.executa($s$select public.admin_adicionar_membro(tests.uid('orgB'), tests.uid('viewerA'), 'viewer')$s$, 'admin_adicionar_membro');
select tests.lanca($s$select public.admin_adicionar_membro(tests.uid('orgB'), tests.uid('ownerB'), 'viewer')$s$, 'P0001', 'admin_adicionar_membro preserva ≥1 owner');
select tests.igual((select (public.admin_estatisticas() ->> 'organizacoes_total')::int), 2, 'admin_estatisticas organizacoes_total');
select tests.igual((select (public.admin_estatisticas() ->> 'obras_total')::int), 1, 'admin_estatisticas obras_total');
select tests.ok((select public.admin_estatisticas() ? 'ultima_data_base'), 'admin_estatisticas tem ultima_data_base (sem B2: null)');
select tests.lanca($s$select public.admin_definir_configuracao('cadastro_aberto', '"sim"')$s$, 'P0001', 'configuração validada por tipo');
select tests.executa($s$select public.admin_definir_configuracao('aviso_global', '"Manutenção sábado"')$s$, 'admin define aviso_global');
select tests.ok((select count(*) = 1 from public.auditoria_logs where acao = 'config'), 'auditoria config');
select tests.executa($s$select public.admin_definir_status_organizacao(tests.uid('orgA'), 'bloqueada')$s$, 'admin bloqueia organização');

-- ═══ 10. Organização bloqueada / usuário bloqueado ═══════════════════════════
select tests.login(tests.uid('editorA'));
select tests.igual(tests.conta('select 1 from public.clientes'), 1::bigint, 'org bloqueada: membro ainda lê');
select tests.lanca($s$insert into public.clientes (organizacao_id, nome) values (tests.uid('orgA'), 'Novo')$s$, '42501', 'org bloqueada: editor não escreve');
select tests.ok(not public.can_edit_org(tests.uid('orgA')), 'can_edit_org false com org bloqueada');
select tests.login(tests.uid('admin'));
select public.admin_definir_status_organizacao(tests.uid('orgA'), 'ativa');
select public.admin_definir_status_usuario(tests.uid('editorA'), 'blocked', 'Teste');
select tests.igual((select motivo_bloqueio from public.profiles where id = tests.uid('editorA')), 'Teste', 'motivo_bloqueio gravado');
select tests.login(tests.uid('editorA'));
select tests.igual(tests.conta('select 1 from public.clientes'), 0::bigint, 'usuário bloqueado não lê dados da org');
select tests.igual(tests.conta('select 1 from public.profiles'), 1::bigint, 'usuário bloqueado vê só o próprio profile');
select tests.ok(public.org_papel(tests.uid('orgA')) is null, 'org_papel null para bloqueado');

-- ═══ 11. anon ════════════════════════════════════════════════════════════════
select tests.login_anon();
select tests.igual(tests.conta('select 1 from public.configuracoes'), 4::bigint, 'anon lê só configurações públicas');
select tests.lanca('select 1 from public.profiles', '42501', 'anon sem acesso a profiles');
select tests.lanca('select 1 from public.clientes', '42501', 'anon sem acesso a clientes');
select tests.lanca('select public.is_admin()', '42501', 'anon não executa helpers');
select tests.lanca($s$select public.criar_organizacao('x')$s$, '42501', 'anon não executa RPC');

-- ═══ 12. admin_emails e cadastro fechado ═════════════════════════════════════
select tests.login(tests.uid('admin'));
select public.admin_definir_configuracao('admin_emails', '["Chefe@Ex.com"]');
select public.admin_definir_configuracao('cadastro_aberto', 'false');
select tests.login(tests.uid('ownerA'));
select tests.set('convNovo', public.convidar_membro(tests.uid('orgA'), 'novo@ex.com', 'viewer')::text);
select tests.logout();
select tests.novo_usuario('chefe', 'chefe@ex.com');
select tests.igual((select papel_global::text || '/' || status from public.profiles where id = tests.uid('chefe')), 'admin/active', 'e-mail em admin_emails vira admin');
select tests.lanca($s$select tests.novo_usuario('estranho', 'estranho@ex.com')$s$, 'P0001', 'cadastro fechado rejeita sem convite');
select tests.executa($s$select tests.novo_usuario('novo', 'novo@ex.com')$s$, 'cadastro fechado aceita convidado');
select tests.igual((select papel_global::text from public.profiles where id = tests.uid('novo')), 'user', 'convidado não vira admin');

-- ═══ 13. Sincronização de e-mail e registrar_acesso ══════════════════════════
update auth.users set email = 'Fora.Novo@ex.com' where id = tests.uid('fora');
select tests.igual((select email::text from public.profiles where id = tests.uid('fora')), 'fora.novo@ex.com', 'e-mail sincronizado de auth.users');
select tests.login(tests.uid('fora'));
select public.registrar_acesso();
select public.registrar_acesso();
select tests.logout();
select tests.igual((select count(*) from public.auditoria_logs where acao = 'login' and user_id = tests.uid('fora')), 1::bigint,
                   'registrar_acesso: no máx. 1 login por hora');
select tests.ok((select ultimo_acesso_em is not null from public.profiles where id = tests.uid('fora')), 'ultimo_acesso_em atualizado');

-- ═══ 14. Storage ═════════════════════════════════════════════════════════════
select tests.igual((select count(*) from storage.buckets where id in ('logos', 'avatares', 'sinapi-arquivos') and not public), 3::bigint,
                   'buckets privados criados');
select tests.login(tests.uid('ownerA'));
select tests.executa(format($s$insert into storage.objects (bucket_id, name) values ('logos', '%s/logo.png')$s$, tests.get('orgA')), 'owner envia logo da org');
select tests.lanca(format($s$insert into storage.objects (bucket_id, name) values ('logos', '%s/outro.exe')$s$, tests.get('orgA')), '42501', 'nome de arquivo de logo restrito');
select tests.lanca(format($s$insert into storage.objects (bucket_id, name) values ('logos', '%s/logo.png')$s$, tests.get('orgB')), '42501', 'owner A não envia logo da org B');
select tests.executa(format($s$insert into storage.objects (bucket_id, name) values ('avatares', '%s/avatar.jpg')$s$, tests.get('ownerA')), 'usuário envia o próprio avatar');
select tests.lanca(format($s$insert into storage.objects (bucket_id, name) values ('avatares', '%s/avatar.jpg')$s$, tests.get('ownerB')), '42501', 'não envia avatar de outro usuário');
select tests.lanca($s$insert into storage.objects (bucket_id, name) values ('sinapi-arquivos', '2026/09/RJ/a.xlsx')$s$, '42501', 'não-admin não envia arquivo SINAPI');
select tests.login(tests.uid('ownerB'));
select tests.igual(tests.conta($s$select 1 from storage.objects where bucket_id = 'logos'$s$), 0::bigint, 'não-membro não lê logo da org A');
select tests.igual(tests.conta($s$select 1 from storage.objects where bucket_id = 'avatares'$s$), 1::bigint, 'usuário ativo lê avatares');
select tests.igual(tests.afetadas($s$delete from storage.objects where bucket_id = 'avatares'$s$), 0::bigint, 'não exclui avatar alheio');
select tests.login(tests.uid('novo'));
select tests.igual(tests.conta($s$select 1 from storage.objects where bucket_id = 'avatares'$s$), 0::bigint, 'usuário pendente não lê avatares');
select tests.login(tests.uid('admin'));
select tests.executa($s$insert into storage.objects (bucket_id, name) values ('sinapi-arquivos', '2026/09/RJ/a.xlsx')$s$, 'admin envia arquivo SINAPI');
select tests.igual(tests.conta($s$select 1 from storage.objects where bucket_id = 'logos'$s$), 1::bigint, 'admin lê logos');

select tests.logout();

-- ═══ 15. Helpers nunca retornam null (regressão) ═════════════════════════════
select tests.login(tests.uid('ownerB'));
select tests.ok(public.is_org_owner(tests.uid('orgA')) is false, 'is_org_owner = false (não null) para não-membro');
select tests.ok(public.can_edit_org(tests.uid('orgA')) is false, 'can_edit_org = false (não null) para não-membro');
select tests.ok(public.is_org_member(tests.uid('orgA')) is false, 'is_org_member = false (não null) para não-membro');
select tests.ok(public.can_edit_org(null) is false, 'can_edit_org(null) = false');
select tests.lanca($s$select public.assert_pode_editar(tests.uid('orgA'))$s$, '42501', 'assert_pode_editar lança para não-membro');
select tests.lanca($s$select public.assert_admin()$s$, '42501', 'assert_admin lança para não-admin');
select tests.lanca($s$select public.alterar_papel_membro(tests.uid('orgA'), tests.uid('editorA'), 'viewer')$s$, '42501', 'owner B não altera papéis na org A');
select tests.lanca($s$select public.remover_membro(tests.uid('orgA'), tests.uid('editorA'))$s$, '42501', 'owner B não remove membros da org A');
select tests.lanca($s$select public.revogar_convite(tests.uid('convNovo'))$s$, '42501', 'owner B não revoga convite da org A');
select tests.logout();
