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

/**
 * Tamanho do lote de paginação. O PostgREST corta cada resposta em `max_rows` (padrão do Supabase
 * Cloud: 1000; `supabase/config.toml`: 5000), então o lote não pode ser maior que esse limite.
 */
export const TAMANHO_LOTE = 1000;

/**
 * Busca **todas** as linhas de uma consulta paginando por `range` (Range/offset do PostgREST) em
 * lotes de `tamanho` até receber um lote incompleto. Sem isso, um orçamento grande (mais de
 * `max_rows` itens, ou cronograma com etapas × períodos acima do limite) viria truncado em silêncio.
 * A consulta precisa ter ordenação total (ex.: `.order('ordem').order('id')`) para as páginas não
 * se sobreporem; RPCs que retornam conjunto mantêm a ordem do próprio `order by` interno.
 */
export async function buscarTodas<T>(
  pagina: (de: number, ate: number) => PromiseLike<Resposta<T[]>>,
  tamanho = TAMANHO_LOTE,
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += tamanho) {
    const lote = (ok(await pagina(de, de + tamanho - 1)) ?? []) as T[];
    todas.push(...lote);
    if (lote.length < tamanho) return todas;
  }
}
