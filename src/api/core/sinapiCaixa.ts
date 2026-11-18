/** Busca automática da SINAPI oficial na Caixa (função de servidor /api/sinapi/sincronizar) e histórico. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qkOrc } from '@/api/orcamento/keys';
import { qkCore } from './keys';

import type { SinapiSincronizacao } from '@/types/database';
export type { SinapiSincronizacao };

export type RespostaBusca =
  | { status: 'concluida' | 'parcial'; resultado: { ano: number; mes: number; ufs: { uf: string }[]; pendentes: string[]; avisos: string[] } }
  | { status: 'ja_disponivel'; ano: number; mes: number; ufs: string[] }
  | { status: 'indisponivel' | 'em_andamento'; mensagem: string };

export interface PedidoBusca {
  uf?: string;
  ufs?: string[] | 'todas' | 'em_uso';
  ano?: number;
  mes?: number;
  forcar?: boolean;
}

export class ErroBusca extends Error {}

/** Dispara a busca. Pode levar alguns minutos (download + leitura + gravação no servidor). */
export function useBuscarSinapiCaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: PedidoBusca): Promise<RespostaBusca> => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new ErroBusca('Sessão expirada. Entre novamente.');
      let r: Response;
      try {
        r = await fetch('/api/sinapi/sincronizar', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify(p),
        });
      } catch {
        throw new ErroBusca('Não foi possível falar com o servidor. Verifique a conexão e tente de novo.');
      }
      const corpo = (await r.json().catch(() => null)) as (RespostaBusca & { erro?: string }) | null;
      if (r.status === 404 && !corpo) throw new ErroBusca('A busca automática só funciona no site publicado (Vercel).');
      if (!corpo) throw new ErroBusca(`Resposta inesperada do servidor (HTTP ${r.status}).`);
      if (corpo.erro) throw new ErroBusca(corpo.erro);
      return corpo;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['ref', 'datas-base'] });
      void qc.invalidateQueries({ queryKey: qkOrc.datasBase() });
      void qc.invalidateQueries({ queryKey: qkCore.dataBaseRecente() });
      void qc.invalidateQueries({ queryKey: qkCore.admin.datasBase() });
      void qc.invalidateQueries({ queryKey: ['sinapi', 'sincronizacoes'] });
    },
  });
}

/** Últimas buscas (atualiza a cada 10 s enquanto alguma estiver em andamento). */
export function useSincronizacoesSinapi(limite = 15) {
  return useQuery({
    queryKey: ['sinapi', 'sincronizacoes', limite],
    queryFn: async () => {
      const { data, error } = await supabase.from('sinapi_sincronizacoes').select('*').order('iniciado_em', { ascending: false }).limit(limite);
      if (error) throw error;
      return (data ?? []) as SinapiSincronizacao[];
    },
    refetchInterval: (q) => ((q.state.data ?? []).some((s) => s.status === 'processando') ? 10_000 : false),
  });
}

/** Texto amigável do resultado. */
export function mensagemResposta(r: RespostaBusca): { tipo: 'success' | 'info' | 'warning'; titulo: string; texto: string } {
  const mm = (a: number, m: number) => `${String(m).padStart(2, '0')}/${a}`;
  switch (r.status) {
    case 'concluida':
      return { tipo: 'success', titulo: 'Tabela oficial importada', texto: `SINAPI ${r.resultado.ufs.map((u) => u.uf).join(', ')} ${mm(r.resultado.ano, r.resultado.mes)} disponível (desonerado e não desonerado).` };
    case 'parcial':
      return { tipo: 'warning', titulo: 'Importação parcial', texto: `Importado: ${r.resultado.ufs.map((u) => u.uf).join(', ') || '—'}. Faltam: ${r.resultado.pendentes.join(', ')} — rode de novo para continuar.` };
    case 'ja_disponivel':
      return { tipo: 'info', titulo: 'Já está disponível', texto: `A SINAPI ${r.ufs.join(', ')} ${mm(r.ano, r.mes)} já foi importada.` };
    default:
      return { tipo: 'warning', titulo: r.status === 'em_andamento' ? 'Busca em andamento' : 'Tabela indisponível', texto: r.mensagem };
  }
}
