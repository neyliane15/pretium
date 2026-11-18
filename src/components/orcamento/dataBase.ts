import { formatMesAno } from '@/lib/format';
import { LABEL_REGIME } from '@/lib/labels';
import type { RegimeDesoneracao } from '@/types/database';

export interface DataBaseResumo {
  uf: string;
  ano: number;
  mes: number;
  regime: RegimeDesoneracao;
  is_demo: boolean;
}

/** "SINAPI RJ 09/2026 · Não desonerado" */
export const rotuloDataBase = (d: DataBaseResumo, curto = false) =>
  `SINAPI ${d.uf} ${formatMesAno(d.ano, d.mes)}${curto ? '' : ` · ${LABEL_REGIME[d.regime]}`}`;

