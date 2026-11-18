-- =============================================================================
-- 0017 — BACKEND-2: cronograma físico-financeiro e medições (§5.4)
-- =============================================================================

-- ─── cronogramas ─────────────────────────────────────────────────────────────
create table cronogramas (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  orcamento_id   uuid not null references orcamentos(id) on delete cascade,
  data_inicio    date not null,
  periodicidade  cronograma_periodicidade not null default 'mensal',
  num_periodos   smallint not null check (num_periodos between 1 and 120),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint cronogramas_orcamento_id_key unique (orcamento_id)
);
create index cronogramas_org_idx on cronogramas (organizacao_id);
create trigger trg_10_cronogramas_herda_org before insert or update of orcamento_id, organizacao_id on cronogramas
  for each row execute function fn_herda_organizacao('orcamentos', 'orcamento_id');
create trigger trg_cronogramas_updated_at before update on cronogramas
  for each row execute function set_updated_at();

-- ─── cronograma_distribuicoes ────────────────────────────────────────────────
create table cronograma_distribuicoes (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  cronograma_id  uuid not null references cronogramas(id) on delete cascade,
  etapa_id       uuid not null references orcamento_etapas(id) on delete cascade,
  periodo        smallint not null check (periodo >= 1),
  percentual     numeric(9,4) not null check (percentual between 0 and 100),
  constraint cronograma_distribuicoes_unico_key unique (cronograma_id, etapa_id, periodo)
);
create index cronograma_distribuicoes_etapa_idx on cronograma_distribuicoes (etapa_id);
create index cronograma_distribuicoes_org_idx on cronograma_distribuicoes (organizacao_id);
create trigger trg_10_cronograma_distribuicoes_herda_org before insert or update of cronograma_id, organizacao_id
  on cronograma_distribuicoes
  for each row execute function fn_herda_organizacao('cronogramas', 'cronograma_id');

-- etapa de 1º nível do mesmo orçamento; período ≤ num_periodos
create or replace function fn_cronograma_distribuicoes_valida() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_orc    uuid;
  v_n      smallint;
  v_e_orc  uuid;
  v_parent uuid;
begin
  select c.orcamento_id, c.num_periodos into v_orc, v_n from cronogramas c where c.id = new.cronograma_id;
  select e.orcamento_id, e.parent_id into v_e_orc, v_parent from orcamento_etapas e where e.id = new.etapa_id;
  if v_e_orc is distinct from v_orc then
    raise exception 'A etapa pertence a outro orçamento.' using errcode = 'P0001';
  end if;
  if v_parent is not null then
    raise exception 'O cronograma distribui apenas etapas de 1º nível.' using errcode = 'P0001';
  end if;
  if new.periodo > v_n then
    raise exception 'Período % fora do cronograma (máximo %).', new.periodo, v_n using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_20_cronograma_distribuicoes_valida before insert or update on cronograma_distribuicoes
  for each row execute function fn_cronograma_distribuicoes_valida();

-- Σ percentual por etapa ≤ 100,0001 (verificado após a linha, enxerga o lote inteiro)
create or replace function fn_cronograma_distribuicoes_soma() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_soma numeric;
begin
  select coalesce(sum(d.percentual), 0) into v_soma
    from cronograma_distribuicoes d
   where d.cronograma_id = new.cronograma_id and d.etapa_id = new.etapa_id;
  if v_soma > 100.0001 then
    raise exception 'A soma dos percentuais da etapa ultrapassa 100%% (%).', round(v_soma, 4) using errcode = 'P0001';
  end if;
  return null;
end $$;
create trigger trg_cronograma_distribuicoes_soma after insert or update on cronograma_distribuicoes
  for each row execute function fn_cronograma_distribuicoes_soma();

-- ─── medicoes ────────────────────────────────────────────────────────────────
create table medicoes (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  orcamento_id   uuid not null references orcamentos(id) on delete cascade,
  numero         integer not null check (numero >= 1),
  periodo_inicio date not null,
  periodo_fim    date not null,
  data_medicao   date not null default current_date,
  status         medicao_status not null default 'aberta',
  observacoes    text null,
  total          numeric(16,2) not null default 0,
  created_by     uuid null default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint medicoes_orcamento_numero_key unique (orcamento_id, numero),
  constraint medicoes_periodo_chk check (periodo_fim >= periodo_inicio)
);
create index medicoes_org_idx on medicoes (organizacao_id);
create trigger trg_10_medicoes_herda_org before insert or update of orcamento_id, organizacao_id on medicoes
  for each row execute function fn_herda_organizacao('orcamentos', 'orcamento_id');
create trigger trg_medicoes_updated_at before update on medicoes
  for each row execute function set_updated_at();
create trigger trg_medicoes_auditoria after insert or update or delete on medicoes
  for each row execute function fn_auditoria_trigger();

-- ─── medicao_itens ───────────────────────────────────────────────────────────
create table medicao_itens (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  medicao_id     uuid not null references medicoes(id) on delete cascade,
  item_id        uuid not null references orcamento_itens(id) on delete cascade,
  quantidade     numeric(18,4) not null default 0 check (quantidade >= 0),
  valor          numeric(16,2) not null default 0,
  observacao     text null,
  constraint medicao_itens_unico_key unique (medicao_id, item_id)
);
create index medicao_itens_item_idx on medicao_itens (item_id);
create index medicao_itens_org_idx on medicao_itens (organizacao_id);
create trigger trg_10_medicao_itens_herda_org before insert or update of medicao_id, organizacao_id on medicao_itens
  for each row execute function fn_herda_organizacao('medicoes', 'medicao_id');

-- valida (mesmo orçamento, medição aberta, acumulado ≤ orçado) e calcula valor
create or replace function fn_medicao_itens_calc() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_med        medicoes;
  v_item_orc   uuid;
  v_preco      numeric;
  v_orcada     numeric;
  v_outras     numeric;
  v_med_id     uuid := case when tg_op = 'DELETE' then old.medicao_id else new.medicao_id end;
begin
  select * into v_med from medicoes where id = v_med_id;
  if v_med.id is not null and v_med.status <> 'aberta' and auth.uid() is not null and not is_admin() then
    raise exception 'Medição % está %: itens somente leitura.', v_med.numero, v_med.status using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  select i.orcamento_id, i.preco_unitario, i.quantidade into v_item_orc, v_preco, v_orcada
    from orcamento_itens i where i.id = new.item_id;
  if v_item_orc is distinct from v_med.orcamento_id then
    raise exception 'O item não pertence ao orçamento desta medição.' using errcode = 'P0001';
  end if;

  select coalesce(sum(mi.quantidade), 0) into v_outras
    from medicao_itens mi join medicoes m on m.id = mi.medicao_id
   where mi.item_id = new.item_id and m.orcamento_id = v_med.orcamento_id and mi.id <> new.id;
  if v_outras + new.quantidade > v_orcada then
    raise exception 'Quantidade medida excede o orçado' using errcode = 'P0001';
  end if;

  new.valor := round(new.quantidade * v_preco, 2);
  return new;
end $$;
create trigger trg_20_medicao_itens_calc before insert or update or delete on medicao_itens
  for each row execute function fn_medicao_itens_calc();

-- total da medição = Σ valor
create or replace function fn_medicao_itens_totaliza() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update medicoes m
     set total = coalesce((select sum(mi.valor) from medicao_itens mi where mi.medicao_id = m.id), 0)
   where m.id in (select (case when tg_op = 'DELETE' then old.medicao_id else new.medicao_id end)
                  union select (case when tg_op = 'UPDATE' then old.medicao_id end));
  return null;
end $$;
create trigger trg_medicao_itens_totaliza after insert or update or delete on medicao_itens
  for each row execute function fn_medicao_itens_totaliza();

revoke execute on function fn_cronograma_distribuicoes_valida(), fn_cronograma_distribuicoes_soma(),
  fn_medicao_itens_calc(), fn_medicao_itens_totaliza() from public, anon;
