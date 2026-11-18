/** Contexto compartilhado pelas abas do orçamento (via <Outlet context>). */
import { useOutletContext } from 'react-router-dom';
import type { OrcamentoLista } from '@/api/orcamento/orcamentos';
import type { DataBase, OrcamentoBdi } from '@/types/database';

export interface OrcamentoContexto {
  orcamento: OrcamentoLista;
  dataBase: DataBase | null;
  bdis: OrcamentoBdi[];
  bdiPadrao: OrcamentoBdi | null;
  /** pode editar a organização E o orçamento não está aprovado/arquivado */
  editavel: boolean;
  /** pode editar a organização (independe do status) */
  podeEditar: boolean;
  /** agenda recálculo via RPC (debounce 600 ms) */
  agendarRecalculo: () => void;
  recalculando: boolean;
}

export function useOrcamentoContexto(): OrcamentoContexto {
  return useOutletContext<OrcamentoContexto>();
}
