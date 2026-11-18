/** Cálculos do cronograma físico-financeiro no cliente (mesmas regras de §8.9 / fn_cronograma_*). */
import { round2, roundN, somaMoeda, valorPeriodo } from '@/lib/calc';

export type Distribuicao = Map<string, number[]>; // etapa_id → % por período (índice 0 = período 1)

export interface EtapaCrono {
  id: string;
  total: number;
}

export interface TotaisCronograma {
  /** valor (R$) por etapa × período */
  valores: Map<string, number[]>;
  /** soma dos % de cada etapa */
  somaPct: Map<string, number>;
  porPeriodo: { valor: number; acumulado: number; percentual: number; percentualAcumulado: number }[];
  total: number;
}

export function totaisCronograma(etapas: readonly EtapaCrono[], dist: Distribuicao, n: number): TotaisCronograma {
  const valores = new Map<string, number[]>();
  const somaPct = new Map<string, number>();
  for (const e of etapas) {
    const pcts = dist.get(e.id) ?? [];
    valores.set(e.id, Array.from({ length: n }, (_, k) => valorPeriodo(e.total, pcts[k] ?? 0)));
    somaPct.set(e.id, roundN(pcts.slice(0, n).reduce((s, p) => s + (p ?? 0), 0), 4));
  }
  const total = somaMoeda(etapas.map((e) => e.total));
  let acum = 0;
  const porPeriodo = Array.from({ length: n }, (_, k) => {
    const valor = somaMoeda(etapas.map((e) => valores.get(e.id)![k]!));
    acum = round2(acum + valor);
    return { valor, acumulado: acum, percentual: total > 0 ? (valor / total) * 100 : 0, percentualAcumulado: total > 0 ? (acum / total) * 100 : 0 };
  });
  return { valores, somaPct, porPeriodo, total };
}

/** Distribui 100% igualmente entre os períodos [ini, fim] (1-based), resto no último (4 casas). */
export function distribuirLinear(n: number, ini: number, fim: number): number[] {
  const out = Array.from({ length: n }, () => 0);
  const a = Math.max(1, Math.min(ini, fim)), b = Math.min(n, Math.max(ini, fim));
  const qtd = b - a + 1;
  if (qtd <= 0) return out;
  const parte = roundN(100 / qtd, 4);
  for (let k = a; k <= b; k++) out[k - 1] = parte;
  out[b - 1] = roundN(100 - parte * (qtd - 1), 4);
  return out;
}

/** Converte a grade em `p_distribuicoes` (somente % > 0 e períodos ≤ n). */
export function paraDistribuicoes(dist: Distribuicao, n: number): { etapa_id: string; periodo: number; percentual: number }[] {
  const out: { etapa_id: string; periodo: number; percentual: number }[] = [];
  for (const [etapa_id, pcts] of dist) pcts.slice(0, n).forEach((p, k) => { if (p > 0) out.push({ etapa_id, periodo: k + 1, percentual: roundN(p, 4) }); });
  return out;
}
