/**
 * Infra dos testes de INTEGRAÇÃO (agente TESTES): os hooks reais de src/api/** rodando contra um
 * Supabase de verdade (GoTrue + PostgREST + Storage + Postgres 15 do `supabase start`).
 *
 * - O client singleton `@/lib/supabase` usa VITE_SUPABASE_URL/ANON_KEY (vitest.integracao.config.ts).
 * - `useOrganizacao`/`useAuth` são substituídos por um estado controlado pelo teste (`estado`).
 * - `mutar(useHook, args)` e `consultar(useHook)` montam o hook com React Query e devolvem o resultado.
 */
import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Organizacao, OrgRole, Profile } from '@/types/database';
import { supabase } from '@/lib/supabase';

export const URL_API = import.meta.env.VITE_SUPABASE_URL as string;
export const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const SERVICE = (import.meta.env.VITE_TEST_SERVICE_ROLE_KEY as string | undefined) ?? '';
export const RODADA = Date.now().toString(36);
export const SENHA = 'Senha-forte-123';

export interface EstadoTeste {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  org: Organizacao | null;
  papel: OrgRole | null;
}
export const estado: EstadoTeste = { user: null, profile: null, org: null, papel: null };

export function emailDe(nome: string): string {
  return `${nome}.${RODADA}@example.com`;
}

/** Client independente (sessão própria, sem persistência) — para preparar dados de outro usuário. */
let clientes = 0;
export function novoClient(): SupabaseClient<Database> {
  clientes += 1;
  return createClient<Database>(URL_API, ANON, { auth: { persistSession: false, autoRefreshToken: false, storageKey: `pretium-teste-${clientes}` } });
}

export function clientServico(): SupabaseClient<Database> | null {
  return SERVICE ? createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'pretium-teste-servico' } }) : null;
}

/** Entra com o client singleton (o usado pelos hooks) e atualiza `estado`. */
export async function entrar(email: string, org: Organizacao | null = null, papel: OrgRole | null = null) {
  await supabase.auth.signOut();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: SENHA });
  if (error) throw error;
  estado.user = { id: data.user.id, email };
  const p = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
  if (p.error) throw p.error;
  estado.profile = p.data as Profile;
  estado.org = org;
  estado.papel = papel;
  return data.user;
}

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

/** Monta o hook de mutação, executa `mutateAsync(args)` e desmonta. */
export async function mutar<A, R>(useHook: () => { mutateAsync: (a: A) => Promise<R> }, args: A): Promise<R> {
  const { result, unmount } = renderHook(useHook, { wrapper: wrapper() });
  try {
    let out: R | undefined;
    await act(async () => {
      out = await result.current.mutateAsync(args);
    });
    return out as R;
  } finally {
    unmount();
  }
}

/** Monta o hook de consulta, espera sucesso/erro e devolve `data` (lança o erro do PostgREST). */
export async function consultar<T>(useHook: () => UseQueryResult<T>): Promise<T> {
  const { result, unmount } = renderHook(useHook, { wrapper: wrapper() });
  try {
    await waitFor(() => {
      if (!result.current.isSuccess && !result.current.isError) throw new Error('aguardando');
    }, { timeout: 20_000 });
    if (result.current.isError) throw result.current.error;
    return result.current.data as T;
  } finally {
    unmount();
  }
}

/** Cadastra pelo client indicado (GoTrue real) e devolve o id. */
export async function cadastrar(nome: string, email = emailDe(nome)): Promise<string> {
  const c = novoClient();
  const { data, error } = await c.auth.signUp({ email, password: SENHA, options: { data: { nome } } });
  if (error) throw error;
  if (!data.user) throw new Error('signUp sem usuário');
  return data.user.id;
}

/** Client logado como `email` (sessão isolada). */
export async function clientDe(email: string): Promise<SupabaseClient<Database>> {
  const c = novoClient();
  const { error } = await c.auth.signInWithPassword({ email, password: SENHA });
  if (error) throw error;
  return c;
}
