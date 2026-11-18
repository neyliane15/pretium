-- PRETIUM — Definir o(s) administrador(es)
-- Rode ANTES de qualquer pessoa se cadastrar no sistema.
-- Troque o e-mail abaixo pelo seu. Pode colocar mais de um: '["a@x.com","b@x.com"]'
update public.configuracoes
   set valor = '["seu-email@empresa.com.br"]'::jsonb
 where chave = 'admin_emails';

-- Confira:
select chave, valor from public.configuracoes where chave in ('admin_emails','cadastro_aberto');
