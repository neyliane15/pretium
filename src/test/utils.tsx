/**
 * Utilitários de testes de componente (agente TESTES).
 * - `renderizar(ui, { rota, caminho, contexto })`: Router em memória + React Query + Toasts; `contexto`
 *   vira o `<Outlet context>` (abas do orçamento usam `useOrcamentoContexto`).
 * - `stubHooks(modulo, overrides)`: substitui TODOS os hooks `use*` de um módulo da camada de dados por
 *   um stub inerte (sem rede) e aplica os overrides — use dentro de `vi.mock(path, async (orig) => …)`.
 * - `consulta(data)`, `mutacao()`: formatos mínimos de UseQueryResult/UseMutationResult.
 */
import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { ToastProvider } from '@/components/ui';

export function consulta<T>(data: T, extra: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, isSuccess: true, isFetching: false, error: null, refetch: vi.fn(), ...extra };
}

export function mutacao(impl?: (...a: unknown[]) => unknown) {
  const mutateAsync = vi.fn(async (...a: unknown[]) => (impl ? impl(...a) : undefined));
  const mutate = vi.fn((v: unknown, o?: { onSuccess?: (d: unknown) => void; onError?: (e: unknown) => void; onSettled?: () => void }) => {
    Promise.resolve()
      .then(() => mutateAsync(v))
      .then((d) => o?.onSuccess?.(d), (e) => o?.onError?.(e))
      .finally(() => o?.onSettled?.());
  });
  return { mutate, mutateAsync, isPending: false, isError: false, reset: vi.fn() };
}

const inerte = () => ({ ...consulta(undefined), ...mutacao() });

export function stubHooks<M extends Record<string, unknown>>(modulo: M, overrides: Record<string, unknown> = {}): M {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(modulo)) out[k] = k in overrides ? overrides[k] : /^use[A-Z]/.test(k) && typeof v === 'function' ? inerte : v;
  for (const [k, v] of Object.entries(overrides)) if (!(k in out)) out[k] = v;
  return out as M;
}

export function renderizar(ui: ReactElement, opcoes: { rota?: string; caminho?: string; contexto?: unknown; extras?: ReactNode } = {}) {
  const { rota = '/', caminho = '/', contexto, extras } = opcoes;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Pai = () => <Outlet context={contexto} />;
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[rota]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route element={<Pai />}>
              <Route path={caminho} element={ui} />
            </Route>
            <Route path="*" element={<div data-testid="outra-rota" />} />
          </Routes>
          {extras}
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
