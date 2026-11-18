-- ============================================================================
-- 0031 — Endurecimento de segurança (REVISÃO FINAL)
--
-- 1. search_path das funções do schema public:
--    * As funções de B2 (0010–0022) foram criadas com `set search_path = public`. Nessa forma o
--      schema temporária da sessão (pg_temp) é pesquisado ANTES de public para tabelas, o que em
--      tese permitiria a uma sessão com acesso SQL direto "sombrear" uma tabela dentro de uma
--      função SECURITY DEFINER. Fixamos `public, pg_temp` (pg_temp por último, recomendação da
--      documentação do PostgreSQL para SECURITY DEFINER).
--    * Funções puras sem search_path (alerta `function_search_path_mutable` do Supabase advisor)
--      recebem o mesmo valor fixo.
--    As funções de B1 (search_path = '') não são tocadas.
-- 2. EXECUTE: o Supabase concede EXECUTE a `anon` em toda função nova. Nenhuma RPC do Pretium é
--    usada sem login, então revogamos de anon/public todas as funções do schema public e
--    mudamos o privilégio padrão para as próximas migrações.
-- 3. CREATE no schema public continua negado a anon/authenticated (0001); reforçado aqui.
-- ============================================================================

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind in ('f', 'p')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and (p.proconfig is null or 'search_path=public' = any (p.proconfig))
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.assinatura);
  end loop;
end $$;

-- Revoga de anon/PUBLIC preservando exatamente o acesso atual de authenticated e service_role
-- (em bancos sem os privilégios padrão do Supabase, como o PGlite dos testes, ele vem de PUBLIC).
do $$
declare
  r record;
  v_auth boolean;
  v_svc boolean;
  v_tem_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
  v_tem_svc boolean := exists (select 1 from pg_roles where rolname = 'service_role');
  v_tem_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
begin
  for r in
    select p.oid, p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    v_auth := v_tem_auth and has_function_privilege('authenticated', r.oid, 'EXECUTE');
    v_svc := v_tem_svc and has_function_privilege('service_role', r.oid, 'EXECUTE');
    execute format('revoke execute on function %s from public', r.assinatura);
    if v_tem_anon then
      execute format('revoke execute on function %s from anon', r.assinatura);
    end if;
    if v_auth then
      execute format('grant execute on function %s to authenticated', r.assinatura);
    end if;
    if v_svc then
      execute format('grant execute on function %s to service_role', r.assinatura);
    end if;
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'alter default privileges in schema public revoke execute on functions from anon';
    execute 'revoke create on schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke create on schema public from authenticated';
  end if;
  execute 'alter default privileges in schema public revoke execute on functions from public';
end $$;
