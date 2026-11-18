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
