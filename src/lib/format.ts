/**
 * Formatação pt-BR (fonte única). Nunca usar toFixed()/toLocaleString() avulsos nas telas.
 */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfCache = new Map<string, Intl.NumberFormat>();

function nf(min: number, max: number): Intl.NumberFormat {
  const k = `${min}-${max}`;
  let f = nfCache.get(k);
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
    nfCache.set(k, f);
  }
  return f;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** R$ 1.234,56 — `vazio` é devolvido para null/undefined/NaN. */
export function formatBRL(v: number | null | undefined, vazio = '—'): string {
  return isNum(v) ? brl.format(v).replace(/\u00a0/g, ' ') : vazio;
}

/** 1.234,56 (sem símbolo) — para colunas de tabela onde o cabeçalho indica R$. */
export function formatMoeda(v: number | null | undefined, vazio = '—'): string {
  return isNum(v) ? nf(2, 2).format(v) : vazio;
}

/** Número com casas fixas: formatNumero(1234.5, 2) → "1.234,50". */
export function formatNumero(v: number | null | undefined, casas = 2, vazio = '—'): string {
  return isNum(v) ? nf(casas, casas).format(v) : vazio;
}

/** Quantidade: até 4 casas, mínimo 2 (12,5 → "12,50"; 0,1234 → "0,1234"). */
export function formatQuantidade(v: number | null | undefined, vazio = '—'): string {
  return isNum(v) ? nf(2, 4).format(v) : vazio;
}

/** Coeficiente de composição: até 7 casas, mínimo 4. */
export function formatCoeficiente(v: number | null | undefined, vazio = '—'): string {
  return isNum(v) ? nf(4, 7).format(v) : vazio;
}

/** Percentual em pontos (22.12 → "22,12%"). */
export function formatPercent(v: number | null | undefined, casas = 2, vazio = '—'): string {
  return isNum(v) ? `${nf(casas, casas).format(v)}%` : vazio;
}

/** Converte "1.234,56", "1234,56", "1234.56", " R$ 10 " em número. Retorna null se inválido. */
export function parseNumeroBR(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = input.replace(/R\$|%|\s/g, '').trim();
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // o último separador é o decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234.567" = milhar pt-BR
    s = s.replace(/\./g, '');
  }
  if (!/^-?\d*\.?\d+$/.test(s) && !/^-?\d+\.?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ─── Datas ────────────────────────────────────────────────────────────────
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Interpreta 'YYYY-MM-DD' como data local (evita deslocamento de fuso). */
export function parseIsoDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(iso);
}

/** 18/11/2026 */
export function formatData(v: string | Date | null | undefined, vazio = '—'): string {
  if (!v) return vazio;
  const d = typeof v === 'string' ? parseIsoDate(v) : v;
  if (Number.isNaN(d.getTime())) return vazio;
  return d.toLocaleDateString('pt-BR');
}

/** 18/11/2026 14:32 */
export function formatDataHora(v: string | Date | null | undefined, vazio = '—'): string {
  if (!v) return vazio;
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return vazio;
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Data-base SINAPI: (2026, 9) → "09/2026"; extenso → "setembro/2026". */
export function formatMesAno(ano: number, mes: number, extenso = false): string {
  if (extenso) return `${MESES[mes - 1] ?? mes}/${ano}`;
  return `${String(mes).padStart(2, '0')}/${ano}`;
}

export function formatMesAbrev(ano: number, mes: number): string {
  return `${MESES_ABREV[mes - 1] ?? mes}/${String(ano).slice(-2)}`;
}

/** "há 5 min", "há 2 dias" */
export function formatRelativo(v: string | Date | null | undefined, agora: Date = new Date()): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  const s = Math.round((agora.getTime() - d.getTime()) / 1000);
  if (s < 60) return 'agora';
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.round(h / 24);
  if (dias < 30) return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  return formatData(d);
}

// ─── Documentos ───────────────────────────────────────────────────────────
export const somenteDigitos = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '');

/** CPF 000.000.000-00 ou CNPJ 00.000.000/0000-00 conforme a quantidade de dígitos. */
export function formatDocumento(v: string | null | undefined, vazio = '—'): string {
  const d = somenteDigitos(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d || vazio;
}

export function formatCep(v: string | null | undefined, vazio = '—'): string {
  const d = somenteDigitos(v);
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : d || vazio;
}

export function formatTelefone(v: string | null | undefined, vazio = '—'): string {
  const d = somenteDigitos(v);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return d || vazio;
}

/** Valida CPF/CNPJ pelos dígitos verificadores. */
export function documentoValido(v: string | null | undefined): boolean {
  const d = somenteDigitos(v);
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return false;
    const dv = (n: number) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return false;
    const dv = (n: number) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const s = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
  }
  return false;
}
