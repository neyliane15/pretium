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
  if tg_op = 'UPDATE' and v_enviado is distinct from (to_jsonb(old) ->> 'organizacao_id')::uuid
     and v_enviado is distinct from v_org then
    raise exception 'A organização informada difere da organização do registro pai.' using errcode = 'P0001';
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
