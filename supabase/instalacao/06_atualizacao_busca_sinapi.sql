-- PRETIUM — ATUALIZAÇÃO: busca automática da SINAPI na Caixa (todas as UFs)
-- Para quem JÁ instalou as partes 01 a 05. Rode uma vez no SQL Editor. (Pode repetir sem problema.)
-- Instalações novas não precisam: o conteúdo já está no 03_funcoes.sql.

-- ============================================================================
-- 0032 — Sincronização automática da SINAPI (todas as UFs) direto da Caixa
-- ----------------------------------------------------------------------------
-- A busca é feita por uma função de servidor (Vercel: api/sinapi/*) que baixa o
-- pacote mensal oficial da Caixa e grava com a chave service_role. Usuários não
-- escrevem preços: só pedem "buscar UF/mês" e acompanham o histórico.
--   * assert_admin passa a aceitar a service_role (já é confiável: ignora RLS);
--   * tabela sinapi_sincronizacoes: histórico/trava de cada busca;
--   * fn_sinapi_ufs_em_uso: UFs que a rotina diária mantém atualizadas.
-- ============================================================================

-- 1) service_role pode chamar as RPCs administrativas (importação/publicação).
create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.assert_admin() from public, anon;

-- 2) Histórico das sincronizações.
do $$ begin
  create type public.sinapi_sync_status as enum ('processando', 'concluida', 'erro', 'indisponivel');
exception when duplicate_object then null; end $$;

create table if not exists public.sinapi_sincronizacoes (
  id             uuid primary key default gen_random_uuid(),
  ano            integer not null check (ano between 2000 and 2100),
  mes            integer not null check (mes between 1 and 12),
  ufs            text[]  not null check (cardinality(ufs) between 1 and 27),
  origem         text    not null default 'usuario' check (origem in ('usuario', 'automatica', 'admin')),
  status         public.sinapi_sync_status not null default 'processando',
  mensagem       text null,
  arquivo_url    text null,
  datas_base     uuid[] not null default '{}',
  solicitado_por uuid null references auth.users(id) on delete set null,
  iniciado_em    timestamptz not null default now(),
  finalizado_em  timestamptz null
);
create index if not exists sinapi_sincronizacoes_iniciado_idx on public.sinapi_sincronizacoes (iniciado_em desc);
create index if not exists sinapi_sincronizacoes_proc_idx on public.sinapi_sincronizacoes (ano, mes) where status = 'processando';

alter table public.sinapi_sincronizacoes enable row level security;

-- leitura: qualquer usuário ativo (para ver o andamento); escrita: só service_role (sem policy).
drop policy if exists sinapi_sincronizacoes_select on public.sinapi_sincronizacoes;
create policy sinapi_sincronizacoes_select on public.sinapi_sincronizacoes
  for select to authenticated using (public.is_active_user());

revoke all on public.sinapi_sincronizacoes from anon, authenticated;
grant select on public.sinapi_sincronizacoes to authenticated;
grant all on public.sinapi_sincronizacoes to service_role;

-- 3) UFs mantidas atualizadas pela rotina diária: as que já têm tabela oficial
--    (não demonstrativa) importada, mais a UF padrão de cada organização ativa.
create or replace function public.fn_sinapi_ufs_em_uso()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct u order by u), '{}')
    from (
      select d.uf::text as u from public.datas_base d where d.is_demo = false
      union
      select o.uf_padrao::text from public.organizacoes o where o.status = 'ativa' and o.uf_padrao is not null
    ) x
   where u ~ '^[A-Z]{2}$';
$$;
revoke all on function public.fn_sinapi_ufs_em_uso() from public, anon;
grant execute on function public.fn_sinapi_ufs_em_uso() to authenticated, service_role;

-- 4) Datas-base oficiais já disponíveis para uma UF (consulta rápida da tela).
create or replace function public.fn_sinapi_disponibilidade(p_uf text)
returns table (ano integer, mes integer, regime public.regime_desoneracao, status public.data_base_status, data_base_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select d.ano, d.mes, d.regime, d.status, d.id
    from public.datas_base d
   where d.uf = upper(btrim(p_uf)) and d.is_demo = false and public.is_active_user()
   order by d.ano desc, d.mes desc, d.regime;
$$;
revoke all on function public.fn_sinapi_disponibilidade(text) from public, anon;
grant execute on function public.fn_sinapi_disponibilidade(text) to authenticated, service_role;
