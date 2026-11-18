-- =============================================================================
-- 0014 — BACKEND-2: tabelas do orçamento (§5.4)
-- orcamentos, orcamento_bdis, orcamento_etapas, orcamento_itens,
-- orcamento_insumo_precos, orcamento_item_memorias
-- (FK orcamentos.encargos_sociais_id é criada em 0016, junto com encargos_sociais)
-- =============================================================================

-- ─── orcamentos ──────────────────────────────────────────────────────────────
create table orcamentos (
  id                  uuid primary key default gen_random_uuid(),
  organizacao_id      uuid not null references organizacoes(id) on delete cascade,
  obra_id             uuid not null references obras(id) on delete cascade,
  codigo              text null,
  nome                text not null check (btrim(nome) <> ''),
  descricao           text null,
  versao              integer not null default 1 check (versao >= 1),
  orcamento_origem_id uuid null references orcamentos(id) on delete set null,
  status              orcamento_status not null default 'rascunho',
  data_base_id        uuid not null references datas_base(id) on delete restrict,
  encargos_sociais_id uuid null,
  data_orcamento      date not null default current_date,
  validade_dias       integer not null default 30 check (validade_dias >= 0),
  total_sem_bdi       numeric(16,2) not null default 0,
  total_bdi           numeric(16,2) not null default 0,
  total               numeric(16,2) not null default 0,
  itens_sem_preco     integer not null default 0,
  recalculado_em      timestamptz null,
  observacoes         text null,
  created_by          uuid null default auth.uid() references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index orcamentos_org_updated_idx on orcamentos (organizacao_id, updated_at desc);
create index orcamentos_obra_idx on orcamentos (obra_id);
create index orcamentos_data_base_idx on orcamentos (data_base_id);
create index orcamentos_origem_idx on orcamentos (orcamento_origem_id) where orcamento_origem_id is not null;

-- ─── orcamento_bdis ──────────────────────────────────────────────────────────
create table orcamento_bdis (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  orcamento_id   uuid not null references orcamentos(id) on delete cascade,
  nome           text not null default 'BDI Serviços',
  is_padrao      boolean not null default false,
  ac             numeric(9,4) not null default 0 check (ac >= 0),
  s              numeric(9,4) not null default 0 check (s >= 0),
  r              numeric(9,4) not null default 0 check (r >= 0),
  g              numeric(9,4) not null default 0 check (g >= 0),
  df             numeric(9,4) not null default 0 check (df >= 0),
  l              numeric(9,4) not null default 0 check (l >= 0),
  pis            numeric(9,4) not null default 0.65 check (pis >= 0),
  cofins         numeric(9,4) not null default 3.00 check (cofins >= 0),
  iss            numeric(9,4) not null default 0 check (iss >= 0),
  cprb           numeric(9,4) not null default 0 check (cprb >= 0),
  i_total        numeric(9,4) generated always as (pis + cofins + iss + cprb) stored,
  bdi            numeric(9,4) generated always as (
                   round(((((1 + (ac + s + r + g) / 100) * (1 + df / 100) * (1 + l / 100))
                           / nullif(1 - (pis + cofins + iss + cprb) / 100, 0)) - 1) * 100, 2)
                 ) stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint orcamento_bdis_tributos_chk check (pis + cofins + iss + cprb < 100)
);
create unique index orcamento_bdis_padrao_key on orcamento_bdis (orcamento_id) where is_padrao;
create index orcamento_bdis_orcamento_idx on orcamento_bdis (orcamento_id);
create index orcamento_bdis_org_idx on orcamento_bdis (organizacao_id);

-- ─── orcamento_etapas (EAP) ─────────────────────────────────────────────────
create table orcamento_etapas (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  orcamento_id   uuid not null references orcamentos(id) on delete cascade,
  parent_id      uuid null references orcamento_etapas(id) on delete cascade,
  ordem          integer not null default 0,
  codigo         text not null default '',
  nome           text not null check (btrim(nome) <> ''),
  total_sem_bdi  numeric(16,2) not null default 0,
  total          numeric(16,2) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint orcamento_etapas_auto_ref_chk check (parent_id is null or parent_id <> id)
);
create index orcamento_etapas_arvore_idx on orcamento_etapas (orcamento_id, parent_id, ordem);
create index orcamento_etapas_parent_idx on orcamento_etapas (parent_id) where parent_id is not null;
create index orcamento_etapas_org_idx on orcamento_etapas (organizacao_id);

-- ─── orcamento_itens ─────────────────────────────────────────────────────────
create table orcamento_itens (
  id                uuid primary key default gen_random_uuid(),
  organizacao_id    uuid not null,
  orcamento_id      uuid not null references orcamentos(id) on delete cascade,
  etapa_id          uuid not null references orcamento_etapas(id) on delete cascade,
  ordem             integer not null default 0,
  codigo            text not null default '',
  referencia_tipo   item_referencia_tipo not null,
  composicao_id     uuid null references composicoes(id) on delete no action deferrable initially deferred,
  insumo_id         uuid null references insumos(id) on delete no action deferrable initially deferred,
  fonte             text not null default 'SINAPI',
  referencia_codigo text null,
  descricao         text not null,
  unidade           text not null,
  quantidade        numeric(18,4) not null default 0 check (quantidade >= 0),
  usa_memoria       boolean not null default false,
  custo_unitario    numeric(14,2) not null default 0,
  custo_manual      boolean not null default false,
  bdi_id            uuid null references orcamento_bdis(id) on delete set null,
  bdi_percentual    numeric(9,4) not null default 0,
  preco_unitario    numeric(14,2) not null default 0,
  total_sem_bdi     numeric(16,2) not null default 0,
  total             numeric(16,2) not null default 0,
  sem_preco         boolean not null default false,
  observacao        text null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint orcamento_itens_referencia_chk check (
    (referencia_tipo = 'composicao' and composicao_id is not null and insumo_id is null) or
    (referencia_tipo = 'insumo' and insumo_id is not null and composicao_id is null) or
    (referencia_tipo = 'livre' and composicao_id is null and insumo_id is null)
  )
);
create index orcamento_itens_etapa_ordem_idx on orcamento_itens (orcamento_id, etapa_id, ordem);
create index orcamento_itens_etapa_idx on orcamento_itens (etapa_id);
create index orcamento_itens_composicao_idx on orcamento_itens (composicao_id) where composicao_id is not null;
create index orcamento_itens_insumo_idx on orcamento_itens (insumo_id) where insumo_id is not null;
create index orcamento_itens_bdi_idx on orcamento_itens (bdi_id) where bdi_id is not null;
create index orcamento_itens_org_idx on orcamento_itens (organizacao_id);

-- ─── orcamento_insumo_precos (cotações) ─────────────────────────────────────
create table orcamento_insumo_precos (
  orcamento_id   uuid not null references orcamentos(id) on delete cascade,
  insumo_id      uuid not null references insumos(id) on delete cascade,
  organizacao_id uuid not null,
  preco          numeric(14,4) not null check (preco >= 0),
  fonte          text null,
  updated_at     timestamptz not null default now(),
  primary key (orcamento_id, insumo_id)
);
create index orcamento_insumo_precos_insumo_idx on orcamento_insumo_precos (insumo_id);
create index orcamento_insumo_precos_org_idx on orcamento_insumo_precos (organizacao_id);

-- ─── orcamento_item_memorias ─────────────────────────────────────────────────
create table orcamento_item_memorias (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  item_id        uuid not null references orcamento_itens(id) on delete cascade,
  ordem          integer not null default 0,
  descricao      text not null default '',
  expressao      text not null,
  resultado      numeric(18,4) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index orcamento_item_memorias_item_idx on orcamento_item_memorias (item_id, ordem);
create index orcamento_item_memorias_org_idx on orcamento_item_memorias (organizacao_id);
