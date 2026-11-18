/**
 * Modelo neutro de tabela exportável (CSV/XLSX). Dono: FRONTEND-2.
 * Os construtores de relatórios (relatorios.ts) produzem `TabelaExport`; csv.ts/xlsx.ts serializam.
 */
export type TipoColuna = 'texto' | 'codigo' | 'moeda' | 'quantidade' | 'percentual' | 'coeficiente' | 'inteiro';

export interface ColunaExport {
  chave: string;
  rotulo: string;
  tipo: TipoColuna;
  /** largura aproximada em caracteres (XLSX) */
  largura?: number;
}

export type ValorCelula = string | number | null | undefined;

export interface LinhaExport {
  valores: Record<string, ValorCelula>;
  /** 1–3 = linha de etapa (agrupamento); 0/undefined = item; 'total' = rodapé */
  nivel?: number | 'total';
}

export interface TabelaExport {
  /** nome da aba (XLSX, ≤ 31 caracteres) e base do nome de arquivo */
  nome: string;
  titulo: string;
  /** linhas de cabeçalho do documento: [rótulo, valor] */
  meta: [string, string][];
  colunas: ColunaExport[];
  linhas: LinhaExport[];
}

/** Casas decimais por tipo de coluna. */
export const CASAS: Record<TipoColuna, number | null> = {
  texto: null, codigo: null, moeda: 2, quantidade: 4, percentual: 2, coeficiente: 7, inteiro: 0,
};

/** Nome de arquivo seguro: "Orçamento sintético – Casa X" → "orcamento-sintetico-casa-x". */
export function nomeArquivo(base: string): string {
  return (
    base
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'pretium'
  );
}

/** Dispara o download de um Blob no navegador. */
export function baixarBlob(blob: Blob, arquivo: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = arquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
