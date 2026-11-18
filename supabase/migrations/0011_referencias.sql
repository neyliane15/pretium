-- =============================================================================
-- 0011 — BACKEND-2: referências SINAPI e próprias (§5.3)
-- datas_base, insumos, composicoes, sinapi_importacoes, insumo_precos,
-- composicao_itens, composicao_precos + índices + validações
-- =============================================================================

-- ─── datas_base ──────────────────────────────────────────────────────────────
create table datas_base (
  id            uuid primary key default gen_random_uuid(),
  uf            char(2) not null check (uf ~ '^[A-Z]{2}$'),
  ano           smallint not null check (ano between 2000 and 2100),
  mes           smallint not null check (mes between 1 and 12),
  regime        regime_desoneracao not null,
  status        data_base_status not null default 'rascunho',
  is_demo       boolean not null default false,
  descricao     text null,
  fonte_arquivo text null,
  publicada_em  timestamptz null,
  created_by    uuid null default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint datas_base_uf_ano_mes_regime_demo_key unique (uf, ano, mes, regime, is_demo)
);
create index datas_base_uf_regime_ano_mes_idx on datas_base (uf, regime, ano desc, mes desc);
create trigger trg_datas_base_updated_at before update on datas_base
  for each row execute function set_updated_at();

-- ─── insumos ─────────────────────────────────────────────────────────────────
create table insumos (
  id                 uuid primary key default gen_random_uuid(),
  organizacao_id     uuid null references organizacoes(id) on delete cascade,
  fonte              fonte_referencia not null,
  codigo             text not null check (btrim(codigo) <> ''),
  descricao          text not null,
  unidade            text not null,
  tipo               insumo_tipo not null default 'material',
  classificacao      text null,
  preco_proprio      numeric(14,4) null check (preco_proprio is null or preco_proprio >= 0),
  preco_proprio_data date null,
  is_demo            boolean not null default false,
  ativo              boolean not null default true,
  busca              tsvector generated always as
                       (to_tsvector('portuguese', f_unaccent(codigo || ' ' || descricao))) stored,
  created_by         uuid null default auth.uid() references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint insumos_fonte_org_chk check ((organizacao_id is null) = (fonte = 'sinapi')),
  constraint insumos_preco_proprio_chk check (fonte = 'propria' or preco_proprio is null)
);
create unique index insumos_codigo_sinapi_key on insumos (codigo) where organizacao_id is null;
create unique index insumos_org_codigo_key on insumos (organizacao_id, codigo) where organizacao_id is not null;
create index insumos_organizacao_id_idx on insumos (organizacao_id);
create index insumos_busca_idx on insumos using gin (busca);
create trigger trg_insumos_updated_at before update on insumos
  for each row execute function set_updated_at();

-- ─── composicoes ─────────────────────────────────────────────────────────────
create table composicoes (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid null references organizacoes(id) on delete cascade,
  fonte          fonte_referencia not null,
  codigo         text not null check (btrim(codigo) <> ''),
  descricao      text not null,
  unidade        text not null,
  grupo          text null,
  observacao     text null,
  is_demo        boolean not null default false,
  ativo          boolean not null default true,
  busca          tsvector generated always as
                   (to_tsvector('portuguese', f_unaccent(codigo || ' ' || descricao))) stored,
  created_by     uuid null default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint composicoes_fonte_org_chk check ((organizacao_id is null) = (fonte = 'sinapi'))
);
create unique index composicoes_codigo_sinapi_key on composicoes (codigo) where organizacao_id is null;
create unique index composicoes_org_codigo_key on composicoes (organizacao_id, codigo) where organizacao_id is not null;
create index composicoes_organizacao_id_idx on composicoes (organizacao_id);
create index composicoes_busca_idx on composicoes using gin (busca);
create trigger trg_composicoes_updated_at before update on composicoes
  for each row execute function set_updated_at();

-- Índices trigram (pg_trgm, criado pelo B1 em 0001). Tolerante à ausência da extensão.
do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  if v_schema is null then
    raise notice 'pg_trgm ausente: índices trigram de insumos/composições não criados (busca usa tsvector + ILIKE).';
    return;
  end if;
  execute format('create index insumos_descricao_trgm_idx on public.insumos using gin (public.f_unaccent(descricao) %I.gin_trgm_ops)', v_schema);
  execute format('create index composicoes_descricao_trgm_idx on public.composicoes using gin (public.f_unaccent(descricao) %I.gin_trgm_ops)', v_schema);
end $$;

-- ─── sinapi_importacoes ──────────────────────────────────────────────────────
create table sinapi_importacoes (
  id            uuid primary key default gen_random_uuid(),
  data_base_id  uuid not null references datas_base(id) on delete cascade,
  tipo          importacao_tipo not null,
  status        importacao_status not null default 'pendente',
  arquivo_nome  text null,
  arquivo_path  text null,
  total_linhas  integer not null default 0,
  linhas_ok     integer not null default 0,
  linhas_erro   integer not null default 0,
  erros         jsonb not null default '[]'::jsonb,
  iniciado_em   timestamptz not null default now(),
  finalizado_em timestamptz null,
  created_by    uuid null default auth.uid() references auth.users(id) on delete set null
);
create index sinapi_importacoes_data_base_idx on sinapi_importacoes (data_base_id, iniciado_em desc);
create index sinapi_importacoes_iniciado_idx on sinapi_importacoes (iniciado_em desc);

-- ─── insumo_precos ───────────────────────────────────────────────────────────
create table insumo_precos (
  data_base_id  uuid not null references datas_base(id) on delete cascade,
  insumo_id     uuid not null references insumos(id) on delete cascade,
  preco         numeric(14,4) not null check (preco >= 0),
  origem_preco  text null,
  importacao_id uuid null references sinapi_importacoes(id) on delete set null,
  primary key (data_base_id, insumo_id)
);
create index insumo_precos_insumo_id_idx on insumo_precos (insumo_id);
create index insumo_precos_importacao_id_idx on insumo_precos (importacao_id);

-- ─── composicao_itens ────────────────────────────────────────────────────────
create table composicao_itens (
  id               uuid primary key default gen_random_uuid(),
  composicao_id    uuid not null references composicoes(id) on delete cascade,
  organizacao_id   uuid null,
  tipo_item        composicao_item_tipo not null,
  insumo_id        uuid null references insumos(id) on delete no action deferrable initially deferred,
  subcomposicao_id uuid null references composicoes(id) on delete no action deferrable initially deferred,
  coeficiente      numeric(18,7) not null check (coeficiente > 0),
  ordem            integer not null default 0,
  importacao_id    uuid null references sinapi_importacoes(id) on delete set null,
  constraint composicao_itens_tipo_chk check (
    (tipo_item = 'insumo' and insumo_id is not null and subcomposicao_id is null) or
    (tipo_item = 'composicao' and subcomposicao_id is not null and insumo_id is null)
  ),
  constraint composicao_itens_auto_ref_chk check (subcomposicao_id is null or subcomposicao_id <> composicao_id)
);
create unique index composicao_itens_unico_key
  on composicao_itens (composicao_id, tipo_item, (coalesce(insumo_id, subcomposicao_id)));
create index composicao_itens_composicao_idx on composicao_itens (composicao_id, ordem);
create index composicao_itens_insumo_idx on composicao_itens (insumo_id) where insumo_id is not null;
create index composicao_itens_sub_idx on composicao_itens (subcomposicao_id) where subcomposicao_id is not null;
create index composicao_itens_importacao_idx on composicao_itens (importacao_id) where importacao_id is not null;
create index composicao_itens_organizacao_idx on composicao_itens (organizacao_id) where organizacao_id is not null;

create trigger trg_10_composicao_itens_herda_org before insert or update of composicao_id, organizacao_id on composicao_itens
  for each row execute function fn_herda_organizacao('composicoes', 'composicao_id', 'nullable');

-- Valida: ciclo (busca recursiva), SINAPI não referencia próprio, próprio não referencia
-- próprio de outra organização.
create or replace function fn_composicao_itens_valida() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org_comp uuid;
  v_org_ref  uuid;
  v_ciclo    boolean;
begin
  select organizacao_id into v_org_comp from composicoes where id = new.composicao_id;

  if new.tipo_item = 'insumo' then
    select organizacao_id into v_org_ref from insumos where id = new.insumo_id;
  else
    if new.subcomposicao_id = new.composicao_id then
      raise exception 'Uma composição não pode conter a si mesma.' using errcode = 'P0001';
    end if;
    select organizacao_id into v_org_ref from composicoes where id = new.subcomposicao_id;
  end if;

  if v_org_comp is null and v_org_ref is not null then
    raise exception 'Composição SINAPI não pode usar item próprio de organização.' using errcode = 'P0001';
  end if;
  if v_org_comp is not null and v_org_ref is not null and v_org_ref <> v_org_comp then
    raise exception 'Item próprio de outra organização não pode ser usado.' using errcode = 'P0001';
  end if;

  if new.tipo_item = 'composicao' then
    -- a nova subcomposição (ou alguma descendente dela) já contém a composição? ⇒ ciclo
    with recursive desc_(id, prof, caminho) as (
      select new.subcomposicao_id, 1, array[new.subcomposicao_id]
      union all
      select ci.subcomposicao_id, d.prof + 1, d.caminho || ci.subcomposicao_id
        from desc_ d
        join composicao_itens ci on ci.composicao_id = d.id and ci.tipo_item = 'composicao'
       where d.prof < 50 and not (ci.subcomposicao_id = any (d.caminho))
         and ci.id is distinct from new.id
    )
    select exists (select 1 from desc_ where id = new.composicao_id) into v_ciclo;
    if v_ciclo then
      raise exception 'Ciclo detectado: a subcomposição já contém esta composição.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger trg_20_composicao_itens_valida before insert or update on composicao_itens
  for each row execute function fn_composicao_itens_valida();

-- ─── composicao_precos ───────────────────────────────────────────────────────
create table composicao_precos (
  data_base_id      uuid not null references datas_base(id) on delete cascade,
  composicao_id     uuid not null references composicoes(id) on delete cascade,
  custo             numeric(14,4) not null check (custo >= 0),
  custo_mao_obra    numeric(14,4) null,
  custo_material    numeric(14,4) null,
  custo_equipamento numeric(14,4) null,
  custo_servicos    numeric(14,4) null,
  perc_mao_obra     numeric(9,4) null,
  importacao_id     uuid null references sinapi_importacoes(id) on delete set null,
  primary key (data_base_id, composicao_id)
);
create index composicao_precos_composicao_idx on composicao_precos (composicao_id);
create index composicao_precos_importacao_idx on composicao_precos (importacao_id);

-- Composições/insumos SINAPI só podem ter preço oficial (composicao_precos) se forem SINAPI.
create or replace function fn_composicao_precos_valida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from composicoes where id = new.composicao_id and organizacao_id is not null) then
    raise exception 'Custo oficial só se aplica a composições SINAPI.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_composicao_precos_valida before insert or update on composicao_precos
  for each row execute function fn_composicao_precos_valida();

-- ─── Auditoria (somente referências próprias e datas-base; SINAPI em massa não audita linha a linha)
create trigger trg_datas_base_auditoria after insert or update or delete on datas_base
  for each row execute function fn_auditoria_trigger();
create trigger trg_insumos_auditoria after insert or update on insumos
  for each row when (new.organizacao_id is not null) execute function fn_auditoria_trigger();
create trigger trg_insumos_auditoria_del after delete on insumos
  for each row when (old.organizacao_id is not null) execute function fn_auditoria_trigger();
create trigger trg_composicoes_auditoria after insert or update on composicoes
  for each row when (new.organizacao_id is not null) execute function fn_auditoria_trigger();
create trigger trg_composicoes_auditoria_del after delete on composicoes
  for each row when (old.organizacao_id is not null) execute function fn_auditoria_trigger();

revoke execute on function fn_composicao_itens_valida() from public, anon;
revoke execute on function fn_composicao_precos_valida() from public, anon;
