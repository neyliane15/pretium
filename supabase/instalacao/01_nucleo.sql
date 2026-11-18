-- PRETIUM — Instalação pelo SQL Editor do Supabase
-- PARTE 1 de 3 — núcleo: usuários, organizações, permissões, clientes, obras, storage, admin
-- Gerado a partir de supabase/migrations. Rode as partes NA ORDEM, cada uma uma única vez.

-- ===== 0001_extensoes_enums.sql =====
-- ============================================================================
-- 0001 — Extensões e enums do núcleo (BACKEND-1)
-- Contrato: docs/ARQUITETURA.md §4, §5.1
--
-- Extensões ficam no schema `extensions` (padrão Supabase). Referencie-as
-- qualificadas: extensions.citext, extensions.unaccent(...), extensions.gin_trgm_ops.
-- ============================================================================

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext   with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Ninguém além do dono cria objetos em public (evita sequestro de nomes por
-- funções/tabelas homônimas criadas por usuários comuns).
revoke create on schema public from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke create on schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke create on schema public from authenticated';
  end if;
end $$;

-- ─── Enums ──────────────────────────────────────────────────────────────────
create type public.app_role           as enum ('admin', 'user');
create type public.user_status        as enum ('pending', 'active', 'blocked');
create type public.org_role           as enum ('owner', 'editor', 'viewer');
create type public.org_status         as enum ('ativa', 'bloqueada');
create type public.invite_status      as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.pessoa_tipo        as enum ('PF', 'PJ');
create type public.obra_status        as enum ('planejamento', 'orcamento', 'em_execucao', 'paralisada', 'concluida', 'cancelada');
-- Usado por organizacoes.regime_padrao (B1) e por datas_base etc. (B2).
create type public.regime_desoneracao as enum ('nao_desonerado', 'desonerado');

-- ===== 0002_funcoes_utilitarias.sql =====
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

-- ===== 0003_profiles_configuracoes.sql =====
-- ============================================================================
-- 0003 — profiles, configuracoes, handle_new_user, proteção de campos (BACKEND-1)
-- Contrato: docs/ARQUITETURA.md §5.2, §7.1
-- ============================================================================

-- ─── configuracoes ──────────────────────────────────────────────────────────
create table public.configuracoes (
  chave       text primary key,
  valor       jsonb not null,
  descricao   text null,
  publica     boolean not null default false,
  updated_by  uuid null,
  updated_at  timestamptz not null default now(),
  constraint configuracoes_updated_by_fkey foreign key (updated_by) references auth.users (id) on delete set null
);

insert into public.configuracoes (chave, valor, descricao, publica) values
  ('admin_emails',          '[]'::jsonb,   'E-mails que viram administradores ao se cadastrar (minúsculas). Se não vazio, SOMENTE estes viram admin.', false),
  ('aprovacao_obrigatoria', 'true'::jsonb, 'Novos usuários entram como pendentes até aprovação de um administrador.', true),
  ('cadastro_aberto',       'true'::jsonb, 'Permite novos cadastros (convidados e e-mails de admin_emails sempre podem se cadastrar).', true),
  ('uf_padrao',             '"RJ"'::jsonb, 'UF padrão para novas organizações e obras.', true),
  ('aviso_global',          'null'::jsonb, 'Mensagem exibida em faixa no topo do sistema (null = sem aviso).', true),
  ('convite_validade_dias', '7'::jsonb,    'Validade dos convites, em dias.', false);

create or replace function public.fn_configuracoes_before()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger configuracoes_before
  before insert or update on public.configuracoes
  for each row execute function public.fn_configuracoes_before();

create trigger configuracoes_auditoria
  after insert or update or delete on public.configuracoes
  for each row execute function public.fn_auditoria_trigger();

-- Leitura interna de configuração (security definer: ignora RLS).
create or replace function public.fn_config(p_chave text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select c.valor from public.configuracoes c where c.chave = p_chave;
$$;

-- ─── profiles ───────────────────────────────────────────────────────────────
create table public.profiles (
  id                    uuid primary key,
  email                 extensions.citext not null,
  nome                  text not null default '',
  telefone              text null,
  crea_cau              text null,
  avatar_path           text null,
  papel_global          public.app_role not null default 'user',
  status                public.user_status not null default 'pending',
  motivo_bloqueio       text null,
  organizacao_ativa_id  uuid null,           -- FK adicionada em 0004
  tema                  text not null default 'system',
  ultimo_acesso_em      timestamptz null,
  aprovado_por          uuid null,
  aprovado_em           timestamptz null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint profiles_id_fkey           foreign key (id) references auth.users (id) on delete cascade,
  constraint profiles_aprovado_por_fkey foreign key (aprovado_por) references auth.users (id) on delete set null,
  constraint profiles_email_key         unique (email),
  constraint profiles_tema_check        check (tema in ('light', 'dark', 'system')),
  constraint profiles_nome_tamanho      check (char_length(nome) <= 200)
);

create index profiles_status_idx       on public.profiles (status);
create index profiles_papel_global_idx on public.profiles (papel_global);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auditoria apenas de mudanças de status/papel_global (§2.2 da divisão).
create trigger profiles_auditoria
  after update on public.profiles
  for each row
  when (old.status is distinct from new.status or old.papel_global is distinct from new.papel_global)
  execute function public.fn_auditoria_trigger();

-- Contexto privilegiado = sem JWT de usuário final (migração, SQL editor, GoTrue)
-- ou JWT de service_role. Usado pelas travas de colunas sensíveis.
create or replace function public.fn_contexto_privilegiado()
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_role text;
begin
  v_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  if v_role = 'service_role' then
    return true;
  end if;
  return v_role is null
     and auth.uid() is null
     and current_user not in ('anon', 'authenticated');
end;
$$;

-- Bloqueia escalonamento de privilégio: só admin (ou contexto privilegiado)
-- altera papel_global, status, motivo_bloqueio, aprovado_por, aprovado_em, email.
create or replace function public.fn_profiles_protege_campos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Não é permitido alterar o identificador do perfil' using errcode = '42501';
  end if;

  -- Sincronização de e-mail feita pelo trigger em auth.users.
  if coalesce(current_setting('pretium.sync_email', true), '') = 'on' then
    return new;
  end if;

  if (new.papel_global    is distinct from old.papel_global
   or new.status          is distinct from old.status
   or new.motivo_bloqueio is distinct from old.motivo_bloqueio
   or new.aprovado_por    is distinct from old.aprovado_por
   or new.aprovado_em     is distinct from old.aprovado_em
   or new.email::text     is distinct from old.email::text)
   and not public.is_admin()
   and not public.fn_contexto_privilegiado()
  then
    raise exception 'Somente administradores podem alterar este campo do perfil' using errcode = '42501';
  end if;

  -- Organização ativa precisa ser uma organização da qual o usuário participa.
  if new.organizacao_ativa_id is not null
     and new.organizacao_ativa_id is distinct from old.organizacao_ativa_id
     and not public.fn_contexto_privilegiado()
     and not public.is_admin()
     and not exists (
       select 1 from public.organizacao_membros m
        where m.organizacao_id = new.organizacao_ativa_id and m.user_id = new.id
     )
  then
    raise exception 'Você não participa desta organização' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_protege_campos
  before update on public.profiles
  for each row execute function public.fn_profiles_protege_campos();

-- ─── Criação de perfil no cadastro ──────────────────────────────────────────
-- Regras (§7.1, com endurecimento registrado em CONTRATO_ALTERACOES):
--  1. cria profiles(id, email, nome = raw_user_meta_data->>'nome');
--  2. vira admin/ativo se lower(email) ∈ admin_emails; se admin_emails estiver VAZIO,
--     o primeiro usuário (nenhum admin existente) vira admin/ativo;
--  3. senão status = pending se aprovacao_obrigatoria, senão active;
--  4. com cadastro_aberto = false, só admin_emails, primeiro admin ou quem tem
--     convite pendente conseguem se cadastrar.
--  Nunca lê papel/status de raw_user_meta_data (controlado pelo usuário).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email         text := lower(coalesce(new.email, new.id::text || '@sem-email.invalid'));
  v_nome          text;
  v_admin_emails  jsonb;
  v_lista_vazia   boolean;
  v_em_lista      boolean;
  v_existe_admin  boolean;
  v_aprovacao     boolean;
  v_cadastro      boolean;
  v_tem_convite   boolean;
  v_admin         boolean;
  v_status        public.user_status;
begin
  -- Serializa cadastros simultâneos (regra do primeiro admin).
  perform pg_advisory_xact_lock(hashtext('pretium.handle_new_user'));

  v_nome := left(btrim(coalesce(new.raw_user_meta_data ->> 'nome', new.raw_user_meta_data ->> 'full_name', '')), 200);

  v_admin_emails := coalesce(public.fn_config('admin_emails'), '[]'::jsonb);
  if jsonb_typeof(v_admin_emails) <> 'array' then
    v_admin_emails := '[]'::jsonb;
  end if;
  v_lista_vazia := jsonb_array_length(v_admin_emails) = 0;
  v_em_lista := exists (
    select 1 from jsonb_array_elements_text(v_admin_emails) e where lower(btrim(e)) = v_email
  );
  v_existe_admin := exists (select 1 from public.profiles p where p.papel_global = 'admin');

  v_admin := v_em_lista or (v_lista_vazia and not v_existe_admin);

  v_aprovacao := coalesce((public.fn_config('aprovacao_obrigatoria'))::text, 'true') <> 'false';
  v_cadastro  := coalesce((public.fn_config('cadastro_aberto'))::text, 'true') <> 'false';

  if not v_admin and not v_cadastro then
    v_tem_convite := exists (
      select 1 from public.convites c
       where lower(c.email::text) = v_email and c.status = 'pending' and c.expira_em > now()
    );
    if not v_tem_convite then
      raise exception 'Cadastro fechado. Solicite um convite ao administrador.' using errcode = 'P0001';
    end if;
  end if;

  if v_admin then
    v_status := 'active';
  elsif v_aprovacao then
    v_status := 'pending';
  else
    v_status := 'active';
  end if;

  insert into public.profiles (id, email, nome, papel_global, status, aprovado_em)
  values (
    new.id, v_email, v_nome,
    case when v_admin then 'admin'::public.app_role else 'user'::public.app_role end,
    v_status,
    case when v_status = 'active' then now() else null end
  );

  insert into public.auditoria_logs (user_id, user_email, acao, entidade, entidade_id, detalhes)
  values (new.id, v_email, 'cadastro', 'profiles', new.id::text,
          jsonb_build_object('papel_global', case when v_admin then 'admin' else 'user' end, 'status', v_status));

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantém profiles.email em sincronia com auth.users.email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    perform set_config('pretium.sync_email', 'on', true);
    update public.profiles set email = lower(new.email) where id = new.id;
    perform set_config('pretium.sync_email', '', true);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ─── Grants (funções internas) ──────────────────────────────────────────────
revoke all on function public.fn_configuracoes_before()   from public, anon, authenticated;
revoke all on function public.fn_config(text)             from public, anon, authenticated;
revoke all on function public.fn_contexto_privilegiado()  from public, anon;
-- Chamada (como invoker) pelos triggers de proteção disparados por UPDATEs do usuário.
grant execute on function public.fn_contexto_privilegiado() to authenticated, service_role;
revoke all on function public.fn_profiles_protege_campos() from public, anon, authenticated;
revoke all on function public.handle_new_user()           from public, anon, authenticated;
revoke all on function public.handle_user_email_change()  from public, anon, authenticated;

-- ===== 0004_organizacoes_membros_convites.sql =====
-- ============================================================================
-- 0004 — organizacoes, organizacao_membros, convites (BACKEND-1)
-- Contrato: docs/ARQUITETURA.md §5.2
-- ============================================================================

-- ─── organizacoes ───────────────────────────────────────────────────────────
create table public.organizacoes (
  id                   uuid primary key default gen_random_uuid(),
  nome                 text not null,
  razao_social         text null,
  cnpj                 text null,
  email                extensions.citext null,
  telefone             text null,
  site                 text null,
  cep                  text null,
  logradouro           text null,
  numero               text null,
  complemento          text null,
  bairro               text null,
  municipio            text null,
  uf                   char(2) null,
  logo_path            text null,
  uf_padrao            char(2) not null default 'RJ',
  regime_padrao        public.regime_desoneracao not null default 'nao_desonerado',
  responsavel_tecnico  text null,
  crea_cau             text null,
  status               public.org_status not null default 'ativa',
  created_by           uuid null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint organizacoes_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null,
  constraint organizacoes_nome_check      check (char_length(btrim(nome)) between 1 and 200),
  constraint organizacoes_cnpj_check      check (cnpj ~ '^\d{14}$'),
  constraint organizacoes_uf_check        check (uf ~ '^[A-Z]{2}$'),
  constraint organizacoes_uf_padrao_check check (uf_padrao ~ '^[A-Z]{2}$')
);

create index organizacoes_nome_trgm_idx on public.organizacoes using gin (nome extensions.gin_trgm_ops);

-- Normalização: CNPJ só dígitos, vazios → null, UF maiúscula.
create or replace function public.fn_organizacoes_normaliza()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome      := btrim(new.nome);
  new.cnpj      := nullif(regexp_replace(coalesce(new.cnpj, ''), '\D', '', 'g'), '');
  new.email     := nullif(btrim(coalesce(new.email::text, '')), '');
  new.uf        := nullif(upper(btrim(coalesce(new.uf, ''))), '');
  new.uf_padrao := upper(btrim(new.uf_padrao));
  return new;
end;
$$;

-- Só admin (ou contexto privilegiado) altera status da organização.
create or replace function public.fn_organizacoes_protege_campos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and not public.is_admin() and not public.fn_contexto_privilegiado() then
    raise exception 'Somente administradores podem alterar a situação da organização' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organizacoes_normaliza   before insert or update on public.organizacoes
  for each row execute function public.fn_organizacoes_normaliza();
create trigger organizacoes_created_by  before insert or update on public.organizacoes
  for each row execute function public.fn_define_created_by();
create trigger organizacoes_protege     before update on public.organizacoes
  for each row execute function public.fn_organizacoes_protege_campos();
create trigger organizacoes_updated_at  before update on public.organizacoes
  for each row execute function public.set_updated_at();
create trigger organizacoes_auditoria   after insert or update or delete on public.organizacoes
  for each row execute function public.fn_auditoria_trigger();

-- FK da organização ativa do perfil.
alter table public.profiles
  add constraint profiles_organizacao_ativa_id_fkey
  foreign key (organizacao_ativa_id) references public.organizacoes (id) on delete set null;

-- ─── organizacao_membros ────────────────────────────────────────────────────
create table public.organizacao_membros (
  organizacao_id  uuid not null,
  user_id         uuid not null,
  papel           public.org_role not null default 'viewer',
  convidado_por   uuid null,
  created_at      timestamptz not null default now(),
  constraint organizacao_membros_pkey primary key (organizacao_id, user_id),
  constraint organizacao_membros_organizacao_id_fkey
    foreign key (organizacao_id) references public.organizacoes (id) on delete cascade,
  constraint organizacao_membros_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  -- segunda FK para permitir o embed profiles(*) no PostgREST
  constraint organizacao_membros_user_id_profiles_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade,
  constraint organizacao_membros_convidado_por_fkey
    foreign key (convidado_por) references auth.users (id) on delete set null
);

create index organizacao_membros_user_id_idx on public.organizacao_membros (user_id);

create trigger organizacao_membros_auditoria after insert or update or delete on public.organizacao_membros
  for each row execute function public.fn_auditoria_trigger();

-- Ao sair da organização, limpa a organização ativa do perfil.
create or replace function public.fn_membros_limpa_org_ativa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set organizacao_ativa_id = null
   where id = old.user_id and organizacao_ativa_id = old.organizacao_id;
  return null;
end;
$$;

create trigger organizacao_membros_limpa_org_ativa after delete on public.organizacao_membros
  for each row execute function public.fn_membros_limpa_org_ativa();

-- ─── convites ───────────────────────────────────────────────────────────────
create table public.convites (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null,
  email           extensions.citext not null,
  papel           public.org_role not null default 'editor',
  token           uuid not null default gen_random_uuid(),
  status          public.invite_status not null default 'pending',
  convidado_por   uuid null default auth.uid(),
  expira_em       timestamptz not null default (now() + interval '7 days'),
  aceito_por      uuid null,
  aceito_em       timestamptz null,
  created_at      timestamptz not null default now(),
  constraint convites_organizacao_id_fkey foreign key (organizacao_id) references public.organizacoes (id) on delete cascade,
  constraint convites_convidado_por_fkey  foreign key (convidado_por)  references auth.users (id) on delete set null,
  constraint convites_aceito_por_fkey     foreign key (aceito_por)     references auth.users (id) on delete set null,
  constraint convites_token_key           unique (token),
  constraint convites_email_check         check (email::text ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create unique index convites_pendente_unico on public.convites (organizacao_id, email) where status = 'pending';
create index convites_email_idx on public.convites (email);

create trigger convites_auditoria after insert or update or delete on public.convites
  for each row execute function public.fn_auditoria_trigger();

revoke all on function public.fn_organizacoes_normaliza()      from public, anon, authenticated;
revoke all on function public.fn_organizacoes_protege_campos() from public, anon, authenticated;
revoke all on function public.fn_membros_limpa_org_ativa()     from public, anon, authenticated;

-- ===== 0005_helpers_permissao.sql =====
-- ============================================================================
-- 0005 — Funções auxiliares de permissão (BACKEND-1)
-- Contrato: docs/ARQUITETURA.md §6.2 — assinaturas ESTÁVEIS (usadas pelo B2).
--
-- Todas: stable, security definer, search_path vazio, nomes qualificados.
-- Booleanas NUNCA retornam null (seguro em `if not ...` de plpgsql).
-- Usuário pending/blocked ⇒ false (org_papel ⇒ null).
-- Organização 'bloqueada' ⇒ membros não-admin perdem edição (leitura continua).
-- ============================================================================

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.status = 'active' and p.papel_global = 'admin'
  );
$$;

-- Papel do usuário corrente na organização (null se não membro ou não ativo).
create or replace function public.org_papel(p_organizacao_id uuid)
returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.papel
    from public.organizacao_membros m
    join public.profiles p on p.id = m.user_id
   where m.organizacao_id = p_organizacao_id
     and m.user_id = auth.uid()
     and p.status = 'active';
$$;

create or replace function public.is_org_member(p_organizacao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.is_admin()
      or (p_organizacao_id is not null and public.org_papel(p_organizacao_id) is not null), false);
$$;

create or replace function public.can_edit_org(p_organizacao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.is_admin()
      or (
        p_organizacao_id is not null
        and coalesce(public.org_papel(p_organizacao_id) in ('owner', 'editor'), false)
        and exists (select 1 from public.organizacoes o where o.id = p_organizacao_id and o.status = 'ativa')
      ), false);
$$;

create or replace function public.is_org_owner(p_organizacao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.is_admin()
      or (
        p_organizacao_id is not null
        and coalesce(public.org_papel(p_organizacao_id) = 'owner', false)
        and exists (select 1 from public.organizacoes o where o.id = p_organizacao_id and o.status = 'ativa')
      ), false);
$$;

create or replace function public.assert_pode_editar(p_organizacao_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_edit_org(p_organizacao_id) then
    raise exception 'Sem permissão de edição' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador' using errcode = '42501';
  end if;
end;
$$;

-- Auxiliar (não contratual, uso nas políticas de profiles): o usuário corrente
-- (ativo) compartilha alguma organização com p_user_id?
create or replace function public.compartilha_organizacao(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user() and exists (
    select 1
      from public.organizacao_membros eu
      join public.organizacao_membros outro on outro.organizacao_id = eu.organizacao_id
     where eu.user_id = auth.uid() and outro.user_id = p_user_id
  );
$$;

-- Conversão segura texto → uuid (null se inválido). Usada nas políticas de Storage.
create or replace function public.try_uuid(p_texto text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_texto::uuid;
exception when others then
  return null;
end;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on function public.is_active_user()               from public, anon;
revoke all on function public.is_admin()                     from public, anon;
revoke all on function public.org_papel(uuid)                from public, anon;
revoke all on function public.is_org_member(uuid)            from public, anon;
revoke all on function public.can_edit_org(uuid)             from public, anon;
revoke all on function public.is_org_owner(uuid)             from public, anon;
revoke all on function public.assert_pode_editar(uuid)       from public, anon;
revoke all on function public.assert_admin()                 from public, anon;
revoke all on function public.compartilha_organizacao(uuid)  from public, anon;
revoke all on function public.try_uuid(text)                 from public, anon;

grant execute on function public.is_active_user()              to authenticated, service_role;
grant execute on function public.is_admin()                    to authenticated, service_role;
grant execute on function public.org_papel(uuid)               to authenticated, service_role;
grant execute on function public.is_org_member(uuid)           to authenticated, service_role;
grant execute on function public.can_edit_org(uuid)            to authenticated, service_role;
grant execute on function public.is_org_owner(uuid)            to authenticated, service_role;
grant execute on function public.assert_pode_editar(uuid)      to authenticated, service_role;
grant execute on function public.assert_admin()                to authenticated, service_role;
grant execute on function public.compartilha_organizacao(uuid) to authenticated, service_role;
grant execute on function public.try_uuid(text)                to authenticated, service_role;

-- ===== 0006_clientes_obras.sql =====
-- ============================================================================
-- 0006 — clientes e obras (BACKEND-1)
-- Contrato: docs/ARQUITETURA.md §5.2
-- ============================================================================

-- ─── clientes ───────────────────────────────────────────────────────────────
create table public.clientes (
  id                  uuid primary key default gen_random_uuid(),
  organizacao_id      uuid not null,
  tipo                public.pessoa_tipo not null default 'PJ',
  nome                text not null,
  nome_fantasia       text null,
  documento           text null,
  inscricao_estadual  text null,
  email               extensions.citext null,
  telefone            text null,
  contato_nome        text null,
  cep                 text null,
  logradouro          text null,
  numero              text null,
  complemento         text null,
  bairro              text null,
  municipio           text null,
  uf                  char(2) null,
  observacoes         text null,
  ativo               boolean not null default true,
  created_by          uuid null default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint clientes_organizacao_id_fkey foreign key (organizacao_id) references public.organizacoes (id) on delete cascade,
  constraint clientes_created_by_fkey     foreign key (created_by) references auth.users (id) on delete set null,
  constraint clientes_nome_check          check (char_length(btrim(nome)) between 1 and 300),
  constraint clientes_documento_check     check (
    documento is null
    or (tipo = 'PF' and documento ~ '^\d{11}$')
    or (tipo = 'PJ' and documento ~ '^\d{14}$')
  ),
  constraint clientes_uf_check            check (uf ~ '^[A-Z]{2}$')
);

create index clientes_org_nome_idx  on public.clientes (organizacao_id, nome);
create index clientes_nome_trgm_idx on public.clientes using gin (nome extensions.gin_trgm_ops);
create unique index clientes_org_documento_unico on public.clientes (organizacao_id, documento) where documento is not null;

create or replace function public.fn_clientes_normaliza()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome      := btrim(new.nome);
  new.documento := nullif(regexp_replace(coalesce(new.documento, ''), '\D', '', 'g'), '');
  new.email     := nullif(btrim(coalesce(new.email::text, '')), '');
  new.uf        := nullif(upper(btrim(coalesce(new.uf, ''))), '');
  return new;
end;
$$;

create trigger clientes_normaliza  before insert or update on public.clientes
  for each row execute function public.fn_clientes_normaliza();
create trigger clientes_created_by before insert or update on public.clientes
  for each row execute function public.fn_define_created_by();
create trigger clientes_updated_at before update on public.clientes
  for each row execute function public.set_updated_at();
create trigger clientes_auditoria  after insert or update or delete on public.clientes
  for each row execute function public.fn_auditoria_trigger();

-- ─── obras ──────────────────────────────────────────────────────────────────
create table public.obras (
  id                    uuid primary key default gen_random_uuid(),
  organizacao_id        uuid not null,
  cliente_id            uuid null,
  codigo                text null,
  nome                  text not null,
  descricao             text null,
  tipo_obra             text null,
  status                public.obra_status not null default 'planejamento',
  cep                   text null,
  logradouro            text null,
  numero                text null,
  complemento           text null,
  bairro                text null,
  municipio             text null,
  uf                    char(2) not null default 'RJ',
  area_construida_m2    numeric(14,2) null,
  area_terreno_m2       numeric(14,2) null,
  data_inicio_prevista  date null,
  data_fim_prevista     date null,
  responsavel_tecnico   text null,
  crea_cau              text null,
  art_rrt               text null,
  observacoes           text null,
  created_by            uuid null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint obras_organizacao_id_fkey foreign key (organizacao_id) references public.organizacoes (id) on delete cascade,
  constraint obras_cliente_id_fkey     foreign key (cliente_id) references public.clientes (id) on delete set null,
  constraint obras_created_by_fkey     foreign key (created_by) references auth.users (id) on delete set null,
  constraint obras_nome_check          check (char_length(btrim(nome)) between 1 and 300),
  constraint obras_uf_check            check (uf ~ '^[A-Z]{2}$'),
  constraint obras_areas_check         check (coalesce(area_construida_m2, 0) >= 0 and coalesce(area_terreno_m2, 0) >= 0),
  constraint obras_datas_check         check (data_fim_prevista is null or data_inicio_prevista is null or data_fim_prevista >= data_inicio_prevista)
);

create index obras_org_status_idx on public.obras (organizacao_id, status);
create index obras_cliente_id_idx on public.obras (cliente_id);
create index obras_nome_trgm_idx  on public.obras using gin (nome extensions.gin_trgm_ops);
create unique index obras_org_codigo_unico on public.obras (organizacao_id, codigo) where codigo is not null;

-- Normaliza e garante que o cliente pertence à mesma organização da obra.
create or replace function public.fn_obras_normaliza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.nome   := btrim(new.nome);
  new.codigo := nullif(btrim(coalesce(new.codigo, '')), '');
  new.uf     := upper(btrim(new.uf));
  if new.cliente_id is not null and not exists (
       select 1 from public.clientes c where c.id = new.cliente_id and c.organizacao_id = new.organizacao_id
     ) then
    raise exception 'O cliente informado não pertence a esta organização' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger obras_normaliza  before insert or update on public.obras
  for each row execute function public.fn_obras_normaliza();
create trigger obras_created_by before insert or update on public.obras
  for each row execute function public.fn_define_created_by();
create trigger obras_updated_at before update on public.obras
  for each row execute function public.set_updated_at();
create trigger obras_auditoria  after insert or update or delete on public.obras
  for each row execute function public.fn_auditoria_trigger();

-- Cliente não pode mudar de organização deixando obras de outra org apontando para ele.
create or replace function public.fn_clientes_valida_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organizacao_id is distinct from old.organizacao_id
     and exists (select 1 from public.obras o where o.cliente_id = new.id) then
    raise exception 'Cliente possui obras vinculadas e não pode mudar de organização' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger clientes_valida_org before update of organizacao_id on public.clientes
  for each row execute function public.fn_clientes_valida_org();

revoke all on function public.fn_clientes_normaliza()  from public, anon, authenticated;
revoke all on function public.fn_obras_normaliza()     from public, anon, authenticated;
revoke all on function public.fn_clientes_valida_org() from public, anon, authenticated;

-- ===== 0007_rls_core.sql =====
-- ============================================================================
-- 0007 — RLS e políticas das tabelas do núcleo (BACKEND-1)
-- Contrato: docs/ARQUITETURA.md §6.3
-- ============================================================================

-- Auxiliar usado pela política de convites (retorna somente o próprio e-mail).
grant execute on function public.fn_email_usuario_atual() to authenticated, service_role;

-- ─── Privilégios de tabela (defesa em profundidade além da RLS) ─────────────
revoke all on table
  public.profiles, public.configuracoes, public.organizacoes, public.organizacao_membros,
  public.convites, public.auditoria_logs, public.clientes, public.obras
from anon;

revoke truncate, references, trigger on table
  public.profiles, public.configuracoes, public.organizacoes, public.organizacao_membros,
  public.convites, public.auditoria_logs, public.clientes, public.obras
from authenticated;

grant select, insert, update, delete on table
  public.profiles, public.configuracoes, public.organizacoes, public.organizacao_membros,
  public.convites, public.clientes, public.obras
to authenticated;

-- Auditoria: somente leitura para todos (inserção só por security definer).
revoke insert, update, delete on table public.auditoria_logs from authenticated;
grant select on table public.auditoria_logs to authenticated;

-- Configurações públicas legíveis antes do login (cadastro_aberto, aviso_global…).
grant select on table public.configuracoes to anon;

alter table public.profiles            enable row level security;
alter table public.configuracoes       enable row level security;
alter table public.organizacoes        enable row level security;
alter table public.organizacao_membros enable row level security;
alter table public.convites            enable row level security;
alter table public.auditoria_logs      enable row level security;
alter table public.clientes            enable row level security;
alter table public.obras               enable row level security;

-- ─── profiles ───────────────────────────────────────────────────────────────
-- S: próprio (qualquer status), membros das mesmas organizações (se ativo), admin.
-- U: próprio se ativo (campos sensíveis travados por fn_profiles_protege_campos), admin.
-- I/D: só admin (o perfil nasce em handle_new_user).
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.compartilha_organizacao(id));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using ((id = auth.uid() and public.is_active_user()) or public.is_admin())
  with check ((id = auth.uid() and public.is_active_user()) or public.is_admin());
create policy profiles_delete on public.profiles for delete to authenticated
  using (public.is_admin());

-- ─── configuracoes ──────────────────────────────────────────────────────────
create policy configuracoes_select_anon on public.configuracoes for select to anon
  using (publica);
create policy configuracoes_select on public.configuracoes for select to authenticated
  using (publica or public.is_admin());
create policy configuracoes_insert on public.configuracoes for insert to authenticated
  with check (public.is_admin());
create policy configuracoes_update on public.configuracoes for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy configuracoes_delete on public.configuracoes for delete to authenticated
  using (public.is_admin());

-- ─── organizacoes ───────────────────────────────────────────────────────────
-- I: só admin direto (usuários via RPC criar_organizacao). U: owner (status travado
-- por trigger). D: só admin.
create policy organizacoes_select on public.organizacoes for select to authenticated
  using (public.is_org_member(id));
create policy organizacoes_insert on public.organizacoes for insert to authenticated
  with check (public.is_admin());
create policy organizacoes_update on public.organizacoes for update to authenticated
  using (public.is_org_owner(id)) with check (public.is_org_owner(id));
create policy organizacoes_delete on public.organizacoes for delete to authenticated
  using (public.is_admin());

-- ─── organizacao_membros ────────────────────────────────────────────────────
-- Escrita somente por admin; owners usam as RPCs (que garantem ≥ 1 owner).
create policy organizacao_membros_select on public.organizacao_membros for select to authenticated
  using (public.is_org_member(organizacao_id));
create policy organizacao_membros_insert on public.organizacao_membros for insert to authenticated
  with check (public.is_admin());
create policy organizacao_membros_update on public.organizacao_membros for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy organizacao_membros_delete on public.organizacao_membros for delete to authenticated
  using (public.is_admin());

-- ─── convites ───────────────────────────────────────────────────────────────
-- S: admin, owner/editor da org, ou o próprio convidado (usuário ativo, mesmo e-mail).
create policy convites_select on public.convites for select to authenticated
  using (
    public.is_admin()
    or public.org_papel(organizacao_id) in ('owner', 'editor')
    or (public.is_active_user() and lower(email::text) = lower(public.fn_email_usuario_atual()::text))
  );
create policy convites_insert on public.convites for insert to authenticated
  with check (public.is_admin());
create policy convites_update on public.convites for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy convites_delete on public.convites for delete to authenticated
  using (public.is_admin());

-- ─── auditoria_logs ─────────────────────────────────────────────────────────
-- S: admin (tudo) e owner (da sua organização). Sem I/U/D para ninguém.
create policy auditoria_logs_select on public.auditoria_logs for select to authenticated
  using (
    public.is_admin()
    or (organizacao_id is not null and public.org_papel(organizacao_id) = 'owner')
  );

-- ─── clientes / obras (padrão de organização §6.3) ──────────────────────────
create policy clientes_select on public.clientes for select to authenticated
  using (public.is_org_member(organizacao_id));
create policy clientes_insert on public.clientes for insert to authenticated
  with check (public.can_edit_org(organizacao_id));
create policy clientes_update on public.clientes for update to authenticated
  using (public.can_edit_org(organizacao_id)) with check (public.can_edit_org(organizacao_id));
create policy clientes_delete on public.clientes for delete to authenticated
  using (public.can_edit_org(organizacao_id));

create policy obras_select on public.obras for select to authenticated
  using (public.is_org_member(organizacao_id));
create policy obras_insert on public.obras for insert to authenticated
  with check (public.can_edit_org(organizacao_id));
create policy obras_update on public.obras for update to authenticated
  using (public.can_edit_org(organizacao_id)) with check (public.can_edit_org(organizacao_id));
create policy obras_delete on public.obras for delete to authenticated
  using (public.can_edit_org(organizacao_id));

-- ===== 0008_storage.sql =====
-- ============================================================================
-- 0008 — Storage: buckets e políticas (BACKEND-1)
-- Contrato: docs/ARQUITETURA.md §11
--   logos           {organizacao_id}/logo.{png|jpg|jpeg|svg|webp}  S: membros/admin  W: owner/admin
--   avatares        {user_id}/avatar.{ext}                         S: usuário ativo  W: o próprio
--   sinapi-arquivos {ano}/{mes}/{uf}/{arquivo}                     S/W: admin
-- Todos privados (URLs assinadas).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('logos',    'logos',    false, 2 * 1024 * 1024,
     array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']),
  ('avatares', 'avatares', false, 2 * 1024 * 1024,
     array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']),
  ('sinapi-arquivos', 'sinapi-arquivos', false, 60 * 1024 * 1024, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── logos ──────────────────────────────────────────────────────────────────
create policy pretium_logos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'logos'
    and public.is_org_member(public.try_uuid((storage.foldername(name))[1]))
  );
create policy pretium_logos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and name ~* '^[0-9a-f-]{36}/logo\.(png|jpe?g|svg|webp)$'
    and public.is_org_owner(public.try_uuid((storage.foldername(name))[1]))
  );
create policy pretium_logos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'logos'
    and public.is_org_owner(public.try_uuid((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'logos'
    and name ~* '^[0-9a-f-]{36}/logo\.(png|jpe?g|svg|webp)$'
    and public.is_org_owner(public.try_uuid((storage.foldername(name))[1]))
  );
create policy pretium_logos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos'
    and public.is_org_owner(public.try_uuid((storage.foldername(name))[1]))
  );

-- ─── avatares ───────────────────────────────────────────────────────────────
create policy pretium_avatares_select on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and public.is_active_user());
create policy pretium_avatares_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and public.is_active_user()
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~* '^[0-9a-f-]{36}/avatar\.(png|jpe?g|svg|webp)$'
  );
create policy pretium_avatares_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatares'
    and public.is_active_user()
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatares'
    and public.is_active_user()
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~* '^[0-9a-f-]{36}/avatar\.(png|jpe?g|svg|webp)$'
  );
create policy pretium_avatares_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatares'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ─── sinapi-arquivos (somente admin) ────────────────────────────────────────
create policy pretium_sinapi_select on storage.objects for select to authenticated
  using (bucket_id = 'sinapi-arquivos' and public.is_admin());
create policy pretium_sinapi_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sinapi-arquivos' and public.is_admin());
create policy pretium_sinapi_update on storage.objects for update to authenticated
  using (bucket_id = 'sinapi-arquivos' and public.is_admin())
  with check (bucket_id = 'sinapi-arquivos' and public.is_admin());
create policy pretium_sinapi_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sinapi-arquivos' and public.is_admin());

-- ===== 0009_rpc_core.sql =====
-- ============================================================================
-- 0009 — RPCs do núcleo (BACKEND-1)
-- Contrato: docs/ARQUITETURA.md §7.1 (assinaturas exatas)
-- Erros de negócio: P0001; permissão: 42501. Mensagens em pt-BR.
-- ============================================================================

-- Interno: exige usuário autenticado e ativo.
create or replace function public.fn_exige_ativo()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.' using errcode = '42501';
  end if;
  if not public.is_active_user() then
    raise exception 'Sua conta não está ativa' using errcode = '42501';
  end if;
end;
$$;

-- Interno: trava a organização e garante que restará ao menos um owner
-- caso p_user_id deixe de ser owner.
create or replace function public.fn_garante_outro_owner(p_organizacao_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.organizacoes o where o.id = p_organizacao_id for update;
  if exists (
       select 1 from public.organizacao_membros m
        where m.organizacao_id = p_organizacao_id and m.user_id = p_user_id and m.papel = 'owner'
     )
     and not exists (
       select 1 from public.organizacao_membros m
        where m.organizacao_id = p_organizacao_id and m.user_id <> p_user_id and m.papel = 'owner'
     ) then
    raise exception 'A organização precisa de pelo menos um proprietário' using errcode = 'P0001';
  end if;
end;
$$;

-- ─── registrar_acesso ───────────────────────────────────────────────────────
create or replace function public.registrar_acesso()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.' using errcode = '42501';
  end if;

  update public.profiles set ultimo_acesso_em = now() where id = v_uid;

  if not exists (
    select 1 from public.auditoria_logs a
     where a.user_id = v_uid and a.acao = 'login' and a.created_at > now() - interval '1 hour'
  ) then
    perform public.registrar_auditoria('login', 'profiles', v_uid::text);
  end if;
end;
$$;

-- ─── criar_organizacao ──────────────────────────────────────────────────────
create or replace function public.criar_organizacao(p_nome text, p_cnpj text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_nome text := btrim(coalesce(p_nome, ''));
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), '');
  v_uf   text;
  v_id   uuid;
begin
  perform public.fn_exige_ativo();

  if v_nome = '' then
    raise exception 'Informe o nome da organização' using errcode = 'P0001';
  end if;
  if char_length(v_nome) > 200 then
    raise exception 'Nome da organização muito longo' using errcode = 'P0001';
  end if;
  if v_cnpj is not null and v_cnpj !~ '^\d{14}$' then
    raise exception 'CNPJ inválido' using errcode = 'P0001';
  end if;

  v_uf := upper(coalesce(public.fn_config('uf_padrao') #>> '{}', 'RJ'));
  if v_uf !~ '^[A-Z]{2}$' then v_uf := 'RJ'; end if;

  insert into public.organizacoes (nome, cnpj, uf_padrao, created_by)
  values (v_nome, v_cnpj, v_uf, v_uid)
  returning id into v_id;

  insert into public.organizacao_membros (organizacao_id, user_id, papel, convidado_por)
  values (v_id, v_uid, 'owner', null);

  update public.profiles set organizacao_ativa_id = v_id where id = v_uid;

  return v_id;
end;
$$;

-- ─── definir_organizacao_ativa ──────────────────────────────────────────────
create or replace function public.definir_organizacao_ativa(p_organizacao_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_exige_ativo();
  if p_organizacao_id is not null and not public.is_org_member(p_organizacao_id) then
    raise exception 'Você não participa desta organização' using errcode = '42501';
  end if;
  update public.profiles set organizacao_ativa_id = p_organizacao_id where id = auth.uid();
end;
$$;

-- ─── convidar_membro ────────────────────────────────────────────────────────
create or replace function public.convidar_membro(p_organizacao_id uuid, p_email text, p_papel public.org_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_dias    integer;
  v_id      uuid;
begin
  perform public.fn_exige_ativo();
  if not public.is_org_owner(p_organizacao_id) then
    raise exception 'Apenas o proprietário pode convidar membros' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido' using errcode = 'P0001';
  end if;
  if p_papel is null then
    raise exception 'Informe o papel do convidado' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.organizacao_membros m
      join public.profiles p on p.id = m.user_id
     where m.organizacao_id = p_organizacao_id and lower(p.email::text) = v_email
  ) then
    raise exception 'Este e-mail já é membro da organização' using errcode = 'P0001';
  end if;

  begin
    v_dias := (public.fn_config('convite_validade_dias') #>> '{}')::integer;
  exception when others then
    v_dias := null;
  end;
  v_dias := greatest(1, least(coalesce(v_dias, 7), 365));

  select c.id into v_id
    from public.convites c
   where c.organizacao_id = p_organizacao_id and lower(c.email::text) = v_email and c.status = 'pending'
   for update;

  if v_id is not null then
    update public.convites
       set expira_em = now() + make_interval(days => v_dias),
           papel = p_papel,
           convidado_por = auth.uid()
     where id = v_id;
    return v_id;
  end if;

  insert into public.convites (organizacao_id, email, papel, convidado_por, expira_em)
  values (p_organizacao_id, v_email, p_papel, auth.uid(), now() + make_interval(days => v_dias))
  returning id into v_id;
  return v_id;
end;
$$;

-- ─── aceitar_convite ────────────────────────────────────────────────────────
create or replace function public.aceitar_convite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text;
  v_conv   public.convites%rowtype;
begin
  perform public.fn_exige_ativo();

  select * into v_conv from public.convites c where c.token = p_token for update;
  if not found then
    raise exception 'Convite não encontrado' using errcode = 'P0001';
  end if;
  if v_conv.status <> 'pending' then
    raise exception 'Este convite não está mais disponível' using errcode = 'P0001';
  end if;
  if v_conv.expira_em <= now() then
    raise exception 'Este convite expirou. Peça um novo convite.' using errcode = 'P0001';
  end if;

  v_email := lower(public.fn_email_usuario_atual()::text);
  if v_email is null or v_email <> lower(v_conv.email::text) then
    raise exception 'Este convite foi enviado para outro e-mail' using errcode = '42501';
  end if;

  insert into public.organizacao_membros (organizacao_id, user_id, papel, convidado_por)
  values (v_conv.organizacao_id, v_uid, v_conv.papel, v_conv.convidado_por)
  on conflict (organizacao_id, user_id) do update
    set papel = case when public.organizacao_membros.papel = 'owner' then 'owner'::public.org_role
                     else excluded.papel end;

  update public.convites
     set status = 'accepted', aceito_por = v_uid, aceito_em = now()
   where id = v_conv.id;

  update public.profiles
     set organizacao_ativa_id = v_conv.organizacao_id
   where id = v_uid and organizacao_ativa_id is null;

  return v_conv.organizacao_id;
end;
$$;

-- ─── revogar_convite ────────────────────────────────────────────────────────
create or replace function public.revogar_convite(p_convite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.convites%rowtype;
begin
  perform public.fn_exige_ativo();
  select * into v_conv from public.convites c where c.id = p_convite_id for update;
  if not found or not public.is_org_owner(v_conv.organizacao_id) then
    -- não revela a existência do convite a quem não é owner
    if not found then
      raise exception 'Convite não encontrado' using errcode = 'P0001';
    end if;
    raise exception 'Apenas o proprietário pode revogar convites' using errcode = '42501';
  end if;
  if v_conv.status <> 'pending' then
    raise exception 'Somente convites pendentes podem ser revogados' using errcode = 'P0001';
  end if;
  update public.convites set status = 'revoked' where id = p_convite_id;
end;
$$;

-- ─── meus_convites ──────────────────────────────────────────────────────────
create or replace function public.meus_convites()
returns setof public.convites
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
    from public.convites c
   where public.is_active_user()
     and lower(c.email::text) = lower(public.fn_email_usuario_atual()::text)
     and c.status = 'pending'
     and c.expira_em > now()
   order by c.created_at desc;
$$;

-- ─── obter_convite ──────────────────────────────────────────────────────────
-- Acesso por posse do token (segredo do link). Status 'pending' vencido é
-- reportado como 'expired'.
create or replace function public.obter_convite(p_token uuid)
returns table (
  id uuid, organizacao_id uuid, organizacao_nome text, email extensions.citext,
  papel public.org_role, status public.invite_status, expira_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.organizacao_id, o.nome, c.email, c.papel,
         case when c.status = 'pending' and c.expira_em <= now()
              then 'expired'::public.invite_status else c.status end,
         c.expira_em
    from public.convites c
    join public.organizacoes o on o.id = c.organizacao_id
   where auth.uid() is not null and c.token = p_token;
$$;

-- ─── alterar_papel_membro ───────────────────────────────────────────────────
create or replace function public.alterar_papel_membro(p_organizacao_id uuid, p_user_id uuid, p_papel public.org_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_exige_ativo();
  if not public.is_org_owner(p_organizacao_id) then
    raise exception 'Apenas o proprietário pode alterar papéis' using errcode = '42501';
  end if;
  if p_papel is null then
    raise exception 'Informe o papel' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.organizacao_membros m
     where m.organizacao_id = p_organizacao_id and m.user_id = p_user_id
  ) then
    raise exception 'Membro não encontrado' using errcode = 'P0001';
  end if;
  if p_papel <> 'owner' then
    perform public.fn_garante_outro_owner(p_organizacao_id, p_user_id);
  end if;
  update public.organizacao_membros
     set papel = p_papel
   where organizacao_id = p_organizacao_id and user_id = p_user_id;
end;
$$;

-- ─── remover_membro ─────────────────────────────────────────────────────────
create or replace function public.remover_membro(p_organizacao_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_exige_ativo();
  if not (public.is_org_owner(p_organizacao_id)
          or (p_user_id = auth.uid() and public.org_papel(p_organizacao_id) is not null)) then
    raise exception 'Apenas o proprietário pode remover membros' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organizacao_membros m
     where m.organizacao_id = p_organizacao_id and m.user_id = p_user_id
  ) then
    raise exception 'Membro não encontrado' using errcode = 'P0001';
  end if;
  perform public.fn_garante_outro_owner(p_organizacao_id, p_user_id);
  delete from public.organizacao_membros
   where organizacao_id = p_organizacao_id and user_id = p_user_id;
end;
$$;

-- ─── listar_membros ─────────────────────────────────────────────────────────
create or replace function public.listar_membros(p_organizacao_id uuid)
returns table (
  user_id uuid, nome text, email extensions.citext, papel public.org_role,
  avatar_path text, created_at timestamptz, ultimo_acesso_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_organizacao_id) then
    raise exception 'Você não participa desta organização' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.nome, p.email, m.papel, p.avatar_path, m.created_at, p.ultimo_acesso_em
      from public.organizacao_membros m
      join public.profiles p on p.id = m.user_id
     where m.organizacao_id = p_organizacao_id
     order by case m.papel when 'owner' then 0 when 'editor' then 1 else 2 end, p.nome;
end;
$$;

-- ─── admin_listar_usuarios ──────────────────────────────────────────────────
create or replace function public.admin_listar_usuarios(
  p_busca  text default null,
  p_status public.user_status default null,
  p_limite integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, email extensions.citext, nome text, papel_global public.app_role,
  status public.user_status, motivo_bloqueio text, created_at timestamptz,
  ultimo_acesso_em timestamptz, organizacoes jsonb, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
  v_like  text;
begin
  perform public.assert_admin();
  if v_busca is not null then
    v_like := '%' || replace(replace(replace(lower(v_busca), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
    select p.id, p.email, p.nome, p.papel_global, p.status, p.motivo_bloqueio, p.created_at,
           p.ultimo_acesso_em,
           coalesce((
             select jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.nome, 'papel', m.papel) order by o.nome)
               from public.organizacao_membros m
               join public.organizacoes o on o.id = m.organizacao_id
              where m.user_id = p.id
           ), '[]'::jsonb),
           count(*) over ()
      from public.profiles p
     where (p_status is null or p.status = p_status)
       and (v_like is null or lower(p.nome) like v_like or lower(p.email::text) like v_like)
     order by (p.status = 'pending') desc, p.created_at desc
     limit greatest(1, least(coalesce(p_limite, 50), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- ─── admin_definir_status_usuario ───────────────────────────────────────────
create or replace function public.admin_definir_status_usuario(
  p_user_id uuid, p_status public.user_status, p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes public.user_status;
begin
  perform public.assert_admin();
  if p_status is null then
    raise exception 'Informe a situação' using errcode = 'P0001';
  end if;
  if p_user_id = auth.uid() and p_status <> 'active' then
    raise exception 'Você não pode bloquear ou suspender a própria conta' using errcode = 'P0001';
  end if;

  select p.status into v_antes from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'Usuário não encontrado' using errcode = 'P0001';
  end if;

  update public.profiles
     set status          = p_status,
         motivo_bloqueio = case when p_status = 'blocked' then nullif(btrim(coalesce(p_motivo, '')), '') else null end,
         aprovado_por    = case when p_status = 'active' then auth.uid() else aprovado_por end,
         aprovado_em     = case when p_status = 'active' then now() else aprovado_em end
   where id = p_user_id;

  perform public.registrar_auditoria(
    case p_status when 'active' then 'aprovar_usuario'
                  when 'blocked' then 'bloquear_usuario'
                  else 'alterar_status_usuario' end,
    'profiles', p_user_id::text,
    jsonb_build_object('status_anterior', v_antes, 'status', p_status, 'motivo', p_motivo));
end;
$$;

-- ─── admin_definir_papel_global ─────────────────────────────────────────────
create or replace function public.admin_definir_papel_global(p_user_id uuid, p_papel public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes public.app_role;
begin
  perform public.assert_admin();
  if p_papel is null then
    raise exception 'Informe o papel' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('pretium.admins'));

  select p.papel_global into v_antes from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'Usuário não encontrado' using errcode = 'P0001';
  end if;

  if v_antes = 'admin' and p_papel <> 'admin' and not exists (
    select 1 from public.profiles p
     where p.papel_global = 'admin' and p.status = 'active' and p.id <> p_user_id
  ) then
    raise exception 'Não é possível rebaixar o último administrador' using errcode = 'P0001';
  end if;

  update public.profiles set papel_global = p_papel where id = p_user_id;

  perform public.registrar_auditoria('alterar_papel', 'profiles', p_user_id::text,
    jsonb_build_object('papel_anterior', v_antes, 'papel', p_papel));
end;
$$;

-- ─── admin_definir_status_organizacao ───────────────────────────────────────
create or replace function public.admin_definir_status_organizacao(p_organizacao_id uuid, p_status public.org_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_status is null then
    raise exception 'Informe a situação' using errcode = 'P0001';
  end if;
  update public.organizacoes set status = p_status where id = p_organizacao_id;
  if not found then
    raise exception 'Organização não encontrada' using errcode = 'P0001';
  end if;
end;
$$;

-- ─── admin_adicionar_membro ─────────────────────────────────────────────────
create or replace function public.admin_adicionar_membro(p_organizacao_id uuid, p_user_id uuid, p_papel public.org_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_papel is null then
    raise exception 'Informe o papel' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.organizacoes o where o.id = p_organizacao_id) then
    raise exception 'Organização não encontrada' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'Usuário não encontrado' using errcode = 'P0001';
  end if;
  if p_papel <> 'owner' then
    perform public.fn_garante_outro_owner(p_organizacao_id, p_user_id);
  end if;

  insert into public.organizacao_membros (organizacao_id, user_id, papel, convidado_por)
  values (p_organizacao_id, p_user_id, p_papel, auth.uid())
  on conflict (organizacao_id, user_id) do update set papel = excluded.papel;

  update public.profiles
     set organizacao_ativa_id = p_organizacao_id
   where id = p_user_id and organizacao_ativa_id is null;
end;
$$;

-- ─── admin_definir_configuracao ─────────────────────────────────────────────
create or replace function public.admin_definir_configuracao(p_chave text, p_valor jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text := btrim(coalesce(p_chave, ''));
  v_valor jsonb := coalesce(p_valor, 'null'::jsonb);
  v_antes jsonb;
begin
  perform public.assert_admin();
  if v_chave !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'Chave de configuração inválida' using errcode = 'P0001';
  end if;

  -- Validação de tipo das chaves conhecidas.
  case v_chave
    when 'admin_emails' then
      if jsonb_typeof(v_valor) <> 'array' or exists (
           select 1 from jsonb_array_elements(v_valor) e
            where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
        raise exception 'admin_emails deve ser uma lista de e-mails' using errcode = 'P0001';
      end if;
      select coalesce(jsonb_agg(distinct lower(btrim(e))), '[]'::jsonb) into v_valor
        from jsonb_array_elements_text(v_valor) e;
    when 'aprovacao_obrigatoria', 'cadastro_aberto' then
      if jsonb_typeof(v_valor) <> 'boolean' then
        raise exception 'Valor deve ser verdadeiro ou falso' using errcode = 'P0001';
      end if;
    when 'uf_padrao' then
      if jsonb_typeof(v_valor) <> 'string' or (v_valor #>> '{}') !~ '^[A-Z]{2}$' then
        raise exception 'UF inválida' using errcode = 'P0001';
      end if;
    when 'aviso_global' then
      if jsonb_typeof(v_valor) not in ('string', 'null') then
        raise exception 'O aviso deve ser um texto' using errcode = 'P0001';
      end if;
    when 'convite_validade_dias' then
      if jsonb_typeof(v_valor) <> 'number' or (v_valor #>> '{}')::numeric not between 1 and 365
         or (v_valor #>> '{}')::numeric <> trunc((v_valor #>> '{}')::numeric) then
        raise exception 'Validade deve ser um número inteiro de 1 a 365 dias' using errcode = 'P0001';
      end if;
    else
      null;
  end case;

  select c.valor into v_antes from public.configuracoes c where c.chave = v_chave;

  insert into public.configuracoes (chave, valor, updated_by)
  values (v_chave, v_valor, auth.uid())
  on conflict (chave) do update set valor = excluded.valor, updated_by = excluded.updated_by;

  perform public.registrar_auditoria('config', 'configuracoes', v_chave,
    jsonb_build_object('antes', v_antes, 'depois', v_valor));
end;
$$;

-- ─── admin_estatisticas ─────────────────────────────────────────────────────
-- Lê tabelas do BACKEND-2 somente via SQL dinâmico protegido por to_regclass.
create or replace function public.admin_estatisticas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_orcamentos bigint := 0;
  v_data_base  jsonb := null;
begin
  perform public.assert_admin();

  if to_regclass('public.orcamentos') is not null then
    execute 'select count(*) from public.orcamentos' into v_orcamentos;
  end if;

  if to_regclass('public.datas_base') is not null then
    execute $q$
      select jsonb_build_object('id', d.id, 'uf', d.uf, 'ano', d.ano, 'mes', d.mes,
                                'regime', d.regime, 'is_demo', d.is_demo)
        from public.datas_base d
       order by d.ano desc, d.mes desc, d.is_demo asc, d.created_at desc
       limit 1
    $q$ into v_data_base;
  end if;

  return jsonb_build_object(
    'usuarios_total',      (select count(*) from public.profiles),
    'usuarios_pendentes',  (select count(*) from public.profiles where status = 'pending'),
    'usuarios_bloqueados', (select count(*) from public.profiles where status = 'blocked'),
    'organizacoes_total',  (select count(*) from public.organizacoes),
    'obras_total',         (select count(*) from public.obras),
    'orcamentos_total',    v_orcamentos,
    'ultima_data_base',    v_data_base
  );
end;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on function public.fn_exige_ativo()                    from public, anon, authenticated;
revoke all on function public.fn_garante_outro_owner(uuid, uuid)  from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.registrar_acesso()',
    'public.criar_organizacao(text, text)',
    'public.definir_organizacao_ativa(uuid)',
    'public.convidar_membro(uuid, text, public.org_role)',
    'public.aceitar_convite(uuid)',
    'public.revogar_convite(uuid)',
    'public.meus_convites()',
    'public.obter_convite(uuid)',
    'public.alterar_papel_membro(uuid, uuid, public.org_role)',
    'public.remover_membro(uuid, uuid)',
    'public.listar_membros(uuid)',
    'public.admin_listar_usuarios(text, public.user_status, integer, integer)',
    'public.admin_definir_status_usuario(uuid, public.user_status, text)',
    'public.admin_definir_papel_global(uuid, public.app_role)',
    'public.admin_definir_status_organizacao(uuid, public.org_status)',
    'public.admin_adicionar_membro(uuid, uuid, public.org_role)',
    'public.admin_definir_configuracao(text, jsonb)',
    'public.admin_estatisticas()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

