-- ============================================================================
-- 0001 — Extensões e enums do núcleo (BACKEND-1)
-- Contrato: docs/ARQUITETURA.md §4, §5.1
--
-- Extensões ficam no schema `extensions` (padrão Supabase). Referencie-as
-- qualificadas: extensions.citext, extensions.unaccent(...), extensions.gin_trgm_ops.
-- ============================================================================

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext   with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Ninguém além do dono cria objetos em public (evita sequestro de nomes por
-- funções/tabelas homônimas criadas por usuários comuns).
revoke create on schema public from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke create on schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke create on schema public from authenticated';
  end if;
end $$;

-- ─── Enums ──────────────────────────────────────────────────────────────────
create type public.app_role           as enum ('admin', 'user');
create type public.user_status        as enum ('pending', 'active', 'blocked');
create type public.org_role           as enum ('owner', 'editor', 'viewer');
create type public.org_status         as enum ('ativa', 'bloqueada');
create type public.invite_status      as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.pessoa_tipo        as enum ('PF', 'PJ');
create type public.obra_status        as enum ('planejamento', 'orcamento', 'em_execucao', 'paralisada', 'concluida', 'cancelada');
-- Usado por organizacoes.regime_padrao (B1) e por datas_base etc. (B2).
create type public.regime_desoneracao as enum ('nao_desonerado', 'desonerado');
