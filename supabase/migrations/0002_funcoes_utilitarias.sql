-- ============================================================================
-- 0002 — Funções utilitárias e auditoria (BACKEND-1)
-- Contrato: docs/ARQUITETURA.md §5.2 (auditoria_logs), §6.2
-- ============================================================================

-- ─── updated_at ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger BEFORE UPDATE: mantém updated_at = now().';

-- ─── created_by ─────────────────────────────────────────────────────────────
-- Garante que created_by reflita quem de fato criou o registro e não mude depois.
-- (Sem JWT — ex.: migrações/SQL editor — mantém o valor informado.)
create or replace function public.fn_define_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

-- ─── Auditoria ──────────────────────────────────────────────────────────────
create table public.auditoria_logs (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  user_id         uuid null,
  user_email      extensions.citext null,
  organizacao_id  uuid null,
  acao            text not null,
  entidade        text not null,
  entidade_id     text null,
  dados_antes     jsonb null,
  dados_depois    jsonb null,
  detalhes        jsonb null
);

comment on table public.auditoria_logs is
  'Trilha de auditoria. Somente leitura via RLS; inserção apenas por funções security definer.';

create index auditoria_logs_created_at_idx      on public.auditoria_logs (created_at desc);
create index auditoria_logs_org_created_at_idx  on public.auditoria_logs (organizacao_id, created_at desc);
create index auditoria_logs_entidade_idx        on public.auditoria_logs (entidade, entidade_id);
create index auditoria_logs_user_id_idx         on public.auditoria_logs (user_id);

-- E-mail do usuário corrente (auth.users), para snapshot na auditoria.
create or replace function public.fn_email_usuario_atual()
returns extensions.citext
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::extensions.citext from auth.users u where u.id = auth.uid();
$$;

-- registrar_auditoria: uso interno (chamada de dentro de funções security definer
-- e de triggers). NÃO é exposta a anon/authenticated para impedir forjar registros.
create or replace function public.registrar_auditoria(
  p_acao           text,
  p_entidade       text,
  p_entidade_id    text  default null,
  p_detalhes       jsonb default null,
  p_organizacao_id uuid  default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.auditoria_logs (user_id, user_email, organizacao_id, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), public.fn_email_usuario_atual(), p_organizacao_id, p_acao, p_entidade, p_entidade_id, p_detalhes);
end;
$$;

-- Trigger genérico de auditoria (AFTER INSERT/UPDATE/DELETE ... FOR EACH ROW).
--  * acao = lower(TG_OP); entidade = nome da tabela;
--  * entidade_id = id | user_id | chave da linha (o que existir);
--  * organizacao_id = coluna organizacao_id da linha (ou id, na tabela organizacoes);
--  * UPDATE sem mudança efetiva não gera registro.
create or replace function public.fn_auditoria_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes  jsonb;
  v_depois jsonb;
  v_ref    jsonb;
  v_org    uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_antes  := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_depois := to_jsonb(new); end if;

  if tg_op = 'UPDATE' and v_antes = v_depois then
    return null;
  end if;

  v_ref := coalesce(v_depois, v_antes);

  if tg_table_schema = 'public' and tg_table_name = 'organizacoes' then
    v_org := (v_ref ->> 'id')::uuid;
  elsif v_ref ? 'organizacao_id' then
    v_org := nullif(v_ref ->> 'organizacao_id', '')::uuid;
  end if;

  insert into public.auditoria_logs
    (user_id, user_email, organizacao_id, acao, entidade, entidade_id, dados_antes, dados_depois)
  values
    (auth.uid(), public.fn_email_usuario_atual(), v_org, lower(tg_op), tg_table_name,
     coalesce(v_ref ->> 'id', v_ref ->> 'user_id', v_ref ->> 'chave'),
     v_antes, v_depois);

  return null;
end;
$$;

comment on function public.fn_auditoria_trigger() is
  'Trigger AFTER genérico de auditoria (B1). Uso: create trigger x_auditoria after insert or update or delete on T for each row execute function public.fn_auditoria_trigger();';

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on function public.set_updated_at()        from public;
revoke all on function public.fn_define_created_by()  from public;
revoke all on function public.fn_auditoria_trigger()  from public;
revoke all on function public.fn_email_usuario_atual() from public;
revoke all on function public.registrar_auditoria(text, text, text, jsonb, uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.set_updated_at() from anon, authenticated';
    execute 'revoke all on function public.fn_define_created_by() from anon, authenticated';
    execute 'revoke all on function public.fn_auditoria_trigger() from anon, authenticated';
    execute 'revoke all on function public.fn_email_usuario_atual() from anon, authenticated';
    execute 'revoke all on function public.registrar_auditoria(text, text, text, jsonb, uuid) from anon, authenticated';
    execute 'grant execute on function public.registrar_auditoria(text, text, text, jsonb, uuid) to service_role';
  end if;
end $$;
