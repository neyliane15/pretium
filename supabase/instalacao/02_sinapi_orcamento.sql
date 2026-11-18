-- PRETIUM — Instalação pelo SQL Editor do Supabase
-- PARTE 2 de 3 — SINAPI, composições, orçamento, encargos, cronograma, medições, honorários
-- Gerado a partir de supabase/migrations. Rode as partes NA ORDEM, cada uma uma única vez.

-- ===== 0010_sinapi_enums_util.sql =====
-- =============================================================================
-- 0010 — BACKEND-2: enums de referências/orçamento, f_unaccent, utilitários de trigger
-- Contrato: docs/ARQUITETURA.md §5.1, §5.3, §5.4
-- Depende de (B1): regime_desoneracao, set_updated_at(), is_admin()
-- =============================================================================

-- ─── Enums (§5.1) ────────────────────────────────────────────────────────────
create type fonte_referencia as enum ('sinapi', 'propria');
create type insumo_tipo as enum ('material', 'mao_de_obra', 'equipamento', 'servico', 'taxa', 'outro');
create type data_base_status as enum ('rascunho', 'publicada', 'arquivada');
create type importacao_tipo as enum ('insumos', 'composicoes', 'analitico');
create type importacao_status as enum ('pendente', 'processando', 'concluida', 'erro', 'cancelada');
create type orcamento_status as enum ('rascunho', 'em_revisao', 'aprovado', 'arquivado');
create type item_referencia_tipo as enum ('composicao', 'insumo', 'livre');
create type composicao_item_tipo as enum ('insumo', 'composicao');
create type cronograma_periodicidade as enum ('semanal', 'quinzenal', 'mensal');
create type medicao_status as enum ('aberta', 'fechada', 'aprovada');
create type encargo_grupo as enum ('A', 'B', 'C', 'D');
create type honorario_metodo as enum ('area', 'percentual_obra', 'horas', 'fixo');
create type disciplina_projeto as enum (
  'arquitetonico', 'interiores', 'paisagismo', 'estrutural', 'fundacoes', 'hidrossanitario',
  'eletrico', 'spda', 'cabeamento', 'climatizacao', 'incendio', 'gas', 'luminotecnico',
  'orcamento', 'coordenacao', 'aprovacao_legal', 'outro'
);
create type honorario_status as enum ('rascunho', 'enviado', 'aprovado', 'recusado');

-- ─── f_unaccent(text): wrapper IMMUTABLE ─────────────────────────────────────
-- Usa a extensão `unaccent` (criada pelo B1 em 0001, normalmente no schema `extensions`),
-- qualificando o schema para funcionar com qualquer search_path. Se a extensão não existir
-- (ambiente sem contrib), cai num translate() equivalente para o português — também imutável.
do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'unaccent';
  if v_schema is null then
    begin
      create extension if not exists unaccent with schema extensions;
      v_schema := 'extensions';
    exception when others then
      v_schema := null;
    end;
  end if;

  if v_schema is not null then
    execute format($f$
      create or replace function public.f_unaccent(text) returns text
      language sql immutable parallel safe strict
      as $b$ select %1$I.unaccent(%2$L::regdictionary, $1) $b$
    $f$, v_schema, v_schema || '.unaccent');
  else
    create or replace function public.f_unaccent(text) returns text
    language sql immutable parallel safe strict
    as $b$
      select translate($1,
        'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
        'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy')
    $b$;
  end if;
end $$;

comment on function f_unaccent(text) is 'Remove acentos (wrapper imutável de unaccent) — usado em índices e na busca.';

-- ─── fn_herda_organizacao(): copia organizacao_id do registro-pai ──────────
-- Uso: create trigger ... before insert or update ... execute function
--        fn_herda_organizacao('<tabela_pai>', '<coluna_fk>' [, 'nullable']);
-- * Sempre sobrescreve NEW.organizacao_id com a organização do pai;
-- * se o cliente enviou um organizacao_id diferente do pai ⇒ erro;
-- * 'nullable': o pai pode ter organizacao_id nulo (referências globais).
-- security definer: precisa ler o pai mesmo que a RLS do pai esconda a linha; a RLS da
-- própria tabela-filha (with check can_edit_org(organizacao_id)) continua valendo.
create or replace function fn_herda_organizacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tabela   text := tg_argv[0];
  v_coluna   text := tg_argv[1];
  v_nullable boolean := coalesce(tg_argv[2], '') = 'nullable';
  v_pai_id   uuid;
  v_org      uuid;
  v_achou    boolean;
  v_enviado  uuid;
begin
  v_pai_id := (to_jsonb(new) ->> v_coluna)::uuid;
  v_enviado := (to_jsonb(new) ->> 'organizacao_id')::uuid;
  if v_pai_id is null then
    raise exception 'Registro pai não informado (%).', v_coluna using errcode = 'P0001';
  end if;
  execute format('select true, organizacao_id from public.%I where id = $1', v_tabela)
     into v_achou, v_org using v_pai_id;
  if v_achou is null then
    raise exception 'Registro pai não encontrado (%).', v_tabela using errcode = 'P0001';
  end if;
  if v_org is null and not v_nullable then
    raise exception 'Registro pai sem organização (%).', v_tabela using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' and v_enviado is not null and v_enviado is distinct from v_org then
    raise exception 'A organização informada difere da organização do registro pai.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and v_org is distinct from (to_jsonb(old) ->> 'organizacao_id')::uuid then
    raise exception 'Não é possível mover o registro para outra organização.' using errcode = 'P0001';
  end if;
  new := jsonb_populate_record(new, jsonb_build_object('organizacao_id', v_org));
  return new;
end $$;

comment on function fn_herda_organizacao() is
  'Trigger genérico (B2): copia organizacao_id do pai. Args: tabela_pai, coluna_fk [, ''nullable''].';

-- ─── Utilitários internos ───────────────────────────────────────────────────
-- Normaliza código SINAPI: trim, remove ".0" final, zeros à esquerda (§9.2).
create or replace function fn_sinapi_normalizar_codigo(p text) returns text
language sql immutable parallel safe as $$
  select case
    when p is null then null
    else nullif(
      coalesce(nullif(ltrim(regexp_replace(btrim(p), '\.0+$', ''), '0'), ''),
               case when btrim(p) ~ '^0+(\.0+)?$' then '0' end),
      '')
  end
$$;

-- Converte jsonb (número ou texto pt-BR "1.234,56" / "1234,56" / "1234.56") em numeric; null se inválido.
create or replace function fn_numero_br(p jsonb) returns numeric
language plpgsql immutable parallel safe as $$
declare
  t text;
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) = 'number' then return (p #>> '{}')::numeric; end if;
  if jsonb_typeof(p) <> 'string' then return null; end if;
  t := replace(btrim(p #>> '{}'), ' ', '');
  t := regexp_replace(t, '^R\$', '');
  if t = '' then return null; end if;
  if t ~ '^-?\d{1,3}(\.\d{3})+(,\d+)?$' then
    t := replace(replace(t, '.', ''), ',', '.');
  elsif t ~ '^-?\d+,\d+$' then
    t := replace(t, ',', '.');
  elsif t !~ '^-?\d+(\.\d+)?$' then
    return null;
  end if;
  return t::numeric;
end $$;

-- Ordenação "natural" de códigos ("1.10" depois de "1.9"; "370" antes de "1379"), espelhando
-- localeCompare(..., { numeric: true }) de calc.ts para códigos numéricos/hierárquicos.
create or replace function fn_codigo_ordem(p text) returns numeric[]
language sql immutable parallel safe as $$
  select case
    when p is null or p = '' then '{}'::numeric[]
    when p ~ '^\d+(\.\d+)*$' then string_to_array(p, '.')::numeric[]
    else null
  end
$$;

revoke execute on function fn_herda_organizacao() from public, anon;

-- ===== 0011_referencias.sql =====
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

-- ===== 0012_referencias_rls.sql =====
-- =============================================================================
-- 0012 — BACKEND-2: RLS das referências (§6.3 — padrão "referências mistas")
-- SINAPI (organizacao_id null): leitura p/ usuário ativo, escrita só admin.
-- Próprias: leitura membros, escrita editor/owner (can_edit_org).
-- =============================================================================

-- ─── datas_base ──────────────────────────────────────────────────────────────
-- Usuário comum vê as publicadas e também as que algum orçamento da sua organização usa
-- (ex.: data-base arquivada depois de o orçamento ter sido criado). Ver CONTRATO_ALTERACOES.
create or replace function fn_data_base_em_uso_pela_org(p_data_base_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return exists (select 1 from orcamentos o
                  where o.data_base_id = p_data_base_id and is_org_member(o.organizacao_id));
end $$;
revoke execute on function fn_data_base_em_uso_pela_org(uuid) from public, anon;
grant execute on function fn_data_base_em_uso_pela_org(uuid) to authenticated;

alter table datas_base enable row level security;
create policy datas_base_select on datas_base for select to authenticated
  using (
    (select is_admin())
    or ((select is_active_user()) and status = 'publicada')
    or fn_data_base_em_uso_pela_org(id)
  );
create policy datas_base_insert on datas_base for insert to authenticated with check ((select is_admin()));
create policy datas_base_update on datas_base for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));
create policy datas_base_delete on datas_base for delete to authenticated using ((select is_admin()));

-- ─── insumos / composicoes / composicao_itens ───────────────────────────────
alter table insumos enable row level security;
create policy insumos_select on insumos for select to authenticated
  using ((organizacao_id is null and (select is_active_user())) or is_org_member(organizacao_id));
create policy insumos_insert on insumos for insert to authenticated
  with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));
create policy insumos_update on insumos for update to authenticated
  using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)))
  with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));
create policy insumos_delete on insumos for delete to authenticated
  using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));

alter table composicoes enable row level security;
create policy composicoes_select on composicoes for select to authenticated
  using ((organizacao_id is null and (select is_active_user())) or is_org_member(organizacao_id));
create policy composicoes_insert on composicoes for insert to authenticated
  with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));
create policy composicoes_update on composicoes for update to authenticated
  using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)))
  with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));
create policy composicoes_delete on composicoes for delete to authenticated
  using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));

alter table composicao_itens enable row level security;
create policy composicao_itens_select on composicao_itens for select to authenticated
  using ((organizacao_id is null and (select is_active_user())) or is_org_member(organizacao_id));
create policy composicao_itens_insert on composicao_itens for insert to authenticated
  with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));
create policy composicao_itens_update on composicao_itens for update to authenticated
  using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)))
  with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));
create policy composicao_itens_delete on composicao_itens for delete to authenticated
  using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)));

-- ─── preços de referência: leitura p/ ativos, escrita admin ─────────────────
alter table insumo_precos enable row level security;
create policy insumo_precos_select on insumo_precos for select to authenticated using ((select is_active_user()));
create policy insumo_precos_insert on insumo_precos for insert to authenticated with check ((select is_admin()));
create policy insumo_precos_update on insumo_precos for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));
create policy insumo_precos_delete on insumo_precos for delete to authenticated using ((select is_admin()));

alter table composicao_precos enable row level security;
create policy composicao_precos_select on composicao_precos for select to authenticated using ((select is_active_user()));
create policy composicao_precos_insert on composicao_precos for insert to authenticated with check ((select is_admin()));
create policy composicao_precos_update on composicao_precos for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));
create policy composicao_precos_delete on composicao_precos for delete to authenticated using ((select is_admin()));

-- ─── sinapi_importacoes: só admin ────────────────────────────────────────────
alter table sinapi_importacoes enable row level security;
create policy sinapi_importacoes_admin on sinapi_importacoes for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));

-- anon não acessa nada destas tabelas
revoke all on datas_base, insumos, composicoes, composicao_itens, insumo_precos, composicao_precos,
  sinapi_importacoes from anon;

-- ===== 0013_sinapi_importacao.sql =====
-- =============================================================================
-- 0013 — BACKEND-2: importação SINAPI em lotes (§7.2 "Importação SINAPI", §9)
-- Lotes ≤ 2000 linhas, upsert idempotente (on conflict), erros por linha acumulados em
-- sinapi_importacoes.erros (máx. 500). Uma linha inválida nunca aborta o lote: se o upsert
-- em conjunto falhar, o lote é reprocessado linha a linha com captura de erro.
-- =============================================================================

-- ─── Utilitários internos ───────────────────────────────────────────────────
create or replace function fn_sinapi_tipo_heuristica(p_unidade text, p_descricao text) returns insumo_tipo
language sql immutable parallel safe as $$
  select case
    when upper(coalesce(p_unidade, '')) in ('CHP', 'CHI') then 'equipamento'::insumo_tipo
    when upper(coalesce(p_unidade, '')) in ('H', 'MES') and upper(coalesce(p_descricao, '')) !~ '(EQUIPAMENTO|CAMINHAO|CAMINHÃO|BETONEIRA|VIBRADOR|GUINDASTE|RETROESCAVADEIRA|ESCAVADEIRA|ROLO|COMPACTADOR|LOCACAO|LOCAÇÃO|ALUGUEL)'
      then 'mao_de_obra'::insumo_tipo
    else 'material'::insumo_tipo
  end
$$;

create or replace function fn_sinapi_tipo_insumo(p text) returns insumo_tipo
language sql immutable parallel safe as $$
  select case when lower(btrim(p)) in ('material', 'mao_de_obra', 'equipamento', 'servico', 'taxa', 'outro')
              then lower(btrim(p))::insumo_tipo end
$$;

-- Trava e devolve a importação em andamento.
create or replace function fn_sinapi_importacao_ativa(p_importacao_id uuid) returns sinapi_importacoes
language plpgsql security definer set search_path = public as $$
declare
  v sinapi_importacoes;
begin
  select * into v from sinapi_importacoes where id = p_importacao_id for update;
  if not found then
    raise exception 'Importação não encontrada.' using errcode = 'P0001';
  end if;
  if v.status not in ('pendente', 'processando') then
    raise exception 'Esta importação já foi finalizada ou cancelada.' using errcode = 'P0001';
  end if;
  return v;
end $$;

-- Registra contadores e erros de um lote (mantém no máximo 500 erros).
create or replace function fn_sinapi_registrar_lote(p_importacao_id uuid, p_total integer, p_ok integer, p_erros jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update sinapi_importacoes s
     set total_linhas = s.total_linhas + p_total,
         linhas_ok    = s.linhas_ok + p_ok,
         linhas_erro  = s.linhas_erro + coalesce(jsonb_array_length(p_erros), 0),
         status       = 'processando',
         erros = case
           when jsonb_array_length(s.erros) >= 500 or coalesce(jsonb_array_length(p_erros), 0) = 0 then s.erros
           else (select coalesce(jsonb_agg(e order by o), '[]'::jsonb)
                   from (select e, o from jsonb_array_elements(s.erros || p_erros) with ordinality t(e, o)
                          order by o limit 500) x)
         end
   where s.id = p_importacao_id;
end $$;

create or replace function fn_sinapi_validar_lote(p_linhas jsonb) returns integer
language plpgsql immutable as $$
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'Lote inválido: envie uma lista de linhas.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_linhas) > 2000 then
    raise exception 'Lote muito grande: envie no máximo 2000 linhas por chamada.' using errcode = 'P0001';
  end if;
  return jsonb_array_length(p_linhas);
end $$;

-- ─── Parsers (jsonb → linhas normalizadas + mensagem de erro) ───────────────
create or replace function fn_sinapi_parse_insumos(p_linhas jsonb)
returns table (ord bigint, linha integer, codigo text, descricao text, unidade text, preco numeric,
               origem_preco text, tipo insumo_tipo, tipo_informado boolean, classificacao text,
               erro text, bruto jsonb)
language sql immutable as $$
  select x.ord, x.linha, x.codigo, x.descricao, x.unidade, x.preco, x.origem_preco,
         coalesce(fn_sinapi_tipo_insumo(x.tipo_txt), fn_sinapi_tipo_heuristica(x.unidade, x.descricao)),
         fn_sinapi_tipo_insumo(x.tipo_txt) is not null,
         x.classificacao,
         case
           when x.codigo is null or x.codigo !~ '^\d+$' then 'Código inválido'
           when x.descricao is null then 'Descrição ausente'
           when x.unidade is null then 'Unidade ausente'
           when x.preco_bruto is null or jsonb_typeof(x.preco_bruto) = 'null'
                or (jsonb_typeof(x.preco_bruto) = 'string' and btrim(x.preco_bruto #>> '{}') = '') then 'Preço ausente'
           when x.preco is null then 'Preço inválido'
           when x.preco < 0 then 'Preço negativo'
           when x.preco >= 10000000000 then 'Preço fora do intervalo'
         end,
         x.e
    from (
      select t.o as ord, t.e,
             coalesce(fn_numero_br(t.e -> 'linha')::integer, t.o::integer) as linha,
             fn_sinapi_normalizar_codigo(t.e ->> 'codigo') as codigo,
             nullif(btrim(t.e ->> 'descricao'), '') as descricao,
             nullif(upper(btrim(t.e ->> 'unidade')), '') as unidade,
             t.e -> 'preco' as preco_bruto,
             fn_numero_br(t.e -> 'preco') as preco,
             nullif(upper(btrim(t.e ->> 'origem_preco')), '') as origem_preco,
             t.e ->> 'tipo' as tipo_txt,
             nullif(btrim(t.e ->> 'classificacao'), '') as classificacao
        from jsonb_array_elements(p_linhas) with ordinality t(e, o)
    ) x
$$;

create or replace function fn_sinapi_parse_composicoes(p_linhas jsonb)
returns table (ord bigint, linha integer, codigo text, descricao text, unidade text, grupo text,
               custo numeric, custo_mao_obra numeric, custo_material numeric, custo_equipamento numeric,
               custo_servicos numeric, perc_mao_obra numeric, erro text, bruto jsonb)
language sql immutable as $$
  select x.ord, x.linha, x.codigo, x.descricao, x.unidade, x.grupo, x.custo,
         x.cmo, x.cmat, x.ceq, x.cserv, x.pmo,
         case
           when x.codigo is null or x.codigo !~ '^\d+$' then 'Código inválido'
           when x.descricao is null then 'Descrição ausente'
           when x.unidade is null then 'Unidade ausente'
           when x.custo_bruto is null or jsonb_typeof(x.custo_bruto) = 'null'
                or (jsonb_typeof(x.custo_bruto) = 'string' and btrim(x.custo_bruto #>> '{}') = '') then 'Custo ausente'
           when x.custo is null then 'Custo inválido'
           when x.custo < 0 then 'Custo negativo'
           when x.custo >= 10000000000 then 'Custo fora do intervalo'
           when x.pmo is not null and (x.pmo < 0 or x.pmo > 100000) then 'Percentual de mão de obra inválido'
         end,
         x.e
    from (
      select t.o as ord, t.e,
             coalesce(fn_numero_br(t.e -> 'linha')::integer, t.o::integer) as linha,
             fn_sinapi_normalizar_codigo(t.e ->> 'codigo') as codigo,
             nullif(btrim(t.e ->> 'descricao'), '') as descricao,
             nullif(upper(btrim(t.e ->> 'unidade')), '') as unidade,
             nullif(btrim(t.e ->> 'grupo'), '') as grupo,
             t.e -> 'custo' as custo_bruto,
             fn_numero_br(t.e -> 'custo') as custo,
             fn_numero_br(t.e -> 'custo_mao_obra') as cmo,
             fn_numero_br(t.e -> 'custo_material') as cmat,
             fn_numero_br(t.e -> 'custo_equipamento') as ceq,
             fn_numero_br(t.e -> 'custo_servicos') as cserv,
             fn_numero_br(t.e -> 'perc_mao_obra') as pmo
        from jsonb_array_elements(p_linhas) with ordinality t(e, o)
    ) x
$$;

create or replace function fn_sinapi_parse_composicao_itens(p_linhas jsonb)
returns table (ord bigint, linha integer, composicao_codigo text, tipo_item composicao_item_tipo,
               item_codigo text, coeficiente numeric, descricao text, unidade text, erro text, bruto jsonb)
language sql immutable as $$
  select x.ord, x.linha, x.cc,
         case x.tipo_txt when 'INSUMO' then 'insumo'::composicao_item_tipo
                         when 'COMPOSICAO' then 'composicao'::composicao_item_tipo end,
         x.ic, x.coef, x.descricao, x.unidade,
         case
           when x.cc is null or x.cc !~ '^\d+$' then 'Código da composição inválido'
           when x.tipo_txt is null or x.tipo_txt not in ('INSUMO', 'COMPOSICAO') then 'Tipo de item inválido (use INSUMO ou COMPOSICAO)'
           when x.ic is null or x.ic !~ '^\d+$' then 'Código do item inválido'
           when x.tipo_txt = 'COMPOSICAO' and x.ic = x.cc then 'Composição não pode conter a si mesma'
           when x.coef is null then 'Coeficiente ausente ou inválido'
           when x.coef <= 0 then 'Coeficiente deve ser maior que zero'
           when x.coef >= 100000000000 then 'Coeficiente fora do intervalo'
         end,
         x.e
    from (
      select t.o as ord, t.e,
             coalesce(fn_numero_br(t.e -> 'linha')::integer, t.o::integer) as linha,
             fn_sinapi_normalizar_codigo(t.e ->> 'composicao_codigo') as cc,
             translate(upper(btrim(t.e ->> 'tipo_item')), 'ÇÃ', 'CA') as tipo_txt,
             fn_sinapi_normalizar_codigo(t.e ->> 'item_codigo') as ic,
             round(fn_numero_br(t.e -> 'coeficiente'), 7) as coef,
             nullif(btrim(t.e ->> 'descricao'), '') as descricao,
             nullif(upper(btrim(t.e ->> 'unidade')), '') as unidade
        from jsonb_array_elements(p_linhas) with ordinality t(e, o)
    ) x
$$;

-- ─── Upserts em conjunto (chamados com o lote inteiro ou com uma linha só) ──
create or replace function fn_sinapi_upsert_insumos(p_importacao_id uuid, p_data_base_id uuid, p_linhas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  with v as (
    select distinct on (p.codigo) p.*
      from fn_sinapi_parse_insumos(p_linhas) p
     where p.erro is null
     order by p.codigo, p.ord desc
  ), up as (
    insert into insumos as i (fonte, codigo, descricao, unidade, tipo, classificacao, is_demo, ativo)
    select 'sinapi', v.codigo, v.descricao, v.unidade, v.tipo, v.classificacao, false, true from v
    on conflict (codigo) where organizacao_id is null do update
       set descricao = excluded.descricao,
           unidade = excluded.unidade,
           classificacao = coalesce(excluded.classificacao, i.classificacao),
           is_demo = false,
           ativo = true
    returning i.id, i.codigo
  )
  insert into insumo_precos as ip (data_base_id, insumo_id, preco, origem_preco, importacao_id)
  select p_data_base_id, up.id, v.preco, v.origem_preco, p_importacao_id
    from up join v on v.codigo = up.codigo
  on conflict (data_base_id, insumo_id) do update
     set preco = excluded.preco, origem_preco = excluded.origem_preco, importacao_id = excluded.importacao_id;
  get diagnostics v_n = row_count;

  -- tipo só é sobrescrito quando informado na linha (senão mantém o atual/heurístico)
  update insumos i set tipo = v.tipo
    from (select distinct on (p.codigo) p.codigo, p.tipo, p.tipo_informado
            from fn_sinapi_parse_insumos(p_linhas) p
           where p.erro is null order by p.codigo, p.ord desc) v
   where v.tipo_informado and i.organizacao_id is null and i.codigo = v.codigo and i.tipo is distinct from v.tipo;
  return v_n;
end $$;

create or replace function fn_sinapi_upsert_composicoes(p_importacao_id uuid, p_data_base_id uuid, p_linhas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  with v as (
    select distinct on (p.codigo) p.*
      from fn_sinapi_parse_composicoes(p_linhas) p
     where p.erro is null
     order by p.codigo, p.ord desc
  ), up as (
    insert into composicoes as c (fonte, codigo, descricao, unidade, grupo, is_demo, ativo)
    select 'sinapi', v.codigo, v.descricao, v.unidade, v.grupo, false, true from v
    on conflict (codigo) where organizacao_id is null do update
       set descricao = excluded.descricao,
           unidade = excluded.unidade,
           grupo = coalesce(excluded.grupo, c.grupo),
           is_demo = false,
           ativo = true
    returning c.id, c.codigo
  )
  insert into composicao_precos as cp (data_base_id, composicao_id, custo, custo_mao_obra, custo_material,
                                        custo_equipamento, custo_servicos, perc_mao_obra, importacao_id)
  select p_data_base_id, up.id, v.custo, v.custo_mao_obra, v.custo_material, v.custo_equipamento,
         v.custo_servicos, v.perc_mao_obra, p_importacao_id
    from up join v on v.codigo = up.codigo
  on conflict (data_base_id, composicao_id) do update
     set custo = excluded.custo, custo_mao_obra = excluded.custo_mao_obra,
         custo_material = excluded.custo_material, custo_equipamento = excluded.custo_equipamento,
         custo_servicos = excluded.custo_servicos, perc_mao_obra = excluded.perc_mao_obra,
         importacao_id = excluded.importacao_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function fn_sinapi_upsert_composicao_itens(p_importacao_id uuid, p_linhas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  -- esqueletos: composições-pai
  insert into composicoes (fonte, codigo, descricao, unidade, is_demo)
  select distinct 'sinapi'::fonte_referencia, p.composicao_codigo,
         'COMPOSIÇÃO ' || p.composicao_codigo || ' (sem descrição)', 'UN', false
    from fn_sinapi_parse_composicao_itens(p_linhas) p
   where p.erro is null
  on conflict (codigo) where organizacao_id is null do nothing;

  -- esqueletos: insumos e subcomposições referenciados (descrição/unidade da linha)
  insert into insumos (fonte, codigo, descricao, unidade, tipo, is_demo)
  select distinct on (p.item_codigo) 'sinapi'::fonte_referencia, p.item_codigo,
         coalesce(p.descricao, 'INSUMO ' || p.item_codigo || ' (sem descrição)'),
         coalesce(p.unidade, 'UN'), fn_sinapi_tipo_heuristica(p.unidade, p.descricao), false
    from fn_sinapi_parse_composicao_itens(p_linhas) p
   where p.erro is null and p.tipo_item = 'insumo'
   order by p.item_codigo, p.ord desc
  on conflict (codigo) where organizacao_id is null do nothing;

  insert into composicoes (fonte, codigo, descricao, unidade, is_demo)
  select distinct on (p.item_codigo) 'sinapi'::fonte_referencia, p.item_codigo,
         coalesce(p.descricao, 'COMPOSIÇÃO ' || p.item_codigo || ' (sem descrição)'),
         coalesce(p.unidade, 'UN'), false
    from fn_sinapi_parse_composicao_itens(p_linhas) p
   where p.erro is null and p.tipo_item = 'composicao'
   order by p.item_codigo, p.ord desc
  on conflict (codigo) where organizacao_id is null do nothing;

  -- completa esqueletos antigos quando a linha traz descrição
  update composicoes c set descricao = p.descricao, unidade = coalesce(p.unidade, c.unidade)
    from (select distinct on (item_codigo) item_codigo, descricao, unidade
            from fn_sinapi_parse_composicao_itens(p_linhas)
           where erro is null and tipo_item = 'composicao' and descricao is not null
           order by item_codigo, ord desc) p
   where c.organizacao_id is null and c.codigo = p.item_codigo and c.descricao like '% (sem descrição)';
  update insumos i set descricao = p.descricao, unidade = coalesce(p.unidade, i.unidade)
    from (select distinct on (item_codigo) item_codigo, descricao, unidade
            from fn_sinapi_parse_composicao_itens(p_linhas)
           where erro is null and tipo_item = 'insumo' and descricao is not null
           order by item_codigo, ord desc) p
   where i.organizacao_id is null and i.codigo = p.item_codigo and i.descricao like '% (sem descrição)';

  with v as (
    select distinct on (p.composicao_codigo, p.tipo_item, p.item_codigo) p.*
      from fn_sinapi_parse_composicao_itens(p_linhas) p
     where p.erro is null
     order by p.composicao_codigo, p.tipo_item, p.item_codigo, p.ord desc
  )
  insert into composicao_itens as ci (composicao_id, tipo_item, insumo_id, subcomposicao_id, coeficiente, ordem, importacao_id)
  select c.id, v.tipo_item,
         case when v.tipo_item = 'insumo' then i.id end,
         case when v.tipo_item = 'composicao' then s.id end,
         v.coeficiente, v.linha, p_importacao_id
    from v
    join composicoes c on c.organizacao_id is null and c.codigo = v.composicao_codigo
    left join insumos i on v.tipo_item = 'insumo' and i.organizacao_id is null and i.codigo = v.item_codigo
    left join composicoes s on v.tipo_item = 'composicao' and s.organizacao_id is null and s.codigo = v.item_codigo
  on conflict (composicao_id, tipo_item, (coalesce(insumo_id, subcomposicao_id))) do update
     set coeficiente = excluded.coeficiente, ordem = excluded.ordem, importacao_id = excluded.importacao_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ─── Executor genérico: tenta o lote; se falhar, linha a linha ──────────────
create or replace function fn_sinapi_processar_lote(p_tipo text, p_importacao_id uuid, p_linhas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_imp    sinapi_importacoes;
  v_total  integer;
  v_erros  jsonb;
  v_validas jsonb;
  v_ok     integer := 0;
  r        record;
begin
  perform assert_admin();
  v_total := fn_sinapi_validar_lote(p_linhas);
  v_imp := fn_sinapi_importacao_ativa(p_importacao_id);

  if p_tipo = 'insumos' then
    select coalesce(jsonb_agg(jsonb_build_object('linha', linha, 'codigo', codigo, 'mensagem', erro) order by ord) filter (where erro is not null), '[]'),
           coalesce(jsonb_agg(bruto order by ord) filter (where erro is null), '[]')
      into v_erros, v_validas from fn_sinapi_parse_insumos(p_linhas);
  elsif p_tipo = 'composicoes' then
    select coalesce(jsonb_agg(jsonb_build_object('linha', linha, 'codigo', codigo, 'mensagem', erro) order by ord) filter (where erro is not null), '[]'),
           coalesce(jsonb_agg(bruto order by ord) filter (where erro is null), '[]')
      into v_erros, v_validas from fn_sinapi_parse_composicoes(p_linhas);
  else
    select coalesce(jsonb_agg(jsonb_build_object('linha', linha, 'codigo', composicao_codigo, 'mensagem', erro) order by ord) filter (where erro is not null), '[]'),
           coalesce(jsonb_agg(bruto order by ord) filter (where erro is null), '[]')
      into v_erros, v_validas from fn_sinapi_parse_composicao_itens(p_linhas);
  end if;

  if jsonb_array_length(v_validas) > 0 then
    begin
      if p_tipo = 'insumos' then perform fn_sinapi_upsert_insumos(p_importacao_id, v_imp.data_base_id, v_validas);
      elsif p_tipo = 'composicoes' then perform fn_sinapi_upsert_composicoes(p_importacao_id, v_imp.data_base_id, v_validas);
      else perform fn_sinapi_upsert_composicao_itens(p_importacao_id, v_validas);
      end if;
      v_ok := jsonb_array_length(v_validas);
    exception when others then
      -- reprocessa linha a linha para isolar a(s) linha(s) problemática(s)
      v_ok := 0;
      for r in select e, o from jsonb_array_elements(v_validas) with ordinality t(e, o) loop
        begin
          if p_tipo = 'insumos' then perform fn_sinapi_upsert_insumos(p_importacao_id, v_imp.data_base_id, jsonb_build_array(r.e));
          elsif p_tipo = 'composicoes' then perform fn_sinapi_upsert_composicoes(p_importacao_id, v_imp.data_base_id, jsonb_build_array(r.e));
          else perform fn_sinapi_upsert_composicao_itens(p_importacao_id, jsonb_build_array(r.e));
          end if;
          v_ok := v_ok + 1;
        exception when others then
          v_erros := v_erros || jsonb_build_array(jsonb_build_object(
            'linha', coalesce(fn_numero_br(r.e -> 'linha')::integer, r.o::integer),
            'codigo', coalesce(r.e ->> 'codigo', r.e ->> 'composicao_codigo'),
            'mensagem', sqlerrm));
        end;
      end loop;
    end;
  end if;

  perform fn_sinapi_registrar_lote(p_importacao_id, v_total, v_ok, v_erros);
  return v_ok;
end $$;

-- ─── RPCs públicas ───────────────────────────────────────────────────────────
create or replace function fn_sinapi_iniciar_importacao(
  p_uf char(2), p_ano integer, p_mes integer, p_regime regime_desoneracao,
  p_tipo importacao_tipo, p_arquivo_nome text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uf  text := upper(btrim(p_uf));
  v_db  uuid;
  v_id  uuid;
begin
  perform assert_admin();
  if v_uf is null or v_uf !~ '^[A-Z]{2}$' then
    raise exception 'UF inválida.' using errcode = 'P0001';
  end if;
  if p_ano is null or p_ano not between 2000 and 2100 then
    raise exception 'Ano inválido.' using errcode = 'P0001';
  end if;
  if p_mes is null or p_mes not between 1 and 12 then
    raise exception 'Mês inválido.' using errcode = 'P0001';
  end if;
  if p_regime is null or p_tipo is null then
    raise exception 'Informe o regime e o tipo de planilha.' using errcode = 'P0001';
  end if;

  insert into datas_base (uf, ano, mes, regime, is_demo, status, descricao, fonte_arquivo)
  values (v_uf, p_ano, p_mes, p_regime, false, 'rascunho',
          format('SINAPI %s %s/%s – %s', v_uf, lpad(p_mes::text, 2, '0'), p_ano,
                 case p_regime when 'desonerado' then 'Desonerado' else 'Não desonerado' end),
          p_arquivo_nome)
  on conflict (uf, ano, mes, regime, is_demo) do update
     set fonte_arquivo = case
           when excluded.fonte_arquivo is null then datas_base.fonte_arquivo
           when datas_base.fonte_arquivo is null then excluded.fonte_arquivo
           when position(excluded.fonte_arquivo in datas_base.fonte_arquivo) > 0 then datas_base.fonte_arquivo
           else datas_base.fonte_arquivo || '; ' || excluded.fonte_arquivo end
  returning id into v_db;

  insert into sinapi_importacoes (data_base_id, tipo, status, arquivo_nome)
  values (v_db, p_tipo, 'processando', p_arquivo_nome)
  returning id into v_id;
  return v_id;
end $$;

create or replace function fn_sinapi_importar_insumos(p_importacao_id uuid, p_linhas jsonb) returns integer
language sql security definer set search_path = public as $$
  select fn_sinapi_processar_lote('insumos', p_importacao_id, p_linhas)
$$;

create or replace function fn_sinapi_importar_composicoes(p_importacao_id uuid, p_linhas jsonb) returns integer
language sql security definer set search_path = public as $$
  select fn_sinapi_processar_lote('composicoes', p_importacao_id, p_linhas)
$$;

create or replace function fn_sinapi_importar_composicao_itens(p_importacao_id uuid, p_linhas jsonb) returns integer
language sql security definer set search_path = public as $$
  select fn_sinapi_processar_lote('composicao_itens', p_importacao_id, p_linhas)
$$;

create or replace function fn_sinapi_finalizar_importacao(p_importacao_id uuid, p_publicar boolean default false)
returns sinapi_importacoes
language plpgsql security definer set search_path = public as $$
declare
  v sinapi_importacoes;
  v_removidos integer := 0;
begin
  perform assert_admin();
  v := fn_sinapi_importacao_ativa(p_importacao_id);

  if v.tipo = 'analitico' then
    -- composições SINAPI tocadas nesta importação: remove itens que não vieram nela
    delete from composicao_itens ci
     where ci.composicao_id in (select distinct x.composicao_id from composicao_itens x where x.importacao_id = v.id)
       and ci.importacao_id is distinct from v.id
       and ci.organizacao_id is null;
    get diagnostics v_removidos = row_count;
  end if;

  update sinapi_importacoes
     set status = case when linhas_ok = 0 and linhas_erro > 0 then 'erro'::importacao_status else 'concluida'::importacao_status end,
         finalizado_em = now()
   where id = v.id
  returning * into v;

  if coalesce(p_publicar, false) and v.status = 'concluida' then
    update datas_base set status = 'publicada', publicada_em = now() where id = v.data_base_id;
  end if;

  perform registrar_auditoria('importar_sinapi', 'sinapi_importacoes', v.id::text,
    jsonb_build_object('data_base_id', v.data_base_id, 'tipo', v.tipo, 'status', v.status,
                       'total_linhas', v.total_linhas, 'linhas_ok', v.linhas_ok, 'linhas_erro', v.linhas_erro,
                       'itens_removidos', v_removidos, 'publicada', coalesce(p_publicar, false)),
    null);
  return v;
end $$;

create or replace function fn_sinapi_cancelar_importacao(p_importacao_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  perform fn_sinapi_importacao_ativa(p_importacao_id);
  update sinapi_importacoes set status = 'cancelada', finalizado_em = now() where id = p_importacao_id;
end $$;

create or replace function fn_sinapi_publicar_data_base(p_data_base_id uuid, p_status data_base_status)
returns datas_base
language plpgsql security definer set search_path = public as $$
declare
  v datas_base;
begin
  perform assert_admin();
  if p_status is null then
    raise exception 'Informe o status.' using errcode = 'P0001';
  end if;
  update datas_base
     set status = p_status,
         publicada_em = case when p_status = 'publicada' then coalesce(publicada_em, now()) else publicada_em end
   where id = p_data_base_id
  returning * into v;
  if not found then
    raise exception 'Data-base não encontrada.' using errcode = 'P0001';
  end if;
  perform registrar_auditoria('publicar_data_base', 'datas_base', v.id::text,
    jsonb_build_object('status', p_status, 'uf', v.uf, 'ano', v.ano, 'mes', v.mes, 'regime', v.regime), null);
  return v;
end $$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function
  fn_sinapi_importacao_ativa(uuid), fn_sinapi_registrar_lote(uuid, integer, integer, jsonb),
  fn_sinapi_upsert_insumos(uuid, uuid, jsonb), fn_sinapi_upsert_composicoes(uuid, uuid, jsonb),
  fn_sinapi_upsert_composicao_itens(uuid, jsonb), fn_sinapi_processar_lote(text, uuid, jsonb)
  from public, anon, authenticated;

revoke execute on function
  fn_sinapi_iniciar_importacao(char, integer, integer, regime_desoneracao, importacao_tipo, text),
  fn_sinapi_importar_insumos(uuid, jsonb), fn_sinapi_importar_composicoes(uuid, jsonb),
  fn_sinapi_importar_composicao_itens(uuid, jsonb), fn_sinapi_finalizar_importacao(uuid, boolean),
  fn_sinapi_cancelar_importacao(uuid), fn_sinapi_publicar_data_base(uuid, data_base_status)
  from public, anon;
grant execute on function
  fn_sinapi_iniciar_importacao(char, integer, integer, regime_desoneracao, importacao_tipo, text),
  fn_sinapi_importar_insumos(uuid, jsonb), fn_sinapi_importar_composicoes(uuid, jsonb),
  fn_sinapi_importar_composicao_itens(uuid, jsonb), fn_sinapi_finalizar_importacao(uuid, boolean),
  fn_sinapi_cancelar_importacao(uuid), fn_sinapi_publicar_data_base(uuid, data_base_status)
  to authenticated;

-- ===== 0014_orcamento_tabelas.sql =====
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

-- ===== 0015_orcamento_triggers.sql =====
-- =============================================================================
-- 0015 — BACKEND-2: triggers do orçamento
-- herança de organização, updated_at, bloqueio por status, validações da EAP,
-- fn_orcamento_itens_calc (§8.3), memória → quantidade, auditoria
-- =============================================================================

-- ─── Herança de organização ──────────────────────────────────────────────────
create trigger trg_10_orcamentos_herda_org before insert or update of obra_id, organizacao_id on orcamentos
  for each row execute function fn_herda_organizacao('obras', 'obra_id');
create trigger trg_10_orcamento_bdis_herda_org before insert or update of orcamento_id, organizacao_id on orcamento_bdis
  for each row execute function fn_herda_organizacao('orcamentos', 'orcamento_id');
create trigger trg_10_orcamento_etapas_herda_org before insert or update of orcamento_id, organizacao_id on orcamento_etapas
  for each row execute function fn_herda_organizacao('orcamentos', 'orcamento_id');
create trigger trg_10_orcamento_itens_herda_org before insert or update of orcamento_id, organizacao_id on orcamento_itens
  for each row execute function fn_herda_organizacao('orcamentos', 'orcamento_id');
create trigger trg_10_orcamento_insumo_precos_herda_org before insert or update of orcamento_id, organizacao_id on orcamento_insumo_precos
  for each row execute function fn_herda_organizacao('orcamentos', 'orcamento_id');
create trigger trg_10_orcamento_item_memorias_herda_org before insert or update of item_id, organizacao_id on orcamento_item_memorias
  for each row execute function fn_herda_organizacao('orcamento_itens', 'item_id');

-- ─── updated_at ──────────────────────────────────────────────────────────────
create trigger trg_orcamentos_updated_at before update on orcamentos for each row execute function set_updated_at();
create trigger trg_orcamento_bdis_updated_at before update on orcamento_bdis for each row execute function set_updated_at();
create trigger trg_orcamento_etapas_updated_at before update on orcamento_etapas for each row execute function set_updated_at();
create trigger trg_orcamento_itens_updated_at before update on orcamento_itens for each row execute function set_updated_at();
create trigger trg_orcamento_insumo_precos_updated_at before update on orcamento_insumo_precos for each row execute function set_updated_at();
create trigger trg_orcamento_item_memorias_updated_at before update on orcamento_item_memorias for each row execute function set_updated_at();

-- ─── Bloqueio por status (aprovado/arquivado ⇒ somente leitura, exceto admin) ─
-- TG_ARGV[0]: 'orcamento_id' (coluna direta) ou 'item_id' (memórias).
-- Contexto sem usuário (auth.uid() nulo: migrações, seed, service_role) não é bloqueado.
create or replace function fn_orcamento_bloqueio_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row    jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_orc    uuid;
  v_status orcamento_status;
begin
  if auth.uid() is null or is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_argv[0] = 'item_id' then
    select i.orcamento_id into v_orc from orcamento_itens i where i.id = (v_row ->> 'item_id')::uuid;
  else
    v_orc := (v_row ->> 'orcamento_id')::uuid;
  end if;
  select o.status into v_status from orcamentos o where o.id = v_orc;
  -- orçamento inexistente (exclusão em cascata do próprio orçamento) ⇒ não bloqueia
  if v_status in ('aprovado', 'arquivado') then
    raise exception 'Orçamento % está somente leitura. Volte o status para rascunho ou em revisão para editar.',
      case v_status when 'aprovado' then 'aprovado' else 'arquivado' end using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger trg_05_orcamento_bdis_bloqueio before insert or update or delete on orcamento_bdis
  for each row execute function fn_orcamento_bloqueio_status('orcamento_id');
create trigger trg_05_orcamento_etapas_bloqueio before insert or update or delete on orcamento_etapas
  for each row execute function fn_orcamento_bloqueio_status('orcamento_id');
create trigger trg_05_orcamento_itens_bloqueio before insert or update or delete on orcamento_itens
  for each row execute function fn_orcamento_bloqueio_status('orcamento_id');
create trigger trg_05_orcamento_insumo_precos_bloqueio before insert or update or delete on orcamento_insumo_precos
  for each row execute function fn_orcamento_bloqueio_status('orcamento_id');
create trigger trg_05_orcamento_item_memorias_bloqueio before insert or update or delete on orcamento_item_memorias
  for each row execute function fn_orcamento_bloqueio_status('item_id');

-- ─── Etapas: mesmo orçamento do pai, profundidade ≤ 3, sem ciclo ────────────
create or replace function fn_orcamento_etapas_valida() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pai_orc uuid;
  v_nivel   integer;
  v_altura  integer := 0;
  v_ciclo   boolean;
begin
  if new.parent_id is null then
    v_nivel := 1;
  else
    select e.orcamento_id into v_pai_orc from orcamento_etapas e where e.id = new.parent_id;
    if v_pai_orc is null then
      raise exception 'Etapa-pai não encontrada.' using errcode = 'P0001';
    end if;
    if v_pai_orc <> new.orcamento_id then
      raise exception 'A etapa-pai pertence a outro orçamento.' using errcode = 'P0001';
    end if;
    -- nível do pai e detecção de ciclo (mover para dentro de uma descendente)
    with recursive anc(id, parent_id, n, caminho) as (
      select e.id, e.parent_id, 1, array[e.id] from orcamento_etapas e where e.id = new.parent_id
      union all
      select e.id, e.parent_id, a.n + 1, a.caminho || e.id
        from anc a join orcamento_etapas e on e.id = a.parent_id
       where a.n < 10 and not (e.id = any (a.caminho))
    )
    select count(*) + 1, coalesce(bool_or(id = new.id), false) into v_nivel, v_ciclo from anc;
    if v_ciclo then
      raise exception 'Uma etapa não pode ser movida para dentro de si mesma.' using errcode = 'P0001';
    end if;
  end if;

  -- altura da subárvore abaixo desta etapa (relevante ao mover)
  if tg_op = 'UPDATE' then
    with recursive des(id, n) as (
      select e.id, 1 from orcamento_etapas e where e.parent_id = new.id
      union all
      select e.id, d.n + 1 from des d join orcamento_etapas e on e.parent_id = d.id where d.n < 10
    ) select coalesce(max(n), 0) into v_altura from des;
  else
    v_altura := 0;
  end if;

  if v_nivel + v_altura > 3 then
    raise exception 'A EAP admite no máximo 3 níveis de etapas.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger trg_20_orcamento_etapas_valida before insert or update of parent_id, orcamento_id on orcamento_etapas
  for each row execute function fn_orcamento_etapas_valida();

-- ─── Itens: validações + cálculo (§8.3) ──────────────────────────────────────
create or replace function fn_orcamento_itens_calc() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_etapa_orc uuid;
  v_ref_org   uuid;
  v_achou     boolean;
  v_bdi       numeric;
  v_bdi_orc   uuid;
begin
  -- etapa do mesmo orçamento
  if tg_op = 'INSERT' or new.etapa_id is distinct from old.etapa_id or new.orcamento_id is distinct from old.orcamento_id then
    select e.orcamento_id into v_etapa_orc from orcamento_etapas e where e.id = new.etapa_id;
    if v_etapa_orc is distinct from new.orcamento_id then
      raise exception 'A etapa informada pertence a outro orçamento.' using errcode = 'P0001';
    end if;
  end if;

  -- referência: SINAPI ou própria da mesma organização
  if tg_op = 'INSERT' or new.composicao_id is distinct from old.composicao_id or new.insumo_id is distinct from old.insumo_id then
    if new.composicao_id is not null then
      select true, c.organizacao_id into v_achou, v_ref_org from composicoes c where c.id = new.composicao_id;
    elsif new.insumo_id is not null then
      select true, i.organizacao_id into v_achou, v_ref_org from insumos i where i.id = new.insumo_id;
    end if;
    if v_ref_org is not null and v_ref_org <> new.organizacao_id then
      raise exception 'Referência própria de outra organização não pode ser usada.' using errcode = 'P0001';
    end if;
  end if;

  -- BDI aplicado: na inclusão e quando o BDI do item muda
  if tg_op = 'INSERT' or new.bdi_id is distinct from old.bdi_id then
    if new.bdi_id is not null then
      select b.orcamento_id, b.bdi into v_bdi_orc, v_bdi from orcamento_bdis b where b.id = new.bdi_id;
      if v_bdi_orc is distinct from new.orcamento_id then
        raise exception 'O BDI informado pertence a outro orçamento.' using errcode = 'P0001';
      end if;
    else
      select b.bdi into v_bdi from orcamento_bdis b where b.orcamento_id = new.orcamento_id and b.is_padrao;
    end if;
    new.bdi_percentual := coalesce(v_bdi, 0);
  end if;

  -- quantidade pela memória de cálculo
  if new.usa_memoria then
    select round(coalesce(sum(m.resultado), 0), 4) into new.quantidade
      from orcamento_item_memorias m where m.item_id = new.id;
  end if;

  new.custo_unitario := round(coalesce(new.custo_unitario, 0), 2);
  new.quantidade     := coalesce(new.quantidade, 0);
  new.bdi_percentual := coalesce(new.bdi_percentual, 0);
  new.preco_unitario := round(new.custo_unitario * (1 + new.bdi_percentual / 100), 2);
  new.total_sem_bdi  := round(new.quantidade * new.custo_unitario, 2);
  new.total          := round(new.quantidade * new.preco_unitario, 2);
  return new;
end $$;

create trigger trg_30_orcamento_itens_calc before insert or update on orcamento_itens
  for each row execute function fn_orcamento_itens_calc();

-- ─── Memória de cálculo → quantidade do item ─────────────────────────────────
create or replace function fn_orcamento_memorias_atualiza_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update orcamento_itens set quantidade = quantidade where id = old.item_id and usa_memoria;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.item_id is distinct from old.item_id) then
    update orcamento_itens set quantidade = quantidade where id = new.item_id and usa_memoria;
  end if;
  return null;
end $$;

create trigger trg_orcamento_item_memorias_qtd after insert or update or delete on orcamento_item_memorias
  for each row execute function fn_orcamento_memorias_atualiza_item();

-- ─── Cotações: insumo SINAPI ou próprio da mesma organização ────────────────
create or replace function fn_orcamento_insumo_precos_valida() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select i.organizacao_id into v_org from insumos i where i.id = new.insumo_id;
  if v_org is not null and v_org <> new.organizacao_id then
    raise exception 'Insumo próprio de outra organização não pode ser cotado.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_20_orcamento_insumo_precos_valida before insert or update on orcamento_insumo_precos
  for each row execute function fn_orcamento_insumo_precos_valida();

-- ─── Orçamento: data-base e encargos visíveis ───────────────────────────────
create or replace function fn_orcamentos_valida() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_status data_base_status;
begin
  if tg_op = 'INSERT' or new.data_base_id is distinct from old.data_base_id then
    select d.status into v_status from datas_base d where d.id = new.data_base_id;
    if v_status is null then
      raise exception 'Data-base não encontrada.' using errcode = 'P0001';
    end if;
    if v_status <> 'publicada' and auth.uid() is not null and not is_admin() then
      raise exception 'Data-base indisponível (não publicada).' using errcode = 'P0001';
    end if;
  end if;
  if new.orcamento_origem_id is not null and (tg_op = 'INSERT' or new.orcamento_origem_id is distinct from old.orcamento_origem_id)
     and not exists (select 1 from orcamentos o where o.id = new.orcamento_origem_id and o.organizacao_id = new.organizacao_id) then
    raise exception 'Orçamento de origem inválido.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_20_orcamentos_valida before insert or update of data_base_id, orcamento_origem_id on orcamentos
  for each row execute function fn_orcamentos_valida();

-- ─── Auditoria ───────────────────────────────────────────────────────────────
create trigger trg_orcamentos_auditoria after insert or update or delete on orcamentos
  for each row execute function fn_auditoria_trigger();
create trigger trg_orcamento_bdis_auditoria after insert or update or delete on orcamento_bdis
  for each row execute function fn_auditoria_trigger();

revoke execute on function fn_orcamento_bloqueio_status(), fn_orcamento_etapas_valida(), fn_orcamento_itens_calc(),
  fn_orcamento_memorias_atualiza_item(), fn_orcamento_insumo_precos_valida(), fn_orcamentos_valida()
  from public, anon;

-- ===== 0016_encargos_mao_obra.sql =====
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

-- ===== 0017_cronograma_medicoes.sql =====
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

-- ===== 0018_honorarios.sql =====
-- =============================================================================
-- 0018 — BACKEND-2: honorários de projeto (§5.4, §8.7)
-- =============================================================================

create table honorarios (
  id                  uuid primary key default gen_random_uuid(),
  organizacao_id      uuid not null references organizacoes(id) on delete cascade,
  obra_id             uuid not null references obras(id) on delete cascade,
  orcamento_id        uuid null references orcamentos(id) on delete set null,
  nome                text not null check (btrim(nome) <> ''),
  status              honorario_status not null default 'rascunho',
  area_m2             numeric(14,2) null check (area_m2 is null or area_m2 >= 0),
  impostos_percentual numeric(9,4) not null default 0 check (impostos_percentual >= 0 and impostos_percentual < 100),
  desconto_percentual numeric(9,4) not null default 0 check (desconto_percentual >= 0 and desconto_percentual <= 100),
  subtotal            numeric(16,2) not null default 0,
  total               numeric(16,2) not null default 0,
  validade_dias       integer not null default 30 check (validade_dias >= 0),
  condicoes_pagamento text null,
  observacoes         text null,
  created_by          uuid null default auth.uid() references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index honorarios_org_idx on honorarios (organizacao_id, updated_at desc);
create index honorarios_obra_idx on honorarios (obra_id);
create index honorarios_orcamento_idx on honorarios (orcamento_id) where orcamento_id is not null;
create trigger trg_10_honorarios_herda_org before insert or update of obra_id, organizacao_id on honorarios
  for each row execute function fn_herda_organizacao('obras', 'obra_id');
create trigger trg_honorarios_updated_at before update on honorarios
  for each row execute function set_updated_at();
create trigger trg_honorarios_auditoria after insert or update or delete on honorarios
  for each row execute function fn_auditoria_trigger();

create table honorario_disciplinas (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  honorario_id   uuid not null references honorarios(id) on delete cascade,
  disciplina     disciplina_projeto not null,
  descricao      text null,
  metodo         honorario_metodo not null,
  area_m2        numeric(14,2) null,
  valor_m2       numeric(14,2) null,
  valor_obra     numeric(16,2) null,
  percentual     numeric(9,4) null,
  horas          numeric(10,2) null,
  valor_hora     numeric(14,2) null,
  valor_fixo     numeric(16,2) null,
  valor          numeric(16,2) not null default 0,
  prazo_dias     integer null,
  ordem          integer not null default 0
);
create index honorario_disciplinas_honorario_idx on honorario_disciplinas (honorario_id, ordem);
create index honorario_disciplinas_org_idx on honorario_disciplinas (organizacao_id);
create trigger trg_10_honorario_disciplinas_herda_org before insert or update of honorario_id, organizacao_id on honorario_disciplinas
  for each row execute function fn_herda_organizacao('honorarios', 'honorario_id');

-- Valor da disciplina (§8.7) — idêntico a valorDisciplina() de calc.ts
create or replace function fn_honorario_valor_disciplina(
  p_metodo honorario_metodo, p_area_m2 numeric, p_valor_m2 numeric, p_valor_obra numeric, p_percentual numeric,
  p_horas numeric, p_valor_hora numeric, p_valor_fixo numeric, p_area_padrao numeric, p_valor_obra_padrao numeric
) returns numeric language sql immutable as $$
  select case p_metodo
    when 'area' then round(coalesce(p_area_m2, p_area_padrao, 0) * coalesce(p_valor_m2, 0), 2)
    when 'percentual_obra' then round(coalesce(p_valor_obra, p_valor_obra_padrao, 0) * coalesce(p_percentual, 0) / 100, 2)
    when 'horas' then round(coalesce(p_horas, 0) * coalesce(p_valor_hora, 0), 2)
    when 'fixo' then round(coalesce(p_valor_fixo, 0), 2)
  end
$$;

-- total = round2(subtotal × (1 − desc/100) / (1 − imp/100)) — idêntico a totalHonorarios()
create or replace function fn_honorario_total(p_subtotal numeric, p_desconto numeric, p_impostos numeric)
returns numeric language sql immutable as $$
  select round(coalesce(p_subtotal, 0) * (1 - coalesce(p_desconto, 0) / 100) / (1 - coalesce(p_impostos, 0) / 100), 2)
$$;

create or replace function fn_honorario_disciplinas_calc() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_area  numeric;
  v_obra  numeric;
begin
  select h.area_m2, o.total into v_area, v_obra
    from honorarios h left join orcamentos o on o.id = h.orcamento_id
   where h.id = new.honorario_id;
  new.valor := fn_honorario_valor_disciplina(new.metodo, new.area_m2, new.valor_m2, new.valor_obra, new.percentual,
                                             new.horas, new.valor_hora, new.valor_fixo, v_area, v_obra);
  return new;
end $$;
create trigger trg_20_honorario_disciplinas_calc before insert or update on honorario_disciplinas
  for each row execute function fn_honorario_disciplinas_calc();

create or replace function fn_honorario_disciplinas_totaliza() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update honorarios h
     set subtotal = coalesce((select sum(d.valor) from honorario_disciplinas d where d.honorario_id = h.id), 0)
   where h.id in (select (case when tg_op = 'DELETE' then old.honorario_id else new.honorario_id end)
                  union select (case when tg_op = 'UPDATE' then old.honorario_id end));
  return null;
end $$;
create trigger trg_honorario_disciplinas_totaliza after insert or update or delete on honorario_disciplinas
  for each row execute function fn_honorario_disciplinas_totaliza();

-- total do cabeçalho sempre coerente com subtotal/desconto/impostos
create or replace function fn_honorarios_calc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.orcamento_id is not null and (tg_op = 'INSERT' or new.orcamento_id is distinct from old.orcamento_id)
     and not exists (select 1 from orcamentos o where o.id = new.orcamento_id and o.obra_id = new.obra_id) then
    raise exception 'O orçamento deve ser da mesma obra.' using errcode = 'P0001';
  end if;
  new.total := fn_honorario_total(new.subtotal, new.desconto_percentual, new.impostos_percentual);
  return new;
end $$;
create trigger trg_20_honorarios_calc before insert or update on honorarios
  for each row execute function fn_honorarios_calc();

revoke execute on function fn_honorario_disciplinas_calc(), fn_honorario_disciplinas_totaliza(), fn_honorarios_calc()
  from public, anon;

-- ===== 0019_orcamento_rls.sql =====
-- =============================================================================
-- 0019 — BACKEND-2: RLS de todas as tabelas do orçamento (§6.3, padrão de organização)
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'orcamentos', 'orcamento_bdis', 'orcamento_etapas', 'orcamento_itens', 'orcamento_insumo_precos',
    'orcamento_item_memorias', 'cronogramas', 'cronograma_distribuicoes', 'medicoes', 'medicao_itens',
    'orcamento_equipes', 'orcamento_equipe_membros', 'honorarios', 'honorario_disciplinas'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (is_org_member(organizacao_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (can_edit_org(organizacao_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (can_edit_org(organizacao_id)) with check (can_edit_org(organizacao_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (can_edit_org(organizacao_id))', t || '_delete', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;

  -- referências mistas: tabelas globais (organizacao_id null) leitura p/ ativos, escrita admin
  foreach t in array array['encargos_sociais', 'encargos_sociais_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I for select to authenticated
      using ((organizacao_id is null and (select is_active_user())) or is_org_member(organizacao_id))$p$, t || '_select', t);
    execute format($p$create policy %I on public.%I for insert to authenticated
      with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)))$p$, t || '_insert', t);
    execute format($p$create policy %I on public.%I for update to authenticated
      using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)))
      with check ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)))$p$, t || '_update', t);
    execute format($p$create policy %I on public.%I for delete to authenticated
      using ((organizacao_id is null and (select is_admin())) or (organizacao_id is not null and can_edit_org(organizacao_id)))$p$, t || '_delete', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Colunas calculadas/snapshot não devem ser forjadas pelo cliente: os triggers as recalculam
-- (orcamento_itens.preco_unitario/total_sem_bdi/total, medicao_itens.valor, honorario_disciplinas.valor,
-- encargos_sociais.total_*), então não há revogação por coluna — o supabase-js pode enviar a linha inteira.

