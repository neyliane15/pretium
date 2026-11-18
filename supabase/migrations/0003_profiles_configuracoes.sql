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
