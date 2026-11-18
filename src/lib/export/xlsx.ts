/**
 * Exportação XLSX (SheetJS). Células numéricas com formato pt-BR aplicado pelo Excel;
 * cabeçalho do documento nas primeiras linhas; larguras de coluna. Dono: FRONTEND-2.
 */
import * as XLSX from 'xlsx';
import { baixarBlob, CASAS, nomeArquivo, type TabelaExport, type TipoColuna } from './tabela';

const FORMATO: Record<TipoColuna, string | null> = {
  texto: null, codigo: '@', moeda: '#,##0.00', quantidade: '#,##0.0000', percentual: '0.00"%"', coeficiente: '0.0000000', inteiro: '0',
};

/** Nome de aba válido (≤ 31, sem []:*?/\). */
export function nomeAba(s: string): string {
  return s.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Planilha';
}

export function tabelaParaSheet(t: TabelaExport): XLSX.WorkSheet {
  const aoa: (string | number | null)[][] = [[t.titulo], ...t.meta.map(([k, v]) => [k, v]), []];
  const inicio = aoa.length;
  aoa.push(t.colunas.map((c) => c.rotulo));
  for (const l of t.linhas) {
    aoa.push(
      t.colunas.map((c) => {
        const v = l.valores[c.chave];
        if (v === undefined || v === null || v === '') return null;
        if (typeof v === 'number' && CASAS[c.tipo] !== null) return v;
        return typeof v === 'number' ? v : String(v);
      }),
    );
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // formatos numéricos por coluna
  t.colunas.forEach((c, ci) => {
    const z = FORMATO[c.tipo];
    if (!z) return;
    for (let r = inicio + 1; r < aoa.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: ci })] as XLSX.CellObject | undefined;
      if (cell && cell.t === 'n') cell.z = z;
    }
  });
  ws['!cols'] = t.colunas.map((c) => ({ wch: c.largura ?? Math.max(10, c.rotulo.length + 2) }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: inicio, c: 0 }, e: { r: aoa.length - 1, c: t.colunas.length - 1 } }) };
  return ws;
}

/** Pasta de trabalho com uma aba por tabela. */
export function tabelasParaWorkbook(tabelas: readonly TabelaExport[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const usados = new Set<string>();
  for (const t of tabelas) {
    let nome = nomeAba(t.nome);
    for (let i = 2; usados.has(nome); i++) nome = nomeAba(`${t.nome.slice(0, 27)} (${i})`);
    usados.add(nome);
    XLSX.utils.book_append_sheet(wb, tabelaParaSheet(t), nome);
  }
  wb.Props = { Title: tabelas[0]?.titulo ?? 'Pretium', Author: 'Pretium' };
  return wb;
}

export function baixarXlsx(tabelas: readonly TabelaExport[], arquivo?: string): void {
  const wb = tabelasParaWorkbook(tabelas);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  baixarBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${nomeArquivo(arquivo ?? tabelas[0]?.titulo ?? 'pretium')}.xlsx`,
  );
}
