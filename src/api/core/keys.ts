/** Chaves react-query do NÚCLEO. Dono: FRONTEND-1. */
export const qkCore = {
  minhasOrganizacoes: (userId: string | undefined) => ['core', 'minhas-organizacoes', userId] as const,
  organizacao: (id: string) => ['core', 'organizacao', id] as const,
  membros: (orgId: string) => ['core', 'membros', orgId] as const,
  convites: (orgId: string) => ['core', 'convites', orgId] as const,
  clientes: (orgId: string) => ['core', 'clientes', orgId] as const,
  cliente: (id: string) => ['core', 'cliente', id] as const,
  /** obras: tabela do B1, telas do F2 — a chave fica aqui para ambos usarem */
  obras: (orgId: string) => ['core', 'obras', orgId] as const,
  obra: (id: string) => ['core', 'obra', id] as const,
  configuracoes: () => ['core', 'configuracoes'] as const,
  // — aditivas (FRONTEND-1) —
  obrasDoCliente: (clienteId: string) => ['core', 'obras-cliente', clienteId] as const,
  meusConvites: (userId: string | undefined) => ['core', 'meus-convites', userId] as const,
  convite: (token: string) => ['core', 'convite', token] as const,
  arquivoUrl: (bucket: string, path: string | null | undefined) => ['core', 'arquivo-url', bucket, path ?? ''] as const,
  dataBaseRecente: () => ['core', 'data-base-recente'] as const,
  admin: {
    usuarios: (filtros: unknown) => ['admin', 'usuarios', filtros] as const,
    organizacoes: () => ['admin', 'organizacoes'] as const,
    auditoria: (filtros: unknown) => ['admin', 'auditoria', filtros] as const,
    estatisticas: () => ['admin', 'estatisticas'] as const,
    importacoes: () => ['admin', 'importacoes'] as const,
    // — aditivas —
    datasBase: () => ['admin', 'datas-base'] as const,
    configuracoes: () => ['admin', 'configuracoes'] as const,
    membrosOrg: (orgId: string) => ['admin', 'membros-org', orgId] as const,
  },
} as const;
