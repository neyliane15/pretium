/** Presets de BDI a partir das faixas do TCU (calc.ts › FAIXAS_TCU). S+G é dividido igualmente. */
import { FAIXAS_TCU, TRIBUTOS_PADRAO, type BdiParametros, type TipoObraTcu } from '@/lib/calc';

export type Quartil = 'min' | 'medio' | 'max';
export const LABEL_QUARTIL: Record<Quartil, string> = { min: '1º quartil', medio: 'Médio', max: '3º quartil' };

export function presetTcu(tipo: TipoObraTcu, q: Quartil, extras?: Partial<Pick<BdiParametros, 'iss' | 'cprb'>>): BdiParametros {
  const f = FAIXAS_TCU[tipo];
  const sg = f.sg[q] / 2;
  return {
    ac: f.ac[q], s: sg, g: sg, r: f.r[q], df: f.df[q], l: f.l[q],
    pis: TRIBUTOS_PADRAO.pis, cofins: TRIBUTOS_PADRAO.cofins, iss: extras?.iss ?? 0, cprb: extras?.cprb ?? 0,
  };
}

export const BDI_ZERO: BdiParametros = { ac: 0, s: 0, r: 0, g: 0, df: 0, l: 0, pis: TRIBUTOS_PADRAO.pis, cofins: TRIBUTOS_PADRAO.cofins, iss: 0, cprb: 0 };
