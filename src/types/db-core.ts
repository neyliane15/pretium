/**
 * Tipos do NÚCLEO (BACKEND-1): perfis, organizações, membros, convites, auditoria,
 * configurações, clientes e obras.
 * Dono: FRONTEND-1 (mantém em sincronia com as migrações 0001–0009).
 * Contrato: docs/ARQUITETURA.md §5.2.
 */
import type { InsertOf, IsoDate, IsoDateTime, Json, TableDef, Timestamps, Uuid } from './helpers';

// ─── Enums ────────────────────────────────────────────────────────────────
export type AppRole = 'admin' | 'user';
export type UserStatus = 'pending' | 'active' | 'blocked';
export type OrgRole = 'owner' | 'editor' | 'viewer';
export type OrgStatus = 'ativa' | 'bloqueada';
export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type PessoaTipo = 'PF' | 'PJ';
export type ObraStatus = 'planejamento' | 'orcamento' | 'em_execucao' | 'paralisada' | 'concluida' | 'cancelada';
export type RegimeDesoneracao = 'nao_desonerado' | 'desonerado';
export type Tema = 'light' | 'dark' | 'system';

interface Endereco {
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
}

// ─── Rows ─────────────────────────────────────────────────────────────────
export interface Profile extends Timestamps {
  id: Uuid;
  email: string;
  nome: string;
  telefone: string | null;
  crea_cau: string | null;
  avatar_path: string | null;
  papel_global: AppRole;
  status: UserStatus;
  motivo_bloqueio: string | null;
  organizacao_ativa_id: Uuid | null;
  tema: Tema;
  ultimo_acesso_em: IsoDateTime | null;
  aprovado_por: Uuid | null;
  aprovado_em: IsoDateTime | null;
}

export interface Configuracao {
  chave: string;
  valor: Json;
  descricao: string | null;
  publica: boolean;
  updated_by: Uuid | null;
  updated_at: IsoDateTime;
}

export interface Organizacao extends Timestamps, Endereco {
  id: Uuid;
  nome: string;
  razao_social: string | null;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  site: string | null;
  uf: string | null;
  logo_path: string | null;
  uf_padrao: string;
  regime_padrao: RegimeDesoneracao;
  responsavel_tecnico: string | null;
  crea_cau: string | null;
  status: OrgStatus;
  created_by: Uuid | null;
}

export interface OrganizacaoMembro {
  organizacao_id: Uuid;
  user_id: Uuid;
  papel: OrgRole;
  convidado_por: Uuid | null;
  created_at: IsoDateTime;
}

export interface Convite {
  id: Uuid;
  organizacao_id: Uuid;
  email: string;
  papel: OrgRole;
  token: Uuid;
  status: InviteStatus;
  convidado_por: Uuid | null;
  expira_em: IsoDateTime;
  aceito_por: Uuid | null;
  aceito_em: IsoDateTime | null;
  created_at: IsoDateTime;
}

export interface AuditoriaLog {
  id: number;
  created_at: IsoDateTime;
  user_id: Uuid | null;
  user_email: string | null;
  organizacao_id: Uuid | null;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  dados_antes: Json | null;
  dados_depois: Json | null;
  detalhes: Json | null;
}

export interface Cliente extends Timestamps, Endereco {
  id: Uuid;
  organizacao_id: Uuid;
  tipo: PessoaTipo;
  nome: string;
  nome_fantasia: string | null;
  documento: string | null;
  inscricao_estadual: string | null;
  email: string | null;
  telefone: string | null;
  contato_nome: string | null;
  uf: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_by: Uuid | null;
}

export interface Obra extends Timestamps, Endereco {
  id: Uuid;
  organizacao_id: Uuid;
  cliente_id: Uuid | null;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  tipo_obra: string | null;
  status: ObraStatus;
  uf: string;
  area_construida_m2: number | null;
  area_terreno_m2: number | null;
  data_inicio_prevista: IsoDate | null;
  data_fim_prevista: IsoDate | null;
  responsavel_tecnico: string | null;
  crea_cau: string | null;
  art_rrt: string | null;
  observacoes: string | null;
  created_by: Uuid | null;
}

// ─── Tabelas ──────────────────────────────────────────────────────────────
type Std = 'id' | 'created_at' | 'updated_at';

export interface CoreTables {
  profiles: TableDef<
    Profile,
    InsertOf<Profile, 'created_at' | 'updated_at' | 'nome' | 'telefone' | 'crea_cau' | 'avatar_path' | 'papel_global' | 'status' | 'motivo_bloqueio' | 'organizacao_ativa_id' | 'tema' | 'ultimo_acesso_em' | 'aprovado_por' | 'aprovado_em'>,
    [
      { foreignKeyName: 'profiles_organizacao_ativa_id_fkey'; columns: ['organizacao_ativa_id']; isOneToOne: false; referencedRelation: 'organizacoes'; referencedColumns: ['id'] },
    ]
  >;
  configuracoes: TableDef<Configuracao, InsertOf<Configuracao, 'descricao' | 'publica' | 'updated_by' | 'updated_at'>>;
  organizacoes: TableDef<
    Organizacao,
    InsertOf<Organizacao, Std | 'razao_social' | 'cnpj' | 'email' | 'telefone' | 'site' | 'cep' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'municipio' | 'uf' | 'logo_path' | 'uf_padrao' | 'regime_padrao' | 'responsavel_tecnico' | 'crea_cau' | 'status' | 'created_by'>
  >;
  organizacao_membros: TableDef<
    OrganizacaoMembro,
    InsertOf<OrganizacaoMembro, 'papel' | 'convidado_por' | 'created_at'>,
    [
      { foreignKeyName: 'organizacao_membros_organizacao_id_fkey'; columns: ['organizacao_id']; isOneToOne: false; referencedRelation: 'organizacoes'; referencedColumns: ['id'] },
      { foreignKeyName: 'organizacao_membros_user_id_profiles_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
    ]
  >;
  convites: TableDef<
    Convite,
    InsertOf<Convite, 'id' | 'papel' | 'token' | 'status' | 'convidado_por' | 'expira_em' | 'aceito_por' | 'aceito_em' | 'created_at'>,
    [
      { foreignKeyName: 'convites_organizacao_id_fkey'; columns: ['organizacao_id']; isOneToOne: false; referencedRelation: 'organizacoes'; referencedColumns: ['id'] },
    ]
  >;
  auditoria_logs: TableDef<AuditoriaLog, InsertOf<AuditoriaLog, 'id' | 'created_at' | 'user_id' | 'user_email' | 'organizacao_id' | 'entidade_id' | 'dados_antes' | 'dados_depois' | 'detalhes'>>;
  clientes: TableDef<
    Cliente,
    InsertOf<Cliente, Std | 'tipo' | 'nome_fantasia' | 'documento' | 'inscricao_estadual' | 'email' | 'telefone' | 'contato_nome' | 'cep' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'municipio' | 'uf' | 'observacoes' | 'ativo' | 'created_by'>,
    [
      { foreignKeyName: 'clientes_organizacao_id_fkey'; columns: ['organizacao_id']; isOneToOne: false; referencedRelation: 'organizacoes'; referencedColumns: ['id'] },
    ]
  >;
  obras: TableDef<
    Obra,
    InsertOf<Obra, Std | 'cliente_id' | 'codigo' | 'descricao' | 'tipo_obra' | 'status' | 'cep' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'municipio' | 'uf' | 'area_construida_m2' | 'area_terreno_m2' | 'data_inicio_prevista' | 'data_fim_prevista' | 'responsavel_tecnico' | 'crea_cau' | 'art_rrt' | 'observacoes' | 'created_by'>,
    [
      { foreignKeyName: 'obras_organizacao_id_fkey'; columns: ['organizacao_id']; isOneToOne: false; referencedRelation: 'organizacoes'; referencedColumns: ['id'] },
      { foreignKeyName: 'obras_cliente_id_fkey'; columns: ['cliente_id']; isOneToOne: false; referencedRelation: 'clientes'; referencedColumns: ['id'] },
    ]
  >;
}

// ─── RPC ──────────────────────────────────────────────────────────────────
export interface ConviteDetalhe {
  id: Uuid;
  organizacao_id: Uuid;
  organizacao_nome: string;
  email: string;
  papel: OrgRole;
  status: InviteStatus;
  expira_em: IsoDateTime;
}

export interface MembroListado {
  user_id: Uuid;
  nome: string;
  email: string;
  papel: OrgRole;
  avatar_path: string | null;
  created_at: IsoDateTime;
  ultimo_acesso_em: IsoDateTime | null;
}

export interface UsuarioAdmin {
  id: Uuid;
  email: string;
  nome: string;
  papel_global: AppRole;
  status: UserStatus;
  motivo_bloqueio: string | null;
  created_at: IsoDateTime;
  ultimo_acesso_em: IsoDateTime | null;
  organizacoes: { id: Uuid; nome: string; papel: OrgRole }[];
  total_count: number;
}

export interface AdminEstatisticas {
  usuarios_total: number;
  usuarios_pendentes: number;
  usuarios_bloqueados: number;
  organizacoes_total: number;
  obras_total: number;
  orcamentos_total: number;
  ultima_data_base: { id: Uuid; uf: string; ano: number; mes: number; regime: RegimeDesoneracao; is_demo: boolean } | null;
}

export interface CoreFunctions {
  registrar_acesso: { Args: Record<string, never>; Returns: undefined };
  criar_organizacao: { Args: { p_nome: string; p_cnpj?: string | null }; Returns: Uuid };
  definir_organizacao_ativa: { Args: { p_organizacao_id: Uuid }; Returns: undefined };
  convidar_membro: { Args: { p_organizacao_id: Uuid; p_email: string; p_papel: OrgRole }; Returns: Uuid };
  aceitar_convite: { Args: { p_token: Uuid }; Returns: Uuid };
  revogar_convite: { Args: { p_convite_id: Uuid }; Returns: undefined };
  meus_convites: { Args: Record<string, never>; Returns: Convite[] };
  obter_convite: { Args: { p_token: Uuid }; Returns: ConviteDetalhe[] };
  alterar_papel_membro: { Args: { p_organizacao_id: Uuid; p_user_id: Uuid; p_papel: OrgRole }; Returns: undefined };
  remover_membro: { Args: { p_organizacao_id: Uuid; p_user_id: Uuid }; Returns: undefined };
  listar_membros: { Args: { p_organizacao_id: Uuid }; Returns: MembroListado[] };
  admin_listar_usuarios: {
    Args: { p_busca?: string | null; p_status?: UserStatus | null; p_limite?: number; p_offset?: number };
    Returns: UsuarioAdmin[];
  };
  admin_definir_status_usuario: { Args: { p_user_id: Uuid; p_status: UserStatus; p_motivo?: string | null }; Returns: undefined };
  admin_definir_papel_global: { Args: { p_user_id: Uuid; p_papel: AppRole }; Returns: undefined };
  admin_definir_status_organizacao: { Args: { p_organizacao_id: Uuid; p_status: OrgStatus }; Returns: undefined };
  admin_adicionar_membro: { Args: { p_organizacao_id: Uuid; p_user_id: Uuid; p_papel: OrgRole }; Returns: undefined };
  admin_definir_configuracao: { Args: { p_chave: string; p_valor: Json }; Returns: undefined };
  admin_estatisticas: { Args: Record<string, never>; Returns: AdminEstatisticas };
  // Auxiliares de RLS (também chamáveis pelo front para checagens de UI)
  is_admin: { Args: Record<string, never>; Returns: boolean };
  is_active_user: { Args: Record<string, never>; Returns: boolean };
  org_papel: { Args: { p_organizacao_id: Uuid }; Returns: OrgRole | null };
  can_edit_org: { Args: { p_organizacao_id: Uuid }; Returns: boolean };
}

export interface CoreEnums {
  app_role: AppRole;
  user_status: UserStatus;
  org_role: OrgRole;
  org_status: OrgStatus;
  invite_status: InviteStatus;
  pessoa_tipo: PessoaTipo;
  obra_status: ObraStatus;
  regime_desoneracao: RegimeDesoneracao;
}
