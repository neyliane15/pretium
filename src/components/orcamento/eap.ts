/**
 * Montagem da EAP (árvore etapas → subetapas → itens) para a planilha, sintético e relatórios.
 * Lógica pura; totais e numeração sempre via src/lib/calc.ts (mesmas regras do SQL).
 */
import { calcularItem, numerarEap, totalizarOrcamento } from '@/lib/calc';
import type { OrcamentoEtapa, OrcamentoItem } from '@/types/database';

type EtapaBase = Pick<OrcamentoEtapa, 'id' | 'parent_id' | 'ordem' | 'nome' | 'codigo'>;
type ItemBase = Pick<OrcamentoItem, 'id' | 'etapa_id' | 'ordem' | 'quantidade' | 'custo_unitario' | 'bdi_percentual' | 'codigo'>;

export interface LinhaEtapa<E extends EtapaBase> {
  tipo: 'etapa';
  id: string;
  etapa: E;
  nivel: number;
  codigo: string;
  total_sem_bdi: number;
  total: number;
  /** percentual sobre o total do orçamento (com BDI) */
  percentual: number;
  qtdItens: number;
  /** ids de etapas e itens descendentes */
  temFilhos: boolean;
}

export interface LinhaItem<I extends ItemBase> {
  tipo: 'item';
  id: string;
  item: I;
  nivel: number;
  codigo: string;
  preco_unitario: number;
  total_sem_bdi: number;
  total: number;
  percentual: number;
}

export type LinhaEap<E extends EtapaBase, I extends ItemBase> = LinhaEtapa<E> | LinhaItem<I>;

export interface EapMontada<E extends EtapaBase, I extends ItemBase> {
  linhas: LinhaEap<E, I>[];
  total_sem_bdi: number;
  total: number;
  total_bdi: number;
  /** BDI médio efetivo = total/total_sem_bdi − 1 (%) */
  bdi_medio: number;
}

const porOrdem = <T extends { ordem: number; id: string }>(a: T[]) => [...a].sort((x, y) => x.ordem - y.ordem || x.id.localeCompare(y.id));

/**
 * Achata a EAP em linhas na ordem de exibição (subetapas antes dos itens, como em §8.9).
 * `recolhidas`: ids de etapas recolhidas (descendentes omitidos, totais mantidos).
 * Valores do item recalculados por `calcularItem` (o snapshot do banco pode estar defasado
 * durante a edição otimista; o resultado é idêntico ao trigger).
 */
export function montarEap<E extends EtapaBase, I extends ItemBase>(
  etapas: readonly E[],
  itens: readonly I[],
  recolhidas: ReadonlySet<string> = new Set(),
): EapMontada<E, I> {
  const valores = new Map(itens.map((i) => [i.id, calcularItem(i)]));
  const tot = totalizarOrcamento(
    etapas,
    itens.map((i) => ({ etapa_id: i.etapa_id, total_sem_bdi: valores.get(i.id)!.total_sem_bdi, total: valores.get(i.id)!.total })),
  );
  const num = numerarEap(etapas, itens);
  const filhos = new Map<string | null, E[]>();
  for (const e of etapas) filhos.set(e.parent_id, [...(filhos.get(e.parent_id) ?? []), e]);
  const itensDe = new Map<string, I[]>();
  for (const i of itens) itensDe.set(i.etapa_id, [...(itensDe.get(i.etapa_id) ?? []), i]);
  const pct = (v: number) => (tot.total > 0 ? (v / tot.total) * 100 : 0);
  const contarItens = (id: string): number =>
    (itensDe.get(id)?.length ?? 0) + (filhos.get(id) ?? []).reduce((s, f) => s + contarItens(f.id), 0);

  const linhas: LinhaEap<E, I>[] = [];
  const walk = (parent: string | null, nivel: number) => {
    for (const e of porOrdem(filhos.get(parent) ?? [])) {
      const t = tot.etapas.get(e.id) ?? { total_sem_bdi: 0, total: 0 };
      const subs = filhos.get(e.id) ?? [];
      const its = itensDe.get(e.id) ?? [];
      linhas.push({
        tipo: 'etapa', id: e.id, etapa: e, nivel, codigo: num.etapas.get(e.id) ?? e.codigo,
        total_sem_bdi: t.total_sem_bdi, total: t.total, percentual: pct(t.total), qtdItens: contarItens(e.id),
        temFilhos: subs.length + its.length > 0,
      });
      if (recolhidas.has(e.id)) continue;
      walk(e.id, nivel + 1);
      for (const i of porOrdem(its)) {
        const v = valores.get(i.id)!;
        linhas.push({
          tipo: 'item', id: i.id, item: i, nivel: nivel + 1, codigo: num.itens.get(i.id) ?? i.codigo,
          preco_unitario: v.preco_unitario, total_sem_bdi: v.total_sem_bdi, total: v.total, percentual: pct(v.total),
        });
      }
    }
  };
  walk(null, 1);
  const bdi_medio = tot.total_sem_bdi > 0 ? (tot.total / tot.total_sem_bdi - 1) * 100 : 0;
  return { linhas, total_sem_bdi: tot.total_sem_bdi, total: tot.total, total_bdi: tot.total_bdi, bdi_medio };
}

/** Ids de todas as etapas e itens descendentes de `etapaId` (inclusive). */
export function descendentes(etapas: readonly EtapaBase[], itens: readonly Pick<ItemBase, 'id' | 'etapa_id'>[], etapaId: string): { etapas: string[]; itens: string[] } {
  const outE: string[] = [];
  const fila = [etapaId];
  while (fila.length) {
    const id = fila.shift()!;
    outE.push(id);
    for (const e of etapas) if (e.parent_id === id) fila.push(e.id);
  }
  const set = new Set(outE);
  return { etapas: outE, itens: itens.filter((i) => set.has(i.etapa_id)).map((i) => i.id) };
}

/** Profundidade (1-based) de uma etapa. */
export function nivelEtapa(etapas: readonly EtapaBase[], id: string): number {
  const by = new Map(etapas.map((e) => [e.id, e]));
  let n = 0;
  let cur = by.get(id);
  while (cur && n < 10) {
    n += 1;
    cur = cur.parent_id ? by.get(cur.parent_id) : undefined;
  }
  return n;
}

/** Etapa anterior/seguinte entre irmãos para mover ↑/↓: devolve a nova ordem (posição 1-based). */
export function novaOrdemIrmao<T extends { id: string; ordem: number }>(irmaos: readonly T[], id: string, delta: -1 | 1): number | null {
  const ord = porOrdem([...irmaos]);
  const idx = ord.findIndex((x) => x.id === id);
  const alvo = idx + delta;
  if (idx < 0 || alvo < 0 || alvo >= ord.length) return null;
  return alvo + 1;
}

