/** Rótulos do domínio admin/SINAPI (labels-<dominio> conforme DIVISAO §3.1). Dono: FRONTEND-1. */
import type { BadgeVariant } from '@/components/ui';
import type { DataBaseStatus, ImportacaoStatus, ImportacaoTipo, OrgStatus } from '@/types/database';

export const LABEL_IMPORTACAO_TIPO: Record<ImportacaoTipo, string> = { insumos: 'Insumos', composicoes: 'Composições', analitico: 'Analítico' };
export const BADGE_IMPORTACAO: Record<ImportacaoStatus, BadgeVariant> = {
  pendente: 'neutral', processando: 'info', concluida: 'success', erro: 'danger', cancelada: 'outline',
};
export const LABEL_DATA_BASE_STATUS: Record<DataBaseStatus, string> = { rascunho: 'Rascunho', publicada: 'Publicada', arquivada: 'Arquivada' };
export const BADGE_DATA_BASE_STATUS: Record<DataBaseStatus, BadgeVariant> = { rascunho: 'warning', publicada: 'success', arquivada: 'outline' };
export const LABEL_ORG_STATUS: Record<OrgStatus, string> = { ativa: 'Ativa', bloqueada: 'Bloqueada' };
export const BADGE_ORG_STATUS: Record<OrgStatus, BadgeVariant> = { ativa: 'success', bloqueada: 'danger' };
