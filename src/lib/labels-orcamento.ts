/**
 * Rótulos/variantes do domínio de orçamento que não estão em labels.ts (congelado).
 * Dono: FRONTEND-2.
 */
import type { BadgeVariant } from '@/components/ui';
import type { ClasseAbc, EncargoGrupo, FonteReferencia, HonorarioStatus, InsumoTipo, MedicaoStatus } from '@/types/database';

export const BADGE_MEDICAO_STATUS: Record<MedicaoStatus, BadgeVariant> = { aberta: 'info', fechada: 'warning', aprovada: 'success' };
export const BADGE_HONORARIO_STATUS: Record<HonorarioStatus, BadgeVariant> = { rascunho: 'neutral', enviado: 'info', aprovado: 'success', recusado: 'danger' };
export const LABEL_FONTE: Record<FonteReferencia, string> = { sinapi: 'SINAPI', propria: 'Própria' };
export const LABEL_ENCARGO_GRUPO: Record<EncargoGrupo, string> = {
  A: 'Grupo A — Encargos sociais básicos',
  B: 'Grupo B — Recebem incidência de A',
  C: 'Grupo C — Não recebem incidência de A',
  D: 'Grupo D — Reincidências',
};
/** Cores da curva ABC (DESIGN §1.3): A laranja, B amarelo, C concreto. */
export const COR_CLASSE_ABC: Record<ClasseAbc, string> = { A: 'rgb(var(--c-chart-1))', B: 'rgb(var(--c-chart-3))', C: 'rgb(var(--c-chart-6))' };
export const BG_CLASSE_ABC: Record<ClasseAbc, string> = { A: 'bg-chart-1', B: 'bg-chart-3', C: 'bg-chart-6' };
/** Siglas curtas de tipo de insumo para selos em tabelas densas. */
export const SIGLA_INSUMO_TIPO: Record<InsumoTipo, string> = {
  material: 'MATERIAL', mao_de_obra: 'MÃO DE OBRA', equipamento: 'EQUIP.', servico: 'SERVIÇO', taxa: 'TAXA', outro: 'OUTRO',
};
