/**
 * Infra comum das funções de servidor da SINAPI (Vercel, runtime Node): cliente Supabase com a chave
 * secreta, autenticação do usuário pelo token da sessão, trava/histórico em sinapi_sincronizacoes.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { baixarMaisRecente, baixarPacote, importarNacional, lerPacote, type ResultadoSincronizacao, type Rpc, SinapiIndisponivel } from './sinapi.js';

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

/** Margem para terminar a UF em andamento antes do limite de 300 s da função. */
export const PRAZO_MS = 230_000;

export function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export function clienteServico(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !chave) {
    throw new ErroConfig('Configure no Vercel as variáveis SUPABASE_SERVICE_ROLE_KEY (chave secreta do Supabase) e VITE_SUPABASE_URL.');
  }
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class ErroConfig extends Error {}

export function rpcDe(sb: SupabaseClient): Rpc {
  return async (fn, args) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
}

export interface Solicitante {
  id: string;
  admin: boolean;
}

/** Usuário ativo dono do token `Authorization: Bearer <access_token>`; null se inválido/inativo. */
export async function autenticar(sb: SupabaseClient, req: Request): Promise<Solicitante | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: perfil } = await sb.from('profiles').select('status, papel_global').eq('id', data.user.id).maybeSingle();
  if (!perfil || perfil.status !== 'active') return null;
  return { id: data.user.id, admin: perfil.papel_global === 'admin' };
}

/** UFs que já têm os dois regimes oficiais publicados no mês. */
export async function ufsCompletas(sb: SupabaseClient, ano: number, mes: number): Promise<Set<string>> {
  const { data } = await sb.from('datas_base').select('uf, regime').eq('ano', ano).eq('mes', mes).eq('is_demo', false).eq('status', 'publicada');
  const cont = new Map<string, number>();
  for (const d of data ?? []) cont.set(d.uf as string, (cont.get(d.uf as string) ?? 0) + 1);
  return new Set([...cont].filter(([, n]) => n >= 2).map(([uf]) => uf));
}

async function analiticoImportado(sb: SupabaseClient, ano: number, mes: number): Promise<boolean> {
  const { data: dbs } = await sb.from('datas_base').select('id').eq('ano', ano).eq('mes', mes).eq('is_demo', false);
  const ids = (dbs ?? []).map((d) => d.id as string);
  if (!ids.length) return false;
  const { count } = await sb.from('sinapi_importacoes').select('id', { count: 'exact', head: true }).in('data_base_id', ids).eq('tipo', 'analitico').eq('status', 'concluida');
  return (count ?? 0) > 0;
}

/** Já existe sincronização em andamento (iniciada há menos de 10 min) que cubra alguma destas UFs? */
async function emAndamento(sb: SupabaseClient, ufs: string[]): Promise<boolean> {
  const desde = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data } = await sb.from('sinapi_sincronizacoes').select('ufs').eq('status', 'processando').gte('iniciado_em', desde);
  return (data ?? []).some((r) => (r.ufs as string[]).some((u) => ufs.includes(u)));
}

export interface PedidoSincronizacao {
  ufs: string[];
  ano?: number;
  mes?: number;
  origem: 'usuario' | 'automatica' | 'admin';
  solicitadoPor: string | null;
  /** reimporta mesmo se a UF já estiver completa no mês */
  forcar?: boolean;
}

export type RespostaSincronizacao =
  | { status: 'concluida' | 'parcial'; resultado: ResultadoSincronizacao; sincronizacaoId: string }
  | { status: 'ja_disponivel'; ano: number; mes: number; ufs: string[] }
  | { status: 'indisponivel'; mensagem: string }
  | { status: 'em_andamento'; mensagem: string };

/** Fluxo completo: baixa da Caixa → lê → importa → registra histórico. */
export async function sincronizar(sb: SupabaseClient, p: PedidoSincronizacao, inicio = Date.now()): Promise<RespostaSincronizacao> {
  let ufs = [...new Set(p.ufs.map((u) => u.toUpperCase()))].filter((u) => UFS.includes(u));
  if (!ufs.length) return { status: 'indisponivel', mensagem: 'Nenhuma UF válida informada.' };

  if (p.ano && p.mes && !p.forcar) {
    const completas = await ufsCompletas(sb, p.ano, p.mes);
    const faltam = ufs.filter((u) => !completas.has(u));
    if (!faltam.length) return { status: 'ja_disponivel', ano: p.ano, mes: p.mes, ufs };
    ufs = faltam;
  }
  if (await emAndamento(sb, ufs)) return { status: 'em_andamento', mensagem: 'Já existe uma busca em andamento para esta UF. Aguarde alguns minutos e atualize a página.' };

  const { data: reg } = await sb
    .from('sinapi_sincronizacoes')
    .insert({ ano: p.ano ?? new Date().getUTCFullYear(), mes: p.mes ?? new Date().getUTCMonth() + 1, ufs, origem: p.origem, solicitado_por: p.solicitadoPor })
    .select('id')
    .single();
  const syncId = (reg?.id as string | undefined) ?? '';
  const fechar = (campos: Record<string, unknown>) =>
    syncId ? sb.from('sinapi_sincronizacoes').update({ ...campos, finalizado_em: new Date().toISOString() }).eq('id', syncId) : Promise.resolve();

  try {
    const pacote = p.ano && p.mes ? await baixarPacote(p.ano, p.mes).then((r) => (r ? { ano: p.ano!, mes: p.mes!, ...r } : null)) : await baixarMaisRecente();
    if (!pacote) {
      const msg = p.ano && p.mes ? `A Caixa ainda não publicou a SINAPI de ${String(p.mes).padStart(2, '0')}/${p.ano}.` : 'Nenhum pacote SINAPI encontrado nos últimos meses.';
      await fechar({ status: 'indisponivel', mensagem: msg });
      return { status: 'indisponivel', mensagem: msg };
    }
    if (!p.ano || !p.mes) {
      await sb.from('sinapi_sincronizacoes').update({ ano: pacote.ano, mes: pacote.mes }).eq('id', syncId);
      if (!p.forcar) {
        const completas = await ufsCompletas(sb, pacote.ano, pacote.mes);
        ufs = ufs.filter((u) => !completas.has(u));
        if (!ufs.length) {
          await fechar({ status: 'concluida', mensagem: 'Já estava atualizado.', arquivo_url: pacote.url });
          return { status: 'ja_disponivel', ano: pacote.ano, mes: pacote.mes, ufs: p.ufs };
        }
      }
    }
    const { abas } = lerPacote(pacote.bytes);
    const resultado = await importarNacional(rpcDe(sb), {
      ano: pacote.ano,
      mes: pacote.mes,
      url: pacote.url,
      ufs,
      abas,
      analiticoJaImportado: await analiticoImportado(sb, pacote.ano, pacote.mes),
      prazo: inicio + PRAZO_MS,
    });
    const parcial = resultado.pendentes.length > 0;
    const importadas = resultado.ufs.map((u) => u.uf);
    const msg = [
      importadas.length ? `Importado: ${importadas.join(', ')}.` : 'Nada importado.',
      parcial ? `Pendentes (continuam na próxima execução): ${resultado.pendentes.join(', ')}.` : '',
      ...resultado.avisos.slice(0, 10),
    ]
      .filter(Boolean)
      .join(' ');
    await fechar({
      status: importadas.length ? 'concluida' : 'erro',
      mensagem: msg,
      arquivo_url: pacote.url,
      datas_base: resultado.ufs.flatMap((u) => u.regimes.map((r) => r.dataBaseId)),
    });
    return { status: parcial ? 'parcial' : 'concluida', resultado, sincronizacaoId: syncId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const indisponivel = e instanceof SinapiIndisponivel;
    await fechar({ status: indisponivel ? 'indisponivel' : 'erro', mensagem: msg.slice(0, 2000) });
    if (indisponivel) return { status: 'indisponivel', mensagem: `${msg} Tente mais tarde ou peça ao administrador para importar a planilha manualmente.` };
    throw e;
  }
}
