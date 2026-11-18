/**
 * Execução da importação SINAPI (RPCs `fn_sinapi_*` do B2, §7.2). Dono: FRONTEND-1.
 * iniciar → lotes (≤ SINAPI_LOTE_MAX) → finalizar(publicar). Cancelamento cooperativo.
 */
import { supabase } from '@/lib/supabase';
import type { ResultadoQualquer } from '@/lib/sinapi/parser';
import { emLotes } from '@/lib/sinapi/parser';
import type { Json, RegimeDesoneracao, SinapiImportacao } from '@/types/database';
import { SINAPI_LOTE_MAX } from '@/types/sinapi-import';
import { ok } from './util';

export interface ParametrosImportacao {
  uf: string;
  ano: number;
  mes: number;
  regime: RegimeDesoneracao;
  arquivoNome: string;
  resultado: ResultadoQualquer;
  publicar: boolean;
  /** analítico: envia também os cabeçalhos de composição (descrição/unidade/custo) */
  incluirCabecalhos?: boolean;
}

export interface Progresso {
  enviados: number;
  total: number;
  okServidor: number;
  etapa: 'iniciando' | 'enviando' | 'finalizando' | 'concluida' | 'cancelada';
}

export class ImportacaoCancelada extends Error {
  constructor() {
    super('Importação cancelada pelo usuário.');
  }
}

export async function executarImportacao(
  p: ParametrosImportacao,
  onProgresso: (pr: Progresso) => void,
  sinal?: { cancelado: boolean },
): Promise<SinapiImportacao> {
  const r = p.resultado;
  const cabecalhos = r.tipo === 'analitico' && p.incluirCabecalhos ? r.composicoes : [];
  const total = r.linhas.length + cabecalhos.length;
  onProgresso({ enviados: 0, total, okServidor: 0, etapa: 'iniciando' });

  const importacaoId = ok(
    await supabase.rpc('fn_sinapi_iniciar_importacao', {
      p_uf: p.uf,
      p_ano: p.ano,
      p_mes: p.mes,
      p_regime: p.regime,
      p_tipo: r.tipo,
      p_arquivo_nome: p.arquivoNome,
    }),
  );

  let enviados = 0;
  let okServidor = 0;
  const enviar = async (fn: 'fn_sinapi_importar_insumos' | 'fn_sinapi_importar_composicoes' | 'fn_sinapi_importar_composicao_itens', linhas: readonly object[]) => {
    for (const lote of emLotes(linhas, SINAPI_LOTE_MAX)) {
      if (sinal?.cancelado) {
        await supabase.rpc('fn_sinapi_cancelar_importacao', { p_importacao_id: importacaoId });
        onProgresso({ enviados, total, okServidor, etapa: 'cancelada' });
        throw new ImportacaoCancelada();
      }
      const n = ok(await supabase.rpc(fn, { p_importacao_id: importacaoId, p_linhas: lote as unknown as Json }));
      enviados += lote.length;
      okServidor += Number(n) || 0;
      onProgresso({ enviados, total, okServidor, etapa: 'enviando' });
    }
  };

  try {
    if (r.tipo === 'insumos') await enviar('fn_sinapi_importar_insumos', r.linhas);
    else if (r.tipo === 'composicoes') await enviar('fn_sinapi_importar_composicoes', r.linhas);
    else {
      if (cabecalhos.length) await enviar('fn_sinapi_importar_composicoes', cabecalhos);
      await enviar('fn_sinapi_importar_composicao_itens', r.linhas);
    }
  } catch (e) {
    if (!(e instanceof ImportacaoCancelada)) await supabase.rpc('fn_sinapi_cancelar_importacao', { p_importacao_id: importacaoId });
    throw e;
  }

  onProgresso({ enviados, total, okServidor, etapa: 'finalizando' });
  const fim = ok(await supabase.rpc('fn_sinapi_finalizar_importacao', { p_importacao_id: importacaoId, p_publicar: p.publicar }));
  onProgresso({ enviados, total, okServidor, etapa: 'concluida' });
  return fim;
}
