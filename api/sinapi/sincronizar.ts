/**
 * POST /api/sinapi/sincronizar — busca a SINAPI oficial direto da Caixa.
 * Corpo: { uf: "SP" } ou { ufs: ["SP","MG"] } (várias UFs: só admin), opcional { ano, mes, forcar }.
 * Sem ano/mes, usa o mês mais recente publicado. Cabeçalho: Authorization: Bearer <access_token do Supabase>.
 */
import { autenticar, clienteServico, ErroConfig, json, sincronizar, UFS } from '../_lib/servidor.js';

export async function POST(req: Request): Promise<Response> {
  const inicio = Date.now();
  try {
    const sb = clienteServico();
    const quem = await autenticar(sb, req);
    if (!quem) return json(401, { erro: 'Sessão inválida ou usuário inativo. Entre novamente.' });

    const corpo = (await req.json().catch(() => ({}))) as { uf?: string; ufs?: string[] | 'todas' | 'em_uso'; ano?: number; mes?: number; forcar?: boolean };
    let ufs: string[];
    if (corpo.ufs === 'todas' || corpo.ufs === 'em_uso' || Array.isArray(corpo.ufs)) {
      if (!quem.admin) return json(403, { erro: 'Buscar várias UFs de uma vez é restrito ao administrador.' });
      if (corpo.ufs === 'todas') ufs = UFS;
      else if (corpo.ufs === 'em_uso') ufs = ((await sb.rpc('fn_sinapi_ufs_em_uso')).data as string[] | null) ?? [];
      else ufs = corpo.ufs;
    } else {
      ufs = corpo.uf ? [corpo.uf] : [];
    }
    const ano = Number.isInteger(corpo.ano) ? corpo.ano : undefined;
    const mes = Number.isInteger(corpo.mes) && corpo.mes! >= 1 && corpo.mes! <= 12 ? corpo.mes : undefined;

    const r = await sincronizar(sb, { ufs, ano, mes, origem: quem.admin ? 'admin' : 'usuario', solicitadoPor: quem.id, forcar: quem.admin && corpo.forcar === true }, inicio);
    const codigo = r.status === 'em_andamento' ? 409 : r.status === 'indisponivel' ? 503 : 200;
    return json(codigo, r);
  } catch (e) {
    if (e instanceof ErroConfig) return json(500, { erro: e.message });
    console.error('[sinapi/sincronizar]', e);
    return json(500, { erro: e instanceof Error ? e.message : 'Erro inesperado.' });
  }
}
