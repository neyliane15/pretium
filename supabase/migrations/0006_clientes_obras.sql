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
