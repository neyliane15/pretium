/** Utilitários da camada de dados (FRONTEND-2). */
import { useOrganizacao } from '@/contexts/OrganizacaoContext';

interface Resposta<T> {
  data: T | null;
  error: unknown;
}

/** Lança o erro do PostgREST/RPC ou devolve `data` (não nulo). */
export function ok<T>(r: Resposta<T>): NonNullable<T> {
  if (r.error) throw r.error;
  return r.data as NonNullable<T>;
}

/** Igual a `ok`, mas aceita retorno nulo/void. */
export function okVoid(r: { error: unknown }): void {
  if (r.error) throw r.error;
}

/** id da organização ativa ('' quando ausente — use `enabled: Boolean(orgId)`). */
export function useOrgId(): string {
  return useOrganizacao().organizacao?.id ?? '';
}
