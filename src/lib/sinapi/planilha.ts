/**
 * Leitura de arquivos SINAPI no navegador (SheetJS para .xlsx/.xls; parser próprio para .csv).
 * Dono: FRONTEND-1. Carregado sob demanda (import dinâmico) para não pesar o bundle inicial.
 */
import type { Celula } from './parser';
import { parseCsv } from './parser';

export interface Aba {
  nome: string;
  linhas: Celula[][];
}

function decodificar(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buf);
  // arquivos da Caixa costumam vir em Windows-1252: muitos "\uFFFD" ⇒ tenta latin1
  const ruins = (utf8.match(/\uFFFD/g) ?? []).length;
  if (ruins > 3) return new TextDecoder('windows-1252').decode(buf);
  return utf8;
}

export async function lerPlanilha(file: File): Promise<Aba[]> {
  const buf = await file.arrayBuffer();
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    return [{ nome: file.name.replace(/\.[^.]+$/, ''), linhas: parseCsv(decodificar(buf)) }];
  }
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, dense: true });
  return wb.SheetNames.map((nome) => {
    const ws = wb.Sheets[nome]!;
    const linhas = XLSX.utils.sheet_to_json<Celula[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
    return { nome, linhas };
  });
}
