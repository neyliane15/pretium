/**
 * Regras de cálculo do Pretium — FONTE ÚNICA DE VERDADE NO FRONT.
 *
 * Estas funções puras reproduzem exatamente as funções SQL do BACKEND-2
 * (docs/ARQUITETURA.md §8). Qualquer mudança aqui exige a mesma mudança no SQL e
 * vice-versa, com teste em src/lib/calc.test.ts.
 *
 * Convenções:
 * - Percentuais em PONTOS percentuais (22,12% → 22.12).
 * - Arredondamento comercial "meio para longe do zero", igual ao `round(numeric, n)` do Postgres.
 */

// ─── Arredondamento ───────────────────────────────────────────────────────

/**
 * Arredonda `x` para `casas` decimais, meio para longe do zero.
 * Usa toPrecision(15) para neutralizar o erro binário (1.005 → 1.01, como no Postgres).
 */
export function roundN(x: number, casas: number): number {
  if (!Number.isFinite(x)) return 0;
  const f = 10 ** casas;
  const abs = Math.abs(x);
  const scaled = Number((abs * f).toPrecision(15));
  const r = Math.round(scaled) / f;
  const out = x < 0 ? -r : r;
  return out === 0 ? 0 : out; // normaliza -0
}

export const round2 = (x: number): number => roundN(x, 2);
export const round4 = (x: number): number => roundN(x, 4);

/** Soma com acumulação em centavos inteiros quando todos os valores já têm 2 casas. */
export function somaMoeda(valores: Iterable<number>): number {
  let centavos = 0;
  for (const v of valores) centavos += Math.round(Number((v * 100).toPrecision(15)));
  return centavos / 100;
}

// ─── BDI (TCU — Acórdão 2622/2013-Plenário) ───────────────────────────────

export interface BdiParametros {
  /** Administração central (%) */
  ac: number;
  /** Seguros (%) */
  s: number;
  /** Riscos (%) */
  r: number;
  /** Garantias (%) */
  g: number;
  /** Despesas financeiras (%) */
  df: number;
  /** Lucro (%) */
  l: number;
  pis: number;
  cofins: number;
  iss: number;
  cprb: number;
}

/** I = PIS + COFINS + ISS + CPRB (%) */
export function tributosBdi(p: Pick<BdiParametros, 'pis' | 'cofins' | 'iss' | 'cprb'>): number {
  return roundN(p.pis + p.cofins + p.iss + p.cprb, 4);
}

/**
 * BDI = [ (1+AC+S+R+G) × (1+DF) × (1+L) / (1−I) ] − 1, em % com 2 casas.
 * Lança erro se I ≥ 100%.
 */
export function calcularBdi(p: BdiParametros): number {
  const i = (p.pis + p.cofins + p.iss + p.cprb) / 100;
  if (i >= 1) throw new RangeError('A soma dos tributos (I) deve ser menor que 100%.');
  const bruto = ((1 + (p.ac + p.s + p.r + p.g) / 100) * (1 + p.df / 100) * (1 + p.l / 100)) / (1 - i) - 1;
  return round2(bruto * 100);
}

export interface FaixaTcu {
  min: number;
  medio: number;
  max: number;
}

export type TipoObraTcu = 'edificacoes' | 'fornecimento_materiais';

/** Quartis de referência do Acórdão 2622/2013 (conferir com o texto antes de uso contratual). */
export const FAIXAS_TCU: Record<TipoObraTcu, { rotulo: string; ac: FaixaTcu; sg: FaixaTcu; r: FaixaTcu; df: FaixaTcu; l: FaixaTcu; bdi: FaixaTcu }> = {
  edificacoes: {
    rotulo: 'Construção de edifícios',
    ac: { min: 3.0, medio: 4.0, max: 5.5 },
    sg: { min: 0.8, medio: 0.8, max: 1.0 },
    r: { min: 0.97, medio: 1.27, max: 1.27 },
    df: { min: 0.59, medio: 1.23, max: 1.39 },
    l: { min: 6.16, medio: 7.4, max: 8.96 },
    bdi: { min: 20.34, medio: 22.12, max: 25.0 },
  },
  fornecimento_materiais: {
    rotulo: 'Fornecimento de materiais e equipamentos',
    ac: { min: 1.5, medio: 3.45, max: 4.49 },
    sg: { min: 0.3, medio: 0.48, max: 0.82 },
    r: { min: 0.56, medio: 0.85, max: 0.89 },
    df: { min: 0.85, medio: 0.85, max: 1.11 },
    l: { min: 3.5, medio: 5.11, max: 6.22 },
    bdi: { min: 11.1, medio: 14.02, max: 16.8 },
  },
};

export const TRIBUTOS_PADRAO = { pis: 0.65, cofins: 3.0 } as const;

/** Situação do BDI calculado em relação à faixa do TCU. */
export function situacaoBdiTcu(bdi: number, tipo: TipoObraTcu): 'abaixo' | 'dentro' | 'acima' {
  const f = FAIXAS_TCU[tipo].bdi;
  if (bdi < f.min) return 'abaixo';
  if (bdi > f.max) return 'acima';
  return 'dentro';
}

// ─── Composições ──────────────────────────────────────────────────────────

export interface ParcelaComposicao {
  coeficiente: number;
  /** preço do insumo (sem arredondar) ou custo da subcomposição (já com 2 casas); null = sem preço */
  preco: number | null;
}

/**
 * Custo unitário de composição = round2( Σ coeficiente × preço ).
 * Parciais não são arredondados. Retorna null se nenhuma parcela tem preço.
 */
export function custoComposicao(parcelas: readonly ParcelaComposicao[]): number | null {
  let algum = false;
  let soma = 0;
  for (const p of parcelas) {
    if (p.preco === null || p.preco === undefined) continue;
    algum = true;
    soma += p.coeficiente * p.preco;
  }
  return algum ? round2(soma) : null;
}

/** true se alguma parcela não tem preço (item deve ser sinalizado `sem_preco`). */
export const temParcelaSemPreco = (parcelas: readonly ParcelaComposicao[]): boolean =>
  parcelas.some((p) => p.preco === null || p.preco === undefined);

// ─── Itens do orçamento ───────────────────────────────────────────────────

export interface EntradaItem {
  quantidade: number;
  custo_unitario: number;
  bdi_percentual: number;
}

export interface ValoresItem {
  custo_unitario: number;
  preco_unitario: number;
  total_sem_bdi: number;
  total: number;
}

/** Preço unitário com BDI = round2(custo × (1 + BDI/100)). */
export function precoComBdi(custoUnitario: number, bdiPercentual: number): number {
  return round2(round2(custoUnitario) * (1 + bdiPercentual / 100));
}

/** Mesma regra do trigger `fn_orcamento_itens_calc` (§8.3). */
export function calcularItem(e: EntradaItem): ValoresItem {
  const custo = round2(e.custo_unitario);
  const preco = precoComBdi(custo, e.bdi_percentual);
  return {
    custo_unitario: custo,
    preco_unitario: preco,
    total_sem_bdi: round2(e.quantidade * custo),
    total: round2(e.quantidade * preco),
  };
}

export interface EtapaNo {
  id: string;
  parent_id: string | null;
}

export interface ItemTotais {
  etapa_id: string;
  total_sem_bdi: number;
  total: number;
}

export interface TotaisEtapa {
  total_sem_bdi: number;
  total: number;
}

/**
 * Totaliza etapas incluindo subetapas (sem novo arredondamento além do somatório em centavos).
 * Retorna mapa por etapa e o total do orçamento (soma das etapas de 1º nível).
 */
export function totalizarOrcamento(
  etapas: readonly EtapaNo[],
  itens: readonly ItemTotais[],
): { etapas: Map<string, TotaisEtapa>; total_sem_bdi: number; total: number; total_bdi: number } {
  const proprios = new Map<string, { sem: number[]; com: number[] }>();
  for (const e of etapas) proprios.set(e.id, { sem: [], com: [] });
  for (const it of itens) {
    const p = proprios.get(it.etapa_id);
    if (!p) continue;
    p.sem.push(it.total_sem_bdi);
    p.com.push(it.total);
  }
  const filhos = new Map<string | null, EtapaNo[]>();
  for (const e of etapas) {
    const arr = filhos.get(e.parent_id) ?? [];
    arr.push(e);
    filhos.set(e.parent_id, arr);
  }
  const result = new Map<string, TotaisEtapa>();
  const visit = (id: string, guard: Set<string>): TotaisEtapa => {
    if (guard.has(id)) throw new Error('Ciclo na EAP.');
    guard.add(id);
    const p = proprios.get(id) ?? { sem: [], com: [] };
    const sub = (filhos.get(id) ?? []).map((f) => visit(f.id, guard));
    const t: TotaisEtapa = {
      total_sem_bdi: somaMoeda([...p.sem, ...sub.map((s) => s.total_sem_bdi)]),
      total: somaMoeda([...p.com, ...sub.map((s) => s.total)]),
    };
    result.set(id, t);
    return t;
  };
  const raizes = (filhos.get(null) ?? []).map((r) => visit(r.id, new Set()));
  const total_sem_bdi = somaMoeda(raizes.map((r) => r.total_sem_bdi));
  const total = somaMoeda(raizes.map((r) => r.total));
  return { etapas: result, total_sem_bdi, total, total_bdi: round2(total - total_sem_bdi) };
}

/**
 * Numeração hierárquica da EAP ("1", "1.2", "1.2.3"), igual a `fn_orcamento_renumerar` (§8.9).
 * Irmãos ordenados por (`ordem`, `id`). Subetapas e itens de uma mesma etapa compartilham a
 * sequência do pai: primeiro as subetapas, depois os itens.
 */
export function numerarEap<E extends EtapaNo & { ordem: number }, I extends { id: string; etapa_id: string; ordem: number }>(
  etapas: readonly E[],
  itens: readonly I[],
): { etapas: Map<string, string>; itens: Map<string, string> } {
  const outE = new Map<string, string>();
  const outI = new Map<string, string>();
  const byParent = new Map<string | null, E[]>();
  for (const e of etapas) {
    const a = byParent.get(e.parent_id) ?? [];
    a.push(e);
    byParent.set(e.parent_id, a);
  }
  const itensPorEtapa = new Map<string, I[]>();
  for (const i of itens) {
    const a = itensPorEtapa.get(i.etapa_id) ?? [];
    a.push(i);
    itensPorEtapa.set(i.etapa_id, a);
  }
  const porOrdem = <T extends { ordem: number; id: string }>(a: T[]) =>
    [...a].sort((x, y) => x.ordem - y.ordem || x.id.localeCompare(y.id));
  const walk = (parent: string | null, prefixo: string) => {
    let n = 0;
    for (const e of porOrdem(byParent.get(parent) ?? [])) {
      n += 1;
      const cod = prefixo ? `${prefixo}.${n}` : String(n);
      outE.set(e.id, cod);
      walk(e.id, cod);
    }
    if (parent !== null) {
      for (const i of porOrdem(itensPorEtapa.get(parent) ?? [])) {
        n += 1;
        outI.set(i.id, `${prefixo}.${n}`);
      }
    }
  };
  walk(null, '');
  return { etapas: outE, itens: outI };
}

// ─── Curva ABC ────────────────────────────────────────────────────────────

export type ClasseAbc = 'A' | 'B' | 'C';

export const LIMITES_ABC = { A: 80, B: 95 } as const;

/** Classe pelo acumulado ANTERIOR ao item: A < 80 ≤ B < 95 ≤ C. */
export function classeAbc(acumuladoAnterior: number): ClasseAbc {
  if (acumuladoAnterior < LIMITES_ABC.A) return 'A';
  if (acumuladoAnterior < LIMITES_ABC.B) return 'B';
  return 'C';
}

export interface LinhaAbc<T> {
  posicao: number;
  linha: T;
  total: number;
  percentual: number;
  percentual_acumulado: number;
  classe: ClasseAbc;
}

/**
 * Curva ABC (§8.5): ordena por total desc (desempate código asc, id asc), exclui totais ≤ 0,
 * percentual sobre o somatório, classe pelo acumulado anterior.
 */
export function curvaAbc<T>(
  linhas: readonly T[],
  acesso: { total: (l: T) => number; codigo: (l: T) => string; id: (l: T) => string },
): LinhaAbc<T>[] {
  const validas = linhas.filter((l) => acesso.total(l) > 0);
  validas.sort((a, b) => {
    const d = acesso.total(b) - acesso.total(a);
    if (d !== 0) return d;
    const c = acesso.codigo(a).localeCompare(acesso.codigo(b), 'pt-BR', { numeric: true });
    if (c !== 0) return c;
    return acesso.id(a).localeCompare(acesso.id(b));
  });
  const soma = validas.reduce((s, l) => s + acesso.total(l), 0);
  let acum = 0;
  return validas.map((l, idx) => {
    const total = acesso.total(l);
    const percentual = soma > 0 ? (total / soma) * 100 : 0;
    const anterior = acum;
    acum += percentual;
    return { posicao: idx + 1, linha: l, total, percentual, percentual_acumulado: acum, classe: classeAbc(anterior) };
  });
}

// ─── Encargos sociais e mão de obra ───────────────────────────────────────

export interface EncargoItem {
  grupo: 'A' | 'B' | 'C' | 'D';
  horista: number;
  mensalista: number;
}

export function totalEncargos(itens: readonly EncargoItem[]): {
  horista: number;
  mensalista: number;
  porGrupo: Record<'A' | 'B' | 'C' | 'D', { horista: number; mensalista: number }>;
} {
  const porGrupo = { A: { horista: 0, mensalista: 0 }, B: { horista: 0, mensalista: 0 }, C: { horista: 0, mensalista: 0 }, D: { horista: 0, mensalista: 0 } };
  for (const it of itens) {
    porGrupo[it.grupo].horista += it.horista;
    porGrupo[it.grupo].mensalista += it.mensalista;
  }
  for (const g of ['A', 'B', 'C', 'D'] as const) {
    porGrupo[g].horista = round4(porGrupo[g].horista);
    porGrupo[g].mensalista = round4(porGrupo[g].mensalista);
  }
  const horista = round4(itens.reduce((s, i) => s + i.horista, 0));
  const mensalista = round4(itens.reduce((s, i) => s + i.mensalista, 0));
  return { horista, mensalista, porGrupo };
}

/** Reincidência de um grupo sobre outro (ex.: D1 = A × B / 100). */
export const reincidencia = (a: number, b: number): number => round4((a * b) / 100);

export interface MembroEquipe {
  quantidade: number;
  horas_dia: number;
  dias: number;
  /** preço/h do insumo SINAPI (já com encargos); se presente, prevalece */
  preco_insumo_hora: number | null;
  salario_hora: number | null;
  aplicar_encargos: boolean;
}

export function custoHoraMembro(m: MembroEquipe, encargosHoristaPct: number): number {
  if (m.preco_insumo_hora !== null && m.preco_insumo_hora !== undefined) return roundN(m.preco_insumo_hora, 4);
  const base = m.salario_hora ?? 0;
  return roundN(base * (1 + (m.aplicar_encargos ? encargosHoristaPct : 0) / 100), 4);
}

export function custoMembro(m: MembroEquipe, encargosHoristaPct: number): { horas_totais: number; custo_hora: number; custo_total: number } {
  const horas_totais = round2(m.quantidade * m.horas_dia * m.dias);
  const custo_hora = custoHoraMembro(m, encargosHoristaPct);
  return { horas_totais, custo_hora, custo_total: round2(horas_totais * custo_hora) };
}

// ─── Honorários de projeto ────────────────────────────────────────────────

export type HonorarioMetodo = 'area' | 'percentual_obra' | 'horas' | 'fixo';

export interface DisciplinaEntrada {
  metodo: HonorarioMetodo;
  area_m2?: number | null;
  valor_m2?: number | null;
  valor_obra?: number | null;
  percentual?: number | null;
  horas?: number | null;
  valor_hora?: number | null;
  valor_fixo?: number | null;
}

/** §8.7 — `areaPadrao` = honorarios.area_m2; `valorObraPadrao` = orcamentos.total. */
export function valorDisciplina(d: DisciplinaEntrada, areaPadrao: number | null = null, valorObraPadrao: number | null = null): number {
  switch (d.metodo) {
    case 'area':
      return round2((d.area_m2 ?? areaPadrao ?? 0) * (d.valor_m2 ?? 0));
    case 'percentual_obra':
      return round2(((d.valor_obra ?? valorObraPadrao ?? 0) * (d.percentual ?? 0)) / 100);
    case 'horas':
      return round2((d.horas ?? 0) * (d.valor_hora ?? 0));
    case 'fixo':
      return round2(d.valor_fixo ?? 0);
  }
}

export function totalHonorarios(valores: readonly number[], descontoPct: number, impostosPct: number): { subtotal: number; desconto: number; impostos: number; total: number } {
  if (impostosPct >= 100) throw new RangeError('Impostos devem ser menores que 100%.');
  const subtotal = somaMoeda(valores);
  const comDesconto = subtotal * (1 - descontoPct / 100);
  const total = round2(comDesconto / (1 - impostosPct / 100));
  const desconto = round2(subtotal - comDesconto);
  return { subtotal, desconto, impostos: round2(total - (subtotal - desconto)), total };
}

// ─── Cronograma ───────────────────────────────────────────────────────────

export type Periodicidade = 'semanal' | 'quinzenal' | 'mensal';

export interface PeriodoCronograma {
  periodo: number;
  /** YYYY-MM-DD */
  inicio: string;
  /** YYYY-MM-DD */
  fim: string;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Períodos do cronograma (mesma regra do SQL `fn_cronograma_fisico_financeiro`):
 * semanal = +7 dias, quinzenal = +15 dias, mensal = +1 mês (mesmo dia; fim = véspera do próximo).
 */
export function gerarPeriodos(dataInicio: string, periodicidade: Periodicidade, n: number): PeriodoCronograma[] {
  const [y, m, d] = dataInicio.split('-').map(Number) as [number, number, number];
  const inicioDe = (k: number): Date => {
    if (periodicidade === 'mensal') {
      // equivalente a `data_inicio + (k || ' months')::interval` do Postgres (ajusta fim de mês)
      const alvo = new Date(y, m - 1 + k, 1);
      const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
      return new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d, ultimo));
    }
    const passo = periodicidade === 'semanal' ? 7 : 15;
    return new Date(y, m - 1, d + k * passo);
  };
  const out: PeriodoCronograma[] = [];
  for (let k = 0; k < n; k++) {
    const ini = inicioDe(k);
    const prox = inicioDe(k + 1);
    const fim = new Date(prox.getFullYear(), prox.getMonth(), prox.getDate() - 1);
    out.push({ periodo: k + 1, inicio: iso(ini), fim: iso(fim) });
  }
  return out;
}

/** Valor financeiro de uma etapa no período = round2(total_etapa × pct/100). */
export const valorPeriodo = (totalEtapa: number, percentual: number): number => round2((totalEtapa * percentual) / 100);

// ─── Medições ─────────────────────────────────────────────────────────────

export const valorMedido = (quantidade: number, precoUnitario: number): number => round2(quantidade * precoUnitario);

// ─── Memória de cálculo: avaliador de expressões (sem eval) ───────────────

export type ResultadoExpressao = { ok: true; valor: number } | { ok: false; erro: string; posicao: number };

type Token = { t: 'num'; v: number; p: number } | { t: 'op'; v: '+' | '-' | '*' | '/' | '^'; p: number } | { t: '('; p: number } | { t: ')'; p: number };

function tokenizar(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src.charAt(i);
    if (c === ' ' || c === '\t' || c === '\n') {
      i++;
      continue;
    }
    if (/[0-9.,]/.test(c)) {
      const ini = i;
      while (i < src.length && /[0-9.,]/.test(src.charAt(i))) i++;
      const raw = src.slice(ini, i);
      if ((raw.match(/[.,]/g) ?? []).length > 1) throw Object.assign(new Error(`Número inválido "${raw}" (não use separador de milhar)`), { pos: ini });
      const v = Number(raw.replace(',', '.'));
      if (!Number.isFinite(v)) throw Object.assign(new Error(`Número inválido "${raw}"`), { pos: ini });
      out.push({ t: 'num', v, p: ini });
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') out.push({ t: 'op', v: c, p: i });
    else if (c === 'x' || c === 'X' || c === '×' || c === '·') out.push({ t: 'op', v: '*', p: i });
    else if (c === '÷') out.push({ t: 'op', v: '/', p: i });
    else if (c === '−') out.push({ t: 'op', v: '-', p: i });
    else if (c === '(' || c === '[') out.push({ t: '(', p: i });
    else if (c === ')' || c === ']') out.push({ t: ')', p: i });
    else throw Object.assign(new Error(`Caractere inválido "${c}"`), { pos: i });
    i++;
  }
  return out;
}

/**
 * Avalia expressão aritmética pt-BR: `2*(3,50+4,20)*2,80 - 1,20x2,10`.
 * Suporta + − * / ^, parênteses, menos unário, `x`/`×` como multiplicação. Resultado com 4 casas.
 */
export function avaliarExpressao(expr: string): ResultadoExpressao {
  let tokens: Token[];
  try {
    tokens = tokenizar(expr);
  } catch (e) {
    const err = e as Error & { pos?: number };
    return { ok: false, erro: err.message, posicao: err.pos ?? 0 };
  }
  if (tokens.length === 0) return { ok: false, erro: 'Expressão vazia', posicao: 0 };
  let k = 0;
  const peek = () => tokens[k];
  const fail = (msg: string): never => {
    throw Object.assign(new Error(msg), { pos: peek()?.p ?? expr.length });
  };
  // expr := termo (('+'|'-') termo)*
  const parseExpr = (): number => {
    let v = parseTermo();
    for (let t = peek(); t && t.t === 'op' && (t.v === '+' || t.v === '-'); t = peek()) {
      k++;
      const r = parseTermo();
      v = t.v === '+' ? v + r : v - r;
    }
    return v;
  };
  // termo := unario (('*'|'/') unario)*
  const parseTermo = (): number => {
    let v = parseUnario();
    for (let t = peek(); t && t.t === 'op' && (t.v === '*' || t.v === '/'); t = peek()) {
      k++;
      const r = parseUnario();
      if (t.v === '/') {
        if (r === 0) fail('Divisão por zero');
        v = v / r;
      } else v = v * r;
    }
    return v;
  };
  // unario := ('-'|'+') unario | potencia      (−2^2 = −4, como na matemática)
  const parseUnario = (): number => {
    const t = peek();
    if (t && t.t === 'op' && (t.v === '-' || t.v === '+')) {
      k++;
      const v = parseUnario();
      return t.v === '-' ? -v : v;
    }
    return parsePotencia();
  };
  // potencia := primario ('^' unario)?         (associativa à direita)
  const parsePotencia = (): number => {
    const b = parsePrimario();
    const t = peek();
    if (t && t.t === 'op' && t.v === '^') {
      k++;
      return b ** parseUnario();
    }
    return b;
  };
  const parsePrimario = (): number => {
    const t = peek();
    if (!t) return fail('Expressão incompleta');
    if (t.t === 'num') {
      k++;
      return t.v;
    }
    if (t.t === '(') {
      k++;
      const v = parseExpr();
      const f = peek();
      if (!f || f.t !== ')') fail('Parêntese não fechado');
      k++;
      return v;
    }
    return fail('Valor esperado');
  };
  try {
    const v = parseExpr();
    if (k < tokens.length) fail('Símbolo inesperado');
    if (!Number.isFinite(v)) return { ok: false, erro: 'Resultado inválido', posicao: 0 };
    return { ok: true, valor: round4(v) };
  } catch (e) {
    const err = e as Error & { pos?: number };
    return { ok: false, erro: err.message, posicao: err.pos ?? 0 };
  }
}

/** Quantidade do item a partir das linhas de memória = round4(Σ resultado). */
export const quantidadeDaMemoria = (resultados: readonly number[]): number => round4(resultados.reduce((s, r) => s + r, 0));
