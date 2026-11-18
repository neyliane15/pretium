/**
 * Caminhos de rota — use SEMPRE estes construtores em <Link>/navigate (nunca strings soltas).
 * As rotas são declaradas em src/App.tsx. Alterações: ver docs/DIVISAO_TRABALHO.md §6.
 */
export const rotas = {
  // públicas / autenticação (F1)
  login: '/login',
  cadastro: '/cadastro',
  recuperarSenha: '/recuperar-senha',
  redefinirSenha: '/redefinir-senha',
  aguardandoAprovacao: '/aguardando-aprovacao',
  bloqueado: '/bloqueado',
  convite: (token: string) => `/convite/${token}`,
  onboardingOrganizacao: '/onboarding/organizacao',

  // app (F2)
  dashboard: '/',
  obras: '/obras',
  obra: (obraId: string) => `/obras/${obraId}`,
  orcamentos: '/orcamentos',
  orcamento: (orcamentoId: string) => `/orcamentos/${orcamentoId}`,
  orcamentoSintetico: (id: string) => `/orcamentos/${id}/sintetico`,
  orcamentoDados: (id: string) => `/orcamentos/${id}/dados`,
  orcamentoBdi: (id: string) => `/orcamentos/${id}/bdi`,
  orcamentoCronograma: (id: string) => `/orcamentos/${id}/cronograma`,
  orcamentoCurvaAbc: (id: string) => `/orcamentos/${id}/curva-abc`,
  orcamentoMaoObra: (id: string) => `/orcamentos/${id}/mao-de-obra`,
  orcamentoMedicoes: (id: string) => `/orcamentos/${id}/medicoes`,
  orcamentoMedicao: (id: string, medicaoId: string) => `/orcamentos/${id}/medicoes/${medicaoId}`,
  orcamentoRelatorios: (id: string) => `/orcamentos/${id}/relatorios`,
  imprimirOrcamento: (id: string, relatorio: RelatorioOrcamento, medicaoId?: string) =>
    `/imprimir/orcamentos/${id}/${relatorio}${medicaoId ? `?medicao=${medicaoId}` : ''}`,
  sinapi: '/referencias/sinapi',
  composicao: (composicaoId: string) => `/referencias/composicoes/${composicaoId}`,
  composicoesProprias: '/referencias/composicoes-proprias',
  composicaoPropriaNova: '/referencias/composicoes-proprias/nova',
  composicaoPropria: (composicaoId: string) => `/referencias/composicoes-proprias/${composicaoId}`,
  insumosProprios: '/referencias/insumos-proprios',
  encargos: '/referencias/encargos',
  encargosDetalhe: (id: string) => `/referencias/encargos/${id}`,
  honorarios: '/honorarios',
  honorario: (honorarioId: string) => `/honorarios/${honorarioId}`,

  // cadastros / organização / perfil (F1)
  clientes: '/clientes',
  cliente: (clienteId: string) => `/clientes/${clienteId}`,
  organizacao: '/organizacao',
  organizacaoMembros: '/organizacao/membros',
  perfil: '/perfil',

  // admin (F1)
  admin: '/admin',
  adminUsuarios: '/admin/usuarios',
  adminOrganizacoes: '/admin/organizacoes',
  adminSinapi: '/admin/sinapi',
  adminSinapiImportar: '/admin/sinapi/importar',
  adminAuditoria: '/admin/auditoria',
  adminConfiguracoes: '/admin/configuracoes',
} as const;

export type RelatorioOrcamento =
  | 'sintetico'
  | 'analitico'
  | 'composicoes'
  | 'curva-abc-servicos'
  | 'curva-abc-insumos'
  | 'cronograma'
  | 'memoria'
  | 'medicao';
