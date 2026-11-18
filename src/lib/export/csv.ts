/**
 * Exportação CSV padrão Excel pt-BR (ARQUITETURA §12): separador `;`, vírgula decimal,
 * UTF-8 com BOM, CRLF. Dono: FRONTEND-2.
 */
import { roundN } from '@/lib/calc';
import { baixarBlob, CASAS, nomeArquivo, type TabelaExport, type TipoColuna, type ValorCelula } from './tabela';

export const BOM = '﻿';
const SEP = ';';

/** Número sem separador de milhar e com vírgula decimal (12345.6 → "12345,60"). */
export function numeroCsv(v: number, casas: number | null): string {
  if (!Number.isFinite(v)) return '';
  if (casas === null) return String(v).replace('.', ',');
  const r = roundN(v, casas);
  const neg = r < 0;
  const [int, dec = ''] = Math.abs(r).toFixed(casas).split('.');
  return `${neg ? '-' : ''}${int}${casas > 0 ? ',' + dec : ''}`;
}

/** Escapa um campo (aspas duplas quando contém `;`, aspas, quebra de linha). */
export function campoCsv(s: string): string {
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function celulaCsv(v: ValorCelula, tipo: TipoColuna): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return numeroCsv(v, CASAS[tipo]);
  return campoCsv(v);
}

/** Serializa a tabela (com bloco de cabeçalho do documento opcional). */
export function tabelaParaCsv(t: TabelaExport, comMeta = true): string {
  const linhas: string[] = [];
  if (comMeta) {
    linhas.push(campoCsv(t.titulo));
    for (const [k, v] of t.meta) linhas.push(`${campoCsv(k)}${SEP}${campoCsv(v)}`);
    linhas.push('');
  }
  linhas.push(t.colunas.map((c) => campoCsv(c.rotulo)).join(SEP));
  for (const l of t.linhas) linhas.push(t.colunas.map((c) => celulaCsv(l.valores[c.chave], c.tipo)).join(SEP));
  return BOM + linhas.join('\r\n') + '\r\n';
}

export function baixarCsv(t: TabelaExport): void {
  baixarBlob(new Blob([tabelaParaCsv(t)], { type: 'text/csv;charset=utf-8' }), `${nomeArquivo(t.titulo)}.csv`);
}
