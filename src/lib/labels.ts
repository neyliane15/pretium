/**
 * Rótulos pt-BR dos enums (fonte única para Selects, Badges e relatórios).
 */
import type { BadgeVariant } from '@/components/ui/Badge';
import type {
  AppRole, CronogramaPeriodicidade, DisciplinaProjeto, HonorarioMetodo, HonorarioStatus, ImportacaoStatus,
  InsumoTipo, MedicaoStatus, ObraStatus, OrcamentoStatus, OrgRole, PessoaTipo, RegimeDesoneracao, UserStatus,
} from '@/types/database';

export const LABEL_APP_ROLE: Record<AppRole, string> = { admin: 'Administrador', user: 'Usuário' };
export const LABEL_USER_STATUS: Record<UserStatus, string> = { pending: 'Pendente', active: 'Ativo', blocked: 'Bloqueado' };
export const BADGE_USER_STATUS: Record<UserStatus, BadgeVariant> = { pending: 'warning', active: 'success', blocked: 'danger' };
export const LABEL_ORG_ROLE: Record<OrgRole, string> = { owner: 'Proprietário', editor: 'Editor', viewer: 'Leitor' };
export const LABEL_PESSOA_TIPO: Record<PessoaTipo, string> = { PF: 'Pessoa física', PJ: 'Pessoa jurídica' };
export const LABEL_REGIME: Record<RegimeDesoneracao, string> = { nao_desonerado: 'Não desonerado', desonerado: 'Desonerado' };
export const LABEL_OBRA_STATUS: Record<ObraStatus, string> = {
  planejamento: 'Planejamento', orcamento: 'Em orçamento', em_execucao: 'Em execução', paralisada: 'Paralisada', concluida: 'Concluída', cancelada: 'Cancelada',
};
export const BADGE_OBRA_STATUS: Record<ObraStatus, BadgeVariant> = {
  planejamento: 'neutral', orcamento: 'info', em_execucao: 'brand', paralisada: 'warning', concluida: 'success', cancelada: 'outline',
};
export const LABEL_ORCAMENTO_STATUS: Record<OrcamentoStatus, string> = { rascunho: 'Rascunho', em_revisao: 'Em revisão', aprovado: 'Aprovado', arquivado: 'Arquivado' };
export const BADGE_ORCAMENTO_STATUS: Record<OrcamentoStatus, BadgeVariant> = { rascunho: 'neutral', em_revisao: 'info', aprovado: 'success', arquivado: 'outline' };
export const LABEL_INSUMO_TIPO: Record<InsumoTipo, string> = {
  material: 'Material', mao_de_obra: 'Mão de obra', equipamento: 'Equipamento', servico: 'Serviço', taxa: 'Taxa', outro: 'Outro',
};
export const LABEL_MEDICAO_STATUS: Record<MedicaoStatus, string> = { aberta: 'Aberta', fechada: 'Fechada', aprovada: 'Aprovada' };
export const LABEL_IMPORTACAO_STATUS: Record<ImportacaoStatus, string> = {
  pendente: 'Pendente', processando: 'Processando', concluida: 'Concluída', erro: 'Erro', cancelada: 'Cancelada',
};
export const LABEL_PERIODICIDADE: Record<CronogramaPeriodicidade, string> = { semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal' };
export const LABEL_HONORARIO_METODO: Record<HonorarioMetodo, string> = {
  area: 'Por área (R$/m²)', percentual_obra: '% do custo da obra', horas: 'Por horas técnicas', fixo: 'Valor fixo',
};
export const LABEL_HONORARIO_STATUS: Record<HonorarioStatus, string> = { rascunho: 'Rascunho', enviado: 'Enviado', aprovado: 'Aprovado', recusado: 'Recusado' };
export const LABEL_DISCIPLINA: Record<DisciplinaProjeto, string> = {
  arquitetonico: 'Arquitetônico', interiores: 'Interiores', paisagismo: 'Paisagismo', estrutural: 'Estrutural', fundacoes: 'Fundações',
  hidrossanitario: 'Hidrossanitário', eletrico: 'Elétrico', spda: 'SPDA', cabeamento: 'Cabeamento estruturado', climatizacao: 'Climatização',
  incendio: 'Prevenção e combate a incêndio', gas: 'Gás', luminotecnico: 'Luminotécnico', orcamento: 'Orçamento', coordenacao: 'Coordenação/compatibilização',
  aprovacao_legal: 'Aprovação legal', outro: 'Outro',
};

/** Converte um Record de rótulos em opções de <Select>. */
export const opcoes = <K extends string>(r: Record<K, string>) => (Object.keys(r) as K[]).map((value) => ({ value, label: r[value] }));

export const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'] as const;
