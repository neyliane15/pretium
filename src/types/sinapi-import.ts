/**
 * Contrato das linhas normalizadas enviadas pelo importador (FRONTEND-1, src/lib/sinapi/)
 * às RPCs de importação (BACKEND-2). Ver docs/ARQUITETURA.md §7.2 e §9.
 */
import type { InsumoTipo } from './db-orcamento';

/** Tamanho máximo de lote enviado por chamada RPC. */
export const SINAPI_LOTE_MAX = 1000;

export interface LinhaInsumoSinapi {
  codigo: string;
  descricao: string;
  unidade: string;
  preco: number;
  origem_preco?: string | null;
  tipo?: InsumoTipo | null;
  classificacao?: string | null;
  /** número da linha na planilha (1-based) para mensagens de erro */
  linha?: number;
}

export interface LinhaComposicaoSinapi {
  codigo: string;
  descricao: string;
  unidade: string;
  grupo?: string | null;
  custo: number;
  custo_mao_obra?: number | null;
  custo_material?: number | null;
  custo_equipamento?: number | null;
  custo_servicos?: number | null;
  perc_mao_obra?: number | null;
  linha?: number;
}

export interface LinhaComposicaoItemSinapi {
  composicao_codigo: string;
  tipo_item: 'INSUMO' | 'COMPOSICAO';
  item_codigo: string;
  coeficiente: number;
  descricao?: string | null;
  unidade?: string | null;
  linha?: number;
}

export type TipoPlanilhaSinapi = 'insumos' | 'composicoes' | 'analitico';
