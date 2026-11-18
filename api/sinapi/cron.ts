/**
 * GET /api/sinapi/cron — rotina diária (Vercel Cron, ver vercel.json). Mantém atualizadas as UFs em uso:
 * baixa o mês mais recente publicado e importa as UFs que ainda não o têm. O que não couber no tempo
 * da função fica para a execução do dia seguinte. Protegida por CRON_SECRET.
 */
import { clienteServico, ErroConfig, json, sincronizar } from '../_lib/servidor.js';

export async function GET(req: Request): Promise<Response> {
  const inicio = Date.now();
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get('authorization') !== `Bearer ${segredo}`) return json(401, { erro: 'Não autorizado.' });
  try {
    const sb = clienteServico();
    const { data, error } = await sb.rpc('fn_sinapi_ufs_em_uso');
    if (error) throw new Error(error.message);
    const ufs = (data as string[] | null) ?? [];
    if (!ufs.length) return json(200, { status: 'nada_a_fazer' });
    return json(200, await sincronizar(sb, { ufs, origem: 'automatica', solicitadoPor: null }, inicio));
  } catch (e) {
    if (e instanceof ErroConfig) return json(500, { erro: e.message });
    console.error('[sinapi/cron]', e);
    return json(500, { erro: e instanceof Error ? e.message : 'Erro inesperado.' });
  }
}
