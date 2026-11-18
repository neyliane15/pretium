-- ============================================================================
-- Utilitários de teste do núcleo (BACKEND-1). Carregado pelo core_run.mjs
-- depois do stub e das migrações, antes de cada arquivo core_*.test.sql.
-- ============================================================================
create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create table tests.resultados (
  n          serial primary key,
  ok         boolean not null,
  descricao  text not null,
  detalhe    text
);
grant all on tests.resultados to anon, authenticated, service_role;
grant all on sequence tests.resultados_n_seq to anon, authenticated, service_role;

create table tests.ctx (chave text primary key, valor text);
grant all on tests.ctx to anon, authenticated, service_role;

-- Guarda/recupera valores entre blocos (ex.: ids criados).
create function tests.set(p_chave text, p_valor text) returns void language sql as $$
  insert into tests.ctx values (p_chave, p_valor) on conflict (chave) do update set valor = excluded.valor;
$$;
create function tests.get(p_chave text) returns text language sql stable as $$
  select valor from tests.ctx where chave = p_chave;
$$;
create function tests.uid(p_chave text) returns uuid language sql stable as $$
  select valor::uuid from tests.ctx where chave = p_chave;
$$;

create function tests.ok(p_cond boolean, p_desc text, p_detalhe text default null) returns void
language plpgsql as $$
begin
  insert into tests.resultados (ok, descricao, detalhe) values (coalesce(p_cond, false), p_desc, p_detalhe);
end $$;

create function tests.igual(p_obtido anyelement, p_esperado anyelement, p_desc text) returns void
language plpgsql as $$
begin
  insert into tests.resultados (ok, descricao, detalhe)
  values (p_obtido is not distinct from p_esperado, p_desc,
          format('obtido=%s esperado=%s', p_obtido, p_esperado));
end $$;

-- Executa p_sql e espera erro com p_errcode (null = qualquer erro).
create function tests.lanca(p_sql text, p_errcode text, p_desc text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    insert into tests.resultados (ok, descricao, detalhe)
    values (p_errcode is null or sqlstate = p_errcode, p_desc, sqlstate || ': ' || sqlerrm);
    return;
  end;
  insert into tests.resultados (ok, descricao, detalhe) values (false, p_desc, 'não lançou erro');
end $$;

-- Executa p_sql e espera sucesso.
create function tests.executa(p_sql text, p_desc text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    insert into tests.resultados (ok, descricao, detalhe) values (false, p_desc, sqlstate || ': ' || sqlerrm);
    return;
  end;
  insert into tests.resultados (ok, descricao) values (true, p_desc);
end $$;

-- Linhas afetadas por um UPDATE/DELETE (RLS silenciosa ⇒ 0).
create function tests.afetadas(p_sql text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  execute p_sql;
  get diagnostics v = row_count;
  return v;
end $$;

create function tests.conta(p_sql text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  execute 'select count(*) from (' || p_sql || ') s' into v;
  return v;
end $$;

-- Simula requisição PostgREST de um usuário autenticado.
create function tests.login(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', false);
  perform set_config('request.jwt.claim.sub', p_user::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;

create function tests.login_anon() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', false);
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'anon', false);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, false);
  perform set_config('role', 'anon', false);
end $$;

-- Volta ao superusuário sem JWT (contexto de migração/SQL editor).
create function tests.logout() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', false);
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.jwt.claims', '', false);
end $$;

-- Cria usuário em auth.users (dispara handle_new_user) e guarda o id em ctx.
create function tests.novo_usuario(p_chave text, p_email text, p_nome text default null) returns uuid
language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v, p_email, jsonb_build_object('nome', coalesce(p_nome, p_chave)));
  perform tests.set(p_chave, v::text);
  return v;
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
