/**
 * Leitura da planilha de referência NACIONAL da SINAPI (formato publicado pela Caixa a partir de 2025):
 * um único arquivo por mês (`SINAPI_Referência_AAAA_MM.xlsx`, dentro de `SINAPI-AAAA-MM-formato-xlsx.zip`)
 * com abas por tipo/regime e uma coluna de preço por UF:
 *   ISD / ICD  → insumos sem / com desoneração
 *   CSD / CCD  → composições sem / com desoneração
 *   Analítico  → coeficientes das composições (iguais para todas as UFs)
 *
 * A sigla da UF pode estar na própria linha de títulos ou numa linha logo acima (células mescladas,
 * com subcolunas "Custo" / "%AS"); por isso a coluna de cada UF é localizada nas linhas próximas ao
 * cabeçalho, e não pelo título. Lógica pura: usada pela função de servidor (api/sinapi) e testada no vitest.
 */
import type { RegimeDesoneracao } from '@/types/database';
import type { LinhaComposicaoItemSinapi, LinhaComposicaoSinapi, LinhaInsumoSinapi, TipoPlanilhaSinapi } from '@/types/sinapi-import';
import {
  CAMPOS,
  type Celula,
  detectarLinhaCabecalho,
  type ErroLinha,
  extrairAnalitico,
  extrairComposicoes,
  extrairInsumos,
  type Mapeamento,
  type Matriz,
  normalizarTexto,
  sugerirMapeamento,
  UFS_BR,
} from './parser.js';

export interface AbaPlanilha {
  nome: string;
  linhas: Matriz;
}

export type Uf = (typeof UFS_BR)[number];

export interface DadosUfRegime {
  insumos: LinhaInsumoSinapi[];
  composicoes: LinhaComposicaoSinapi[];
  erros: number;
}

export interface ResultadoNacional {
  /** dados[uf][regime] */
  dados: Partial<Record<Uf, Partial<Record<RegimeDesoneracao, DadosUfRegime>>>>;
  analitico: LinhaComposicaoItemSinapi[];
  /** abas reconhecidas (para diagnóstico) */
  abas: { nome: string; tipo: TipoPlanilhaSinapi; regime: RegimeDesoneracao | null; cabecalho: number }[];
  avisos: string[];
  errosAmostra: ErroLinha[];
}

/** Aba do arquivo nacional → tipo + regime. ISE/CSE ("sem encargos") e demais abas são ignoradas. */
export function classificarAba(nome: string): { tipo: TipoPlanilhaSinapi; regime: RegimeDesoneracao | null } | null {
  const n = normalizarTexto(nome).replace(/[^A-Z]/g, '');
  if (n.startsWith('ANALITIC')) return { tipo: 'analitico', regime: null };
  if (n === 'ISD') return { tipo: 'insumos', regime: 'nao_desonerado' };
  if (n === 'ICD') return { tipo: 'insumos', regime: 'desonerado' };
  if (n === 'CSD') return { tipo: 'composicoes', regime: 'nao_desonerado' };
  if (n === 'CCD') return { tipo: 'composicoes', regime: 'desonerado' };
  return null;
}

/**
 * Coluna (0-based) com a sigla exata da UF nas linhas `cab-4 … cab` (a mais próxima do cabeçalho vence).
 * Com células mescladas, a sigla fica na 1ª coluna do bloco, que é a do valor (custo/preço).
 */
export function colunaDaUf(linhas: Matriz, cab: number, uf: string): number {
  const alvo = uf.toUpperCase();
  for (let r = cab; r >= Math.max(0, cab - 4); r--) {
    const row = linhas[r] ?? [];
    for (let c = 0; c < row.length; c++) if (normalizarTexto(row[c]) === alvo) return c;
  }
  return -1;
}

/** Primeira coluna que tem sigla de UF (início do bloco de preços), ou -1. */
function inicioBlocoUf(linhas: Matriz, cab: number): number {
  let menor = -1;
  for (const uf of UFS_BR) {
    const c = colunaDaUf(linhas, cab, uf);
    if (c >= 0 && (menor < 0 || c < menor)) menor = c;
  }
  return menor;
}

/** Mapeamento dos campos descritivos (código, descrição…) ignorando o bloco de colunas das UFs. */
function mapearDescritivos(linhas: Matriz, cab: number, tipo: TipoPlanilhaSinapi): Mapeamento {
  const inicio = inicioBlocoUf(linhas, cab);
  const cabecalho: Celula[] = [...(linhas[cab] ?? [])].map((c, i) => (inicio >= 0 && i >= inicio ? null : c));
  const map = sugerirMapeamento(cabecalho, tipo, 'RJ', 'uf');
  map.uf = null; // não há coluna "UF" para filtrar: cada UF é uma coluna de valor
  return map;
}

const valorCampo = (tipo: TipoPlanilhaSinapi) => CAMPOS[tipo].find((c) => c.valorUf)?.campo ?? null;

/**
 * Extrai, das abas do arquivo nacional, insumos e composições de cada UF pedida nos dois regimes e o
 * analítico (uma vez). UFs sem coluna na planilha geram aviso.
 */
export function extrairNacional(abas: readonly AbaPlanilha[], ufs: readonly string[]): ResultadoNacional {
  const res: ResultadoNacional = { dados: {}, analitico: [], abas: [], avisos: [], errosAmostra: [] };
  const pedidas = [...new Set(ufs.map((u) => u.toUpperCase()))].filter((u): u is Uf => (UFS_BR as readonly string[]).includes(u));

  for (const aba of abas) {
    const cls = classificarAba(aba.nome);
    if (!cls) continue;
    const cab = detectarLinhaCabecalho(aba.linhas, 60);
    if (cab < 0) {
      res.avisos.push(`Aba "${aba.nome}": cabeçalho (Código/Descrição) não encontrado.`);
      continue;
    }
    res.abas.push({ nome: aba.nome, tipo: cls.tipo, regime: cls.regime, cabecalho: cab });
    const map = mapearDescritivos(aba.linhas, cab, cls.tipo);

    if (cls.tipo === 'analitico') {
      map.custo = null; // custos vêm das abas CSD/CCD
      const r = extrairAnalitico(aba.linhas, cab, map);
      res.analitico = r.linhas;
      res.errosAmostra.push(...r.erros.slice(0, 20));
      continue;
    }

    const campoValor = valorCampo(cls.tipo);
    const regime = cls.regime as RegimeDesoneracao;
    for (const uf of pedidas) {
      const col = colunaDaUf(aba.linhas, cab, uf);
      if (col < 0 || !campoValor) {
        res.avisos.push(`Aba "${aba.nome}": coluna da UF ${uf} não encontrada.`);
        continue;
      }
      const mapUf: Mapeamento = { ...map, [campoValor]: col };
      const porUf = (res.dados[uf] ??= {});
      const alvo = (porUf[regime] ??= { insumos: [], composicoes: [], erros: 0 });
      if (cls.tipo === 'insumos') {
        const r = extrairInsumos(aba.linhas, cab, mapUf);
        alvo.insumos = r.linhas;
        alvo.erros += r.erros.length;
        if (res.errosAmostra.length < 20) res.errosAmostra.push(...r.erros.slice(0, 5));
      } else {
        const r = extrairComposicoes(aba.linhas, cab, mapUf);
        alvo.composicoes = r.linhas;
        alvo.erros += r.erros.length;
        if (res.errosAmostra.length < 20) res.errosAmostra.push(...r.erros.slice(0, 5));
      }
    }
  }

  if (!res.abas.some((a) => a.tipo === 'insumos')) res.avisos.push('Nenhuma aba de insumos (ISD/ICD) reconhecida.');
  if (!res.abas.some((a) => a.tipo === 'composicoes')) res.avisos.push('Nenhuma aba de composições (CSD/CCD) reconhecida.');
  return res;
}

// ─── Endereços da Caixa ────────────────────────────────────────────────────

export const CAIXA_BASE = 'https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais';

/** URL do pacote mensal nacional (formato a partir de 2025). */
export function urlPacoteNacional(ano: number, mes: number): string {
  return `${CAIXA_BASE}/SINAPI-${ano}-${String(mes).padStart(2, '0')}-formato-xlsx.zip`;
}

/** Meses candidatos, do mais recente ao mais antigo (a Caixa publica o mês M por volta do dia 10–15 de M+1). */
export function mesesCandidatos(hoje: Date, quantos = 4): { ano: number; mes: number }[] {
  const out: { ano: number; mes: number }[] = [];
  let ano = hoje.getUTCFullYear();
  let mes = hoje.getUTCMonth() + 1;
  for (let i = 0; i < quantos; i++) {
    out.push({ ano, mes });
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
  }
  return out;
}

/** Arquivo de referência dentro do ZIP (ignora relatórios de famílias, manutenções etc.). */
export function escolherArquivoReferencia(nomes: readonly string[]): string | null {
  const xlsx = nomes.filter((n) => /\.xlsx$/i.test(n) && !n.startsWith('__MACOSX'));
  const norm = (n: string) => normalizarTexto(n.split('/').pop() ?? n);
  return xlsx.find((n) => norm(n).includes('REFERENCIA')) ?? xlsx.find((n) => /INSUMOS? E COMPOSI/.test(norm(n))) ?? null;
}

/** Ano/mês a partir do nome do pacote ou da planilha (SINAPI-2026-10-formato-xlsx.zip, SINAPI_Referência_2026_10.xlsx). */
export function anoMesDoNome(nome: string): { ano: number; mes: number } | null {
  const m = /(20\d{2})[-_ ](0[1-9]|1[0-2])(?!\d)/.exec(nome);
  return m ? { ano: Number(m[1]), mes: Number(m[2]) } : null;
}
