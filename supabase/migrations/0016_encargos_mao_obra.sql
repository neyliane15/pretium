-- =============================================================================
-- 0016 — BACKEND-2: encargos sociais e mão de obra (§5.4, §8.6)
-- =============================================================================

-- ─── encargos_sociais ────────────────────────────────────────────────────────
create table encargos_sociais (
  id               uuid primary key default gen_random_uuid(),
  organizacao_id   uuid null references organizacoes(id) on delete cascade,
  nome             text not null check (btrim(nome) <> ''),
  uf               char(2) null check (uf is null or uf ~ '^[A-Z]{2}$'),
  regime           regime_desoneracao not null,
  vigencia         date null,
  is_demo          boolean not null default false,
  total_horista    numeric(9,4) not null default 0,
  total_mensalista numeric(9,4) not null default 0,
  created_by       uuid null default auth.uid() references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index encargos_sociais_org_idx on encargos_sociais (organizacao_id);
create index encargos_sociais_uf_regime_idx on encargos_sociais (uf, regime, vigencia desc);
create trigger trg_encargos_sociais_updated_at before update on encargos_sociais
  for each row execute function set_updated_at();
create trigger trg_encargos_sociais_auditoria after insert or update or delete on encargos_sociais
  for each row execute function fn_auditoria_trigger();

alter table orcamentos
  add constraint orcamentos_encargos_sociais_id_fkey
  foreign key (encargos_sociais_id) references encargos_sociais(id) on delete set null;
create index orcamentos_encargos_idx on orcamentos (encargos_sociais_id) where encargos_sociais_id is not null;

-- ─── encargos_sociais_itens ──────────────────────────────────────────────────
create table encargos_sociais_itens (
  id                  uuid primary key default gen_random_uuid(),
  encargos_sociais_id uuid not null references encargos_sociais(id) on delete cascade,
  organizacao_id      uuid null,
  grupo               encargo_grupo not null,
  codigo              text not null check (btrim(codigo) <> ''),
  descricao           text not null,
  horista             numeric(9,4) not null default 0,
  mensalista          numeric(9,4) not null default 0,
  ordem               integer not null default 0,
  constraint encargos_sociais_itens_codigo_key unique (encargos_sociais_id, codigo)
);
create index encargos_sociais_itens_org_idx on encargos_sociais_itens (organizacao_id) where organizacao_id is not null;

create trigger trg_10_encargos_sociais_itens_herda_org before insert or update of encargos_sociais_id, organizacao_id
  on encargos_sociais_itens
  for each row execute function fn_herda_organizacao('encargos_sociais', 'encargos_sociais_id', 'nullable');

-- Totais = Σ itens (horista e mensalista separados)
create or replace function fn_encargos_sociais_totaliza() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  if tg_op = 'DELETE' then v_ids := array[old.encargos_sociais_id];
  elsif tg_op = 'INSERT' then v_ids := array[new.encargos_sociais_id];
  else v_ids := array[old.encargos_sociais_id, new.encargos_sociais_id];
  end if;
  update encargos_sociais e
     set total_horista    = coalesce((select round(sum(i.horista), 4) from encargos_sociais_itens i where i.encargos_sociais_id = e.id), 0),
         total_mensalista = coalesce((select round(sum(i.mensalista), 4) from encargos_sociais_itens i where i.encargos_sociais_id = e.id), 0)
   where e.id = any (v_ids);
  return null;
end $$;
create trigger trg_encargos_sociais_itens_totaliza after insert or update or delete on encargos_sociais_itens
  for each row execute function fn_encargos_sociais_totaliza();

-- ─── orcamento_equipes / orcamento_equipe_membros ───────────────────────────
create table orcamento_equipes (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  orcamento_id   uuid not null references orcamentos(id) on delete cascade,
  nome           text not null check (btrim(nome) <> ''),
  descricao      text null,
  ordem          integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index orcamento_equipes_orcamento_idx on orcamento_equipes (orcamento_id, ordem);
create index orcamento_equipes_org_idx on orcamento_equipes (organizacao_id);
create trigger trg_10_orcamento_equipes_herda_org before insert or update of orcamento_id, organizacao_id on orcamento_equipes
  for each row execute function fn_herda_organizacao('orcamentos', 'orcamento_id');
create trigger trg_orcamento_equipes_updated_at before update on orcamento_equipes
  for each row execute function set_updated_at();

create table orcamento_equipe_membros (
  id               uuid primary key default gen_random_uuid(),
  organizacao_id   uuid not null,
  equipe_id        uuid not null references orcamento_equipes(id) on delete cascade,
  funcao           text not null check (btrim(funcao) <> ''),
  insumo_id        uuid null references insumos(id) on delete set null,
  salario_hora     numeric(14,4) null check (salario_hora is null or salario_hora >= 0),
  aplicar_encargos boolean not null default true,
  quantidade       numeric(10,2) not null default 1 check (quantidade >= 0),
  horas_dia        numeric(6,2) not null default 8 check (horas_dia >= 0 and horas_dia <= 24),
  dias             numeric(8,2) not null default 0 check (dias >= 0),
  ordem            integer not null default 0
);
create index orcamento_equipe_membros_equipe_idx on orcamento_equipe_membros (equipe_id, ordem);
create index orcamento_equipe_membros_org_idx on orcamento_equipe_membros (organizacao_id);
create index orcamento_equipe_membros_insumo_idx on orcamento_equipe_membros (insumo_id) where insumo_id is not null;
create trigger trg_10_orcamento_equipe_membros_herda_org before insert or update of equipe_id, organizacao_id on orcamento_equipe_membros
  for each row execute function fn_herda_organizacao('orcamento_equipes', 'equipe_id');

create or replace function fn_orcamento_equipe_membros_valida() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  if new.insumo_id is not null then
    select i.organizacao_id into v_org from insumos i where i.id = new.insumo_id;
    if v_org is not null and v_org <> new.organizacao_id then
      raise exception 'Insumo próprio de outra organização não pode ser usado.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger trg_20_orcamento_equipe_membros_valida before insert or update on orcamento_equipe_membros
  for each row execute function fn_orcamento_equipe_membros_valida();

revoke execute on function fn_encargos_sociais_totaliza(), fn_orcamento_equipe_membros_valida() from public, anon;
