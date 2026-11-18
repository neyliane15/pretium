/**
 * Sincronização SINAPI no servidor: baixa o pacote mensal nacional da Caixa, lê a planilha de referência
 * e grava, para cada UF pedida e nos dois regimes, insumos + composições (e o analítico uma vez por mês)
 * usando as RPCs de importação com a chave service_role. Sem dependência do Vercel: testável no vitest.
 */
import { unzipSync } from 'fflate';
import * as XLSXns from 'xlsx';
import { emLotes, type Matriz } from './parser.js';
import {
  type AbaPlanilha,
  escolherArquivoReferencia,
  extrairNacional,
  mesesCandidatos,
  type ResultadoNacional,
  urlPacoteNacional,
} from './nacional.js';

// xlsx é CommonJS: no Node ESM o conteúdo vem em `default`; no vitest/Vite, no namespace.
const XLSX = ((XLSXns as unknown as { default?: typeof XLSXns }).default ?? XLSXns) as typeof XLSXns;

export const LOTE = 1000;
const REGIMES = ['nao_desonerado', 'desonerado'] as const;

/** Chamada RPC genérica (supabase.rpc com service_role). Lança em erro. */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

export class SinapiIndisponivel extends Error {
  constructor(
    mensagem: string,
    /** status HTTP devolvido pela Caixa, quando houver */
    readonly status?: number,
  ) {
    super(mensagem);
  }
}

/**
 * O servidor se identifica honestamente. Se a Caixa recusar o acesso automático (403/429), o sistema
 * respeita a recusa e orienta o envio manual do pacote — não tenta contornar a proteção do site.
 */
const CABECALHOS: Record<string, string> = {
  'User-Agent': 'Pretium/1.0 (orcamento de obras; importacao mensal SINAPI)',
  Accept: 'application/zip,application/octet-stream,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

/** Descreve a causa de uma falha de rede do fetch do Node (undici põe o motivo em `cause`). */
export function motivoFalhaRede(e: unknown): string {
  const c = (e as { cause?: { code?: string; message?: string } })?.cause;
  const code = c?.code ?? '';
  const MAPA: Record<string, string> = {
    ECONNRESET: 'a Caixa encerrou a conexão (provável bloqueio de acesso automático ou de fora do Brasil)',
    ECONNREFUSED: 'a Caixa recusou a conexão',
    ETIMEDOUT: 'tempo esgotado ao conectar na Caixa',
    UND_ERR_CONNECT_TIMEOUT: 'tempo esgotado ao conectar na Caixa',
    UND_ERR_SOCKET: 'a conexão com a Caixa caiu durante o download',
    ENOTFOUND: 'endereço da Caixa não encontrado (DNS)',
    EAI_AGAIN: 'falha temporária de DNS',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'o certificado do site da Caixa não pôde ser verificado (cadeia incompleta)',
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'o certificado do site da Caixa não pôde ser verificado (cadeia incompleta)',
    CERT_HAS_EXPIRED: 'o certificado do site da Caixa está vencido',
  };
  if ((e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError') return 'tempo esgotado no download';
  const base = MAPA[code] ?? (c?.message || (e as Error)?.message || 'falha de rede');
  return code && !MAPA[code] ? `${base} (${code})` : base;
}

/** Baixa o ZIP de um mês. null = ainda não publicado (404); lança SinapiIndisponivel em bloqueio/erro de rede. */
export async function baixarPacote(ano: number, mes: number, f: typeof fetch = fetch, tentativas = 2): Promise<{ url: string; bytes: Uint8Array } | null> {
  const url = urlPacoteNacional(ano, mes);
  let r: Response | null = null;
  let ultimo: unknown = null;
  for (let t = 0; t < tentativas && !r; t++) {
    try {
      r = await f(url, { headers: CABECALHOS, redirect: 'follow', signal: AbortSignal.timeout(120_000) });
    } catch (e) {
      ultimo = e;
      if (t + 1 < tentativas) await new Promise((ok) => setTimeout(ok, 1500));
    }
  }
  if (!r) throw new SinapiIndisponivel(`Não foi possível conectar à Caixa: ${motivoFalhaRede(ultimo)}.`);
  if (r.status === 404) return null;
  if (!r.ok) throw new SinapiIndisponivel(`A Caixa respondeu HTTP ${r.status}${r.status === 403 || r.status === 429 ? ' (acesso automático bloqueado)' : ''}.`, r.status);
  const bytes = new Uint8Array(await r.arrayBuffer());
  // ZIP começa com "PK"; páginas de erro/bloqueio vêm como HTML
  if (bytes.length < 1000 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    const tipo = r.headers.get('content-type') ?? '';
    if (/html/i.test(tipo)) return null; // página "não encontrado" amigável
    throw new SinapiIndisponivel(`O arquivo baixado de ${url} não é um ZIP válido.`);
  }
  return { url, bytes };
}

/** Mês mais recente publicado (tenta do mês atual para trás). */
export async function baixarMaisRecente(hoje = new Date(), f: typeof fetch = fetch) {
  // 403 num mês ainda não publicado pode significar "arquivo inexistente": tenta os meses anteriores
  let recusa: SinapiIndisponivel | null = null;
  for (const { ano, mes } of mesesCandidatos(hoje, 4)) {
    try {
      const p = await baixarPacote(ano, mes, f, 1);
      if (p) return { ano, mes, ...p };
    } catch (e) {
      if (e instanceof SinapiIndisponivel && e.status === 403) {
        recusa = e;
        continue;
      }
      throw e;
    }
  }
  if (recusa) throw recusa;
  return null;
}

/** Planilha de referência (.xlsx) → abas relevantes (só ISD/ICD/CSD/CCD/Analítico, para poupar memória). */
export function lerPlanilhaReferencia(xlsx: Uint8Array): AbaPlanilha[] {
  const wb = XLSX.read(xlsx, { type: 'array', dense: true, cellFormula: false, cellHTML: false, cellText: false, cellStyles: false });
  const quer = (n: string) => /^(ISD|ICD|CSD|CCD)$/i.test(n.trim()) || /^anal/i.test(n.trim());
  return wb.SheetNames.filter(quer).map((nome) => ({
    nome,
    linhas: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome]!, { header: 1, raw: true, blankrows: true, defval: null }) as Matriz,
  }));
}

/** ZIP do pacote mensal → abas da planilha de referência. */
export function lerPacote(zip: Uint8Array): { arquivo: string; abas: AbaPlanilha[] } {
  const nomes: string[] = [];
  const arquivos = unzipSync(zip, {
    filter: (f) => {
      nomes.push(f.name);
      return /\.xlsx$/i.test(f.name);
    },
  });
  const arquivo = escolherArquivoReferencia(Object.keys(arquivos).length ? Object.keys(arquivos) : nomes);
  if (!arquivo || !arquivos[arquivo]) throw new SinapiIndisponivel(`Planilha de referência não encontrada no pacote (arquivos: ${nomes.slice(0, 8).join(', ')}).`);
  return { arquivo, abas: lerPlanilhaReferencia(arquivos[arquivo]) };
}

export { anoMesDoNome } from './nacional.js';

async function enviarLotes(rpc: Rpc, fn: string, importacaoId: string, linhas: readonly unknown[]): Promise<number> {
  let ok = 0;
  for (const lote of emLotes(linhas, LOTE)) ok += Number(await rpc(fn, { p_importacao_id: importacaoId, p_linhas: lote }));
  return ok;
}

async function importarTipo(
  rpc: Rpc,
  p: { uf: string; ano: number; mes: number; regime: string; tipo: 'insumos' | 'composicoes' | 'analitico'; url: string; publicar: boolean },
  fn: string,
  linhas: readonly unknown[],
): Promise<{ dataBaseId: string; ok: number }> {
  const id = String(await rpc('fn_sinapi_iniciar_importacao', { p_uf: p.uf, p_ano: p.ano, p_mes: p.mes, p_regime: p.regime, p_tipo: p.tipo, p_arquivo_nome: p.url }));
  try {
    const ok = await enviarLotes(rpc, fn, id, linhas);
    const fim = (await rpc('fn_sinapi_finalizar_importacao', { p_importacao_id: id, p_publicar: p.publicar })) as { data_base_id: string };
    return { dataBaseId: fim.data_base_id, ok };
  } catch (e) {
    await rpc('fn_sinapi_cancelar_importacao', { p_importacao_id: id }).catch(() => undefined);
    throw e;
  }
}

export interface ResumoUf {
  uf: string;
  regimes: { regime: string; insumos: number; composicoes: number; dataBaseId: string }[];
}

export interface ResultadoSincronizacao {
  ano: number;
  mes: number;
  url: string;
  ufs: ResumoUf[];
  analitico: number | null;
  pendentes: string[];
  avisos: string[];
}

/**
 * Importa as UFs pedidas a partir das abas já lidas. `analiticoJaImportado` evita reenviar os
 * coeficientes (iguais em todas as UFs) a cada UF. `prazo` (epoch ms) para de iniciar novas UFs perto
 * do limite de tempo da função; as que sobrarem voltam em `pendentes`.
 */
export async function importarNacional(
  rpc: Rpc,
  p: {
    ano: number;
    mes: number;
    url: string;
    ufs: readonly string[];
    abas: readonly AbaPlanilha[];
    analiticoJaImportado: boolean;
    prazo?: number;
    /** progresso: UF iniciada (índice 0-based) */
    onUf?: (uf: string, i: number, total: number) => void;
  },
): Promise<ResultadoSincronizacao> {
  const ext: ResultadoNacional = extrairNacional(p.abas, p.ufs);
  const out: ResultadoSincronizacao = { ano: p.ano, mes: p.mes, url: p.url, ufs: [], analitico: null, pendentes: [], avisos: [...ext.avisos] };
  let analiticoFeito = p.analiticoJaImportado;

  const lista = p.ufs.map((u) => u.toUpperCase());
  for (const [i, uf] of lista.entries()) {
    p.onUf?.(uf, i, lista.length);
    if (p.prazo && Date.now() > p.prazo) {
      out.pendentes.push(uf);
      continue;
    }
    const porUf = ext.dados[uf as keyof typeof ext.dados];
    if (!porUf) {
      out.avisos.push(`UF ${uf} não encontrada na planilha.`);
      continue;
    }
    const resumo: ResumoUf = { uf, regimes: [] };
    for (const regime of REGIMES) {
      const d = porUf[regime];
      if (!d || (d.insumos.length === 0 && d.composicoes.length === 0)) {
        out.avisos.push(`${uf} ${regime === 'desonerado' ? 'desonerado' : 'não desonerado'}: sem dados na planilha.`);
        continue;
      }
      const base = { uf, ano: p.ano, mes: p.mes, regime, url: p.url };
      const ins = await importarTipo(rpc, { ...base, tipo: 'insumos', publicar: false }, 'fn_sinapi_importar_insumos', d.insumos);
      // o analítico (estrutura das composições) entra uma vez, antes da 1ª publicação
      if (!analiticoFeito && ext.analitico.length > 0) {
        const an = await importarTipo(rpc, { ...base, tipo: 'analitico', publicar: false }, 'fn_sinapi_importar_composicao_itens', ext.analitico);
        out.analitico = an.ok;
        analiticoFeito = true;
      }
      const comp = await importarTipo(rpc, { ...base, tipo: 'composicoes', publicar: true }, 'fn_sinapi_importar_composicoes', d.composicoes);
      resumo.regimes.push({ regime, insumos: ins.ok, composicoes: comp.ok, dataBaseId: comp.dataBaseId });
    }
    out.ufs.push(resumo);
  }
  return out;
}
