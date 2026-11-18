/**
 * Tipos de REFERÊNCIAS SINAPI e ORÇAMENTO (BACKEND-2): datas-base, insumos, composições,
 * preços, importações, orçamentos, EAP, itens, BDI, memória, cronograma, medições,
 * encargos, mão de obra e honorários.
 * Dono: FRONTEND-2 (mantém em sincronia com as migrações 0010–0029).
 * Contrato: docs/ARQUITETURA.md §5.3, §5.4 e §7.2.
 */
import type { InsertOf, IsoDate, IsoDateTime, Json, TableDef, Timestamps, Uuid } from './helpers';
import type { ObraStatus, RegimeDesoneracao } from './db-core';

// ─── Enums ────────────────────────────────────────────────────────────────
export type FonteReferencia = 'sinapi' | 'propria';
export type InsumoTipo = 'material' | 'mao_de_obra' | 'equipamento' | 'servico' | 'taxa' | 'outro';
export type DataBaseStatus = 'rascunho' | 'publicada' | 'arquivada';
export type ImportacaoTipo = 'insumos' | 'composicoes' | 'analitico';
export type ImportacaoStatus = 'pendente' | 'processando' | 'concluida' | 'erro' | 'cancelada';
export type OrcamentoStatus = 'rascunho' | 'em_revisao' | 'aprovado' | 'arquivado';
export type ItemReferenciaTipo = 'composicao' | 'insumo' | 'livre';
export type ComposicaoItemTipo = 'insumo' | 'composicao';
export type CronogramaPeriodicidade = 'semanal' | 'quinzenal' | 'mensal';
export type MedicaoStatus = 'aberta' | 'fechada' | 'aprovada';
export type EncargoGrupo = 'A' | 'B' | 'C' | 'D';
export type HonorarioMetodo = 'area' | 'percentual_obra' | 'horas' | 'fixo';
export type HonorarioStatus = 'rascunho' | 'enviado' | 'aprovado' | 'recusado';
export type DisciplinaProjeto =
  | 'arquitetonico' | 'interiores' | 'paisagismo' | 'estrutural' | 'fundacoes'
  | 'hidrossanitario' | 'eletrico' | 'spda' | 'cabeamento' | 'climatizacao'
  | 'incendio' | 'gas' | 'luminotecnico' | 'orcamento' | 'coordenacao'
  | 'aprovacao_legal' | 'outro';

// ─── Rows: referências ────────────────────────────────────────────────────
export interface DataBase extends Timestamps {
  id: Uuid;
  uf: string;
  ano: number;
  mes: number;
  regime: RegimeDesoneracao;
  status: DataBaseStatus;
  is_demo: boolean;
  descricao: string | null;
  fonte_arquivo: string | null;
  publicada_em: IsoDateTime | null;
  created_by: Uuid | null;
}

export interface Insumo extends Timestamps {
  id: Uuid;
  organizacao_id: Uuid | null;
  fonte: FonteReferencia;
  codigo: string;
  descricao: string;
  unidade: string;
  tipo: InsumoTipo;
  classificacao: string | null;
  preco_proprio: number | null;
  preco_proprio_data: IsoDate | null;
  is_demo: boolean;
  ativo: boolean;
  /** tsvector gerado — não enviar em insert/update */
  busca?: unknown;
  created_by: Uuid | null;
}

export interface InsumoPreco {
  data_base_id: Uuid;
  insumo_id: Uuid;
  preco: number;
  origem_preco: string | null;
  importacao_id: Uuid | null;
}

export interface Composicao extends Timestamps {
  id: Uuid;
  organizacao_id: Uuid | null;
  fonte: FonteReferencia;
  codigo: string;
  descricao: string;
  unidade: string;
  grupo: string | null;
  observacao: string | null;
  is_demo: boolean;
  ativo: boolean;
  busca?: unknown;
  created_by: Uuid | null;
}

export interface ComposicaoItem {
  id: Uuid;
  composicao_id: Uuid;
  organizacao_id: Uuid | null;
  tipo_item: ComposicaoItemTipo;
  insumo_id: Uuid | null;
  subcomposicao_id: Uuid | null;
  coeficiente: number;
  ordem: number;
  importacao_id: Uuid | null;
}

export interface ComposicaoPreco {
  data_base_id: Uuid;
  composicao_id: Uuid;
  custo: number;
  custo_mao_obra: number | null;
  custo_material: number | null;
  custo_equipamento: number | null;
  custo_servicos: number | null;
  perc_mao_obra: number | null;
  importacao_id: Uuid | null;
}

export interface ImportacaoErro {
  linha: number | null;
  codigo: string | null;
  mensagem: string;
}

/** Busca automática da SINAPI na Caixa (0032). Escrita só pela função de servidor (service_role). */
export interface SinapiSincronizacao {
  id: Uuid;
  ano: number;
  mes: number;
  ufs: string[];
  origem: 'usuario' | 'automatica' | 'admin';
  status: 'processando' | 'concluida' | 'erro' | 'indisponivel';
  mensagem: string | null;
  arquivo_url: string | null;
  datas_base: Uuid[];
  solicitado_por: Uuid | null;
  iniciado_em: string;
  finalizado_em: string | null;
}

export interface SinapiImportacao {
  id: Uuid;
  data_base_id: Uuid;
  tipo: ImportacaoTipo;
  status: ImportacaoStatus;
  arquivo_nome: string | null;
  arquivo_path: string | null;
  total_linhas: number;
  linhas_ok: number;
  linhas_erro: number;
  erros: ImportacaoErro[];
  iniciado_em: IsoDateTime;
  finalizado_em: IsoDateTime | null;
  created_by: Uuid | null;
}

// ─── Rows: orçamento ──────────────────────────────────────────────────────
export interface Orcamento extends Timestamps {
  id: Uuid;
  organizacao_id: Uuid;
  obra_id: Uuid;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  versao: number;
  orcamento_origem_id: Uuid | null;
  status: OrcamentoStatus;
  data_base_id: Uuid;
  encargos_sociais_id: Uuid | null;
  data_orcamento: IsoDate;
  validade_dias: number;
  total_sem_bdi: number;
  total_bdi: number;
  total: number;
  itens_sem_preco: number;
  recalculado_em: IsoDateTime | null;
  observacoes: string | null;
  created_by: Uuid | null;
}

export interface OrcamentoBdi extends Timestamps {
  id: Uuid;
  organizacao_id: Uuid;
  orcamento_id: Uuid;
  nome: string;
  is_padrao: boolean;
  ac: number;
  s: number;
  r: number;
  g: number;
  df: number;
  l: number;
  pis: number;
  cofins: number;
  iss: number;
  cprb: number;
  /** gerada: pis + cofins + iss + cprb */
  readonly i_total: number;
  /** gerada: fórmula TCU, % com 2 casas */
  readonly bdi: number;
}

export interface OrcamentoEtapa extends Timestamps {
  id: Uuid;
  organizacao_id: Uuid;
  orcamento_id: Uuid;
  parent_id: Uuid | null;
  ordem: number;
  codigo: string;
  nome: string;
  total_sem_bdi: number;
  total: number;
}

export interface OrcamentoItem extends Timestamps {
  id: Uuid;
  organizacao_id: Uuid;
  orcamento_id: Uuid;
  etapa_id: Uuid;
  ordem: number;
  codigo: string;
  referencia_tipo: ItemReferenciaTipo;
  composicao_id: Uuid | null;
  insumo_id: Uuid | null;
  fonte: string;
  referencia_codigo: string | null;
  descricao: string;
  unidade: string;
  quantidade: number;
  usa_memoria: boolean;
  custo_unitario: number;
  custo_manual: boolean;
  bdi_id: Uuid | null;
  bdi_percentual: number;
  /** calculado por trigger */
  preco_unitario: number;
  /** calculado por trigger */
  total_sem_bdi: number;
  /** calculado por trigger */
  total: number;
  sem_preco: boolean;
  observacao: string | null;
}

export interface OrcamentoInsumoPreco {
  orcamento_id: Uuid;
  insumo_id: Uuid;
  organizacao_id: Uuid;
  preco: number;
  fonte: string | null;
  updated_at: IsoDateTime;
}

export interface OrcamentoItemMemoria extends Timestamps {
  id: Uuid;
  organizacao_id: Uuid;
  item_id: Uuid;
  ordem: number;
  descricao: string;
  expressao: string;
  resultado: number;
}

export interface Cronograma extends Timestamps {
  id: Uuid;
  organizacao_id: Uuid;
  orcamento_id: Uuid;
  data_inicio: IsoDate;
  periodicidade: CronogramaPeriodicidade;
  num_periodos: number;
}

export interface CronogramaDistribuicao {
  id: Uuid;
  organizacao_id: Uuid;
  cronograma_id: Uuid;
  etapa_id: Uuid;
  periodo: number;
  percentual: number;
}

export interface Medicao extends Timestamps {
  id: Uuid;
  organizacao_id: Uuid;
  orcamento_id: Uuid;
  numero: number;
  periodo_inicio: IsoDate;
  periodo_fim: IsoDate;
  data_medicao: IsoDate;
  status: MedicaoStatus;
  observacoes: string | null;
  total: number;
  created_by: Uuid | null;
}

export interface MedicaoItem {
  id: Uuid;
  organizacao_id: Uuid;
  medicao_id: Uuid;
  item_id: Uuid;
  quantidade: number;
  valor: number;
  observacao: string | null;
}

export interface EncargosSociais extends Timestamps {
  id: Uuid;
  organizacao_id: Uuid | null;
  nome: string;
  uf: string | null;
  regime: RegimeDesoneracao;
  vigencia: IsoDate | null;
  is_demo: boolean;
  total_horista: number;
  total_mensalista: number;
  created_by: Uuid | null;
}

export interface EncargosSociaisItem {
  id: Uuid;
  encargos_sociais_id: Uuid;
  organizacao_id: Uuid | null;
  grupo: EncargoGrupo;
  codigo: string;
  descricao: string;
  horista: number;
  mensalista: number;
  ordem: number;
}

export interface OrcamentoEquipe extends Timestamps {
  id: Uuid;
  organizacao_id: Uuid;
  orcamento_id: Uuid;
  nome: string;
  descricao: string | null;
  ordem: number;
}

export interface OrcamentoEquipeMembro {
  id: Uuid;
  organizacao_id: Uuid;
  equipe_id: Uuid;
  funcao: string;
  insumo_id: Uuid | null;
  salario_hora: number | null;
  aplicar_encargos: boolean;
  quantidade: number;
  horas_dia: number;
  dias: number;
  ordem: number;
}

export interface Honorario extends Timestamps {
  id: Uuid;
  organizacao_id: Uuid;
  obra_id: Uuid;
  orcamento_id: Uuid | null;
  nome: string;
  status: HonorarioStatus;
  area_m2: number | null;
  impostos_percentual: number;
  desconto_percentual: number;
  subtotal: number;
  total: number;
  validade_dias: number;
  condicoes_pagamento: string | null;
  observacoes: string | null;
  created_by: Uuid | null;
}

export interface HonorarioDisciplina {
  id: Uuid;
  organizacao_id: Uuid;
  honorario_id: Uuid;
  disciplina: DisciplinaProjeto;
  descricao: string | null;
  metodo: HonorarioMetodo;
  area_m2: number | null;
  valor_m2: number | null;
  valor_obra: number | null;
  percentual: number | null;
  horas: number | null;
  valor_hora: number | null;
  valor_fixo: number | null;
  valor: number;
  prazo_dias: number | null;
  ordem: number;
}

// ─── Tabelas ──────────────────────────────────────────────────────────────
type Std = 'id' | 'created_at' | 'updated_at';
type Fk<Name extends string, Col extends string, Ref extends string> = {
  foreignKeyName: Name;
  columns: [Col];
  isOneToOne: false;
  referencedRelation: Ref;
  referencedColumns: ['id'];
};
/** `organizacao_id` é preenchido por trigger nas tabelas-filhas: opcional no insert. */
type OrgAuto = 'organizacao_id';

export interface OrcamentoTables {
  datas_base: TableDef<DataBase, InsertOf<DataBase, Std | 'status' | 'is_demo' | 'descricao' | 'fonte_arquivo' | 'publicada_em' | 'created_by'>>;
  insumos: TableDef<
    Insumo,
    InsertOf<Omit<Insumo, 'busca'>, Std | 'organizacao_id' | 'tipo' | 'classificacao' | 'preco_proprio' | 'preco_proprio_data' | 'is_demo' | 'ativo' | 'created_by'>,
    [Fk<'insumos_organizacao_id_fkey', 'organizacao_id', 'organizacoes'>]
  >;
  insumo_precos: TableDef<
    InsumoPreco,
    InsertOf<InsumoPreco, 'origem_preco' | 'importacao_id'>,
    [
      { foreignKeyName: 'insumo_precos_insumo_id_fkey'; columns: ['insumo_id']; isOneToOne: false; referencedRelation: 'insumos'; referencedColumns: ['id'] },
      { foreignKeyName: 'insumo_precos_data_base_id_fkey'; columns: ['data_base_id']; isOneToOne: false; referencedRelation: 'datas_base'; referencedColumns: ['id'] },
    ]
  >;
  composicoes: TableDef<
    Composicao,
    InsertOf<Omit<Composicao, 'busca'>, Std | 'organizacao_id' | 'grupo' | 'observacao' | 'is_demo' | 'ativo' | 'created_by'>,
    [Fk<'composicoes_organizacao_id_fkey', 'organizacao_id', 'organizacoes'>]
  >;
  composicao_itens: TableDef<
    ComposicaoItem,
    InsertOf<ComposicaoItem, 'id' | OrgAuto | 'insumo_id' | 'subcomposicao_id' | 'ordem' | 'importacao_id'>,
    [
      Fk<'composicao_itens_composicao_id_fkey', 'composicao_id', 'composicoes'>,
      Fk<'composicao_itens_insumo_id_fkey', 'insumo_id', 'insumos'>,
      Fk<'composicao_itens_subcomposicao_id_fkey', 'subcomposicao_id', 'composicoes'>,
    ]
  >;
  composicao_precos: TableDef<
    ComposicaoPreco,
    InsertOf<ComposicaoPreco, 'custo_mao_obra' | 'custo_material' | 'custo_equipamento' | 'custo_servicos' | 'perc_mao_obra' | 'importacao_id'>,
    [
      { foreignKeyName: 'composicao_precos_composicao_id_fkey'; columns: ['composicao_id']; isOneToOne: false; referencedRelation: 'composicoes'; referencedColumns: ['id'] },
      { foreignKeyName: 'composicao_precos_data_base_id_fkey'; columns: ['data_base_id']; isOneToOne: false; referencedRelation: 'datas_base'; referencedColumns: ['id'] },
    ]
  >;
  sinapi_importacoes: TableDef<
    SinapiImportacao,
    InsertOf<SinapiImportacao, 'id' | 'status' | 'arquivo_nome' | 'arquivo_path' | 'total_linhas' | 'linhas_ok' | 'linhas_erro' | 'erros' | 'iniciado_em' | 'finalizado_em' | 'created_by'>,
    [Fk<'sinapi_importacoes_data_base_id_fkey', 'data_base_id', 'datas_base'>]
  >;
  sinapi_sincronizacoes: TableDef<
    SinapiSincronizacao,
    InsertOf<SinapiSincronizacao, 'id' | 'origem' | 'status' | 'mensagem' | 'arquivo_url' | 'datas_base' | 'solicitado_por' | 'iniciado_em' | 'finalizado_em'>,
    []
  >;
  orcamentos: TableDef<
    Orcamento,
    InsertOf<Orcamento, Std | 'codigo' | 'descricao' | 'versao' | 'orcamento_origem_id' | 'status' | 'encargos_sociais_id' | 'data_orcamento' | 'validade_dias' | 'total_sem_bdi' | 'total_bdi' | 'total' | 'itens_sem_preco' | 'recalculado_em' | 'observacoes' | 'created_by'>,
    [
      Fk<'orcamentos_obra_id_fkey', 'obra_id', 'obras'>,
      Fk<'orcamentos_data_base_id_fkey', 'data_base_id', 'datas_base'>,
      Fk<'orcamentos_encargos_sociais_id_fkey', 'encargos_sociais_id', 'encargos_sociais'>,
      Fk<'orcamentos_organizacao_id_fkey', 'organizacao_id', 'organizacoes'>,
    ]
  >;
  orcamento_bdis: TableDef<
    OrcamentoBdi,
    InsertOf<Omit<OrcamentoBdi, 'i_total' | 'bdi'>, Std | OrgAuto | 'nome' | 'is_padrao' | 'ac' | 's' | 'r' | 'g' | 'df' | 'l' | 'pis' | 'cofins' | 'iss' | 'cprb'>,
    [Fk<'orcamento_bdis_orcamento_id_fkey', 'orcamento_id', 'orcamentos'>]
  >;
  orcamento_etapas: TableDef<
    OrcamentoEtapa,
    InsertOf<OrcamentoEtapa, Std | OrgAuto | 'parent_id' | 'ordem' | 'codigo' | 'total_sem_bdi' | 'total'>,
    [
      Fk<'orcamento_etapas_orcamento_id_fkey', 'orcamento_id', 'orcamentos'>,
      Fk<'orcamento_etapas_parent_id_fkey', 'parent_id', 'orcamento_etapas'>,
    ]
  >;
  orcamento_itens: TableDef<
    OrcamentoItem,
    InsertOf<OrcamentoItem, Std | OrgAuto | 'ordem' | 'codigo' | 'composicao_id' | 'insumo_id' | 'fonte' | 'referencia_codigo' | 'quantidade' | 'usa_memoria' | 'custo_unitario' | 'custo_manual' | 'bdi_id' | 'bdi_percentual' | 'preco_unitario' | 'total_sem_bdi' | 'total' | 'sem_preco' | 'observacao'>,
    [
      Fk<'orcamento_itens_orcamento_id_fkey', 'orcamento_id', 'orcamentos'>,
      Fk<'orcamento_itens_etapa_id_fkey', 'etapa_id', 'orcamento_etapas'>,
      Fk<'orcamento_itens_composicao_id_fkey', 'composicao_id', 'composicoes'>,
      Fk<'orcamento_itens_insumo_id_fkey', 'insumo_id', 'insumos'>,
      Fk<'orcamento_itens_bdi_id_fkey', 'bdi_id', 'orcamento_bdis'>,
    ]
  >;
  orcamento_insumo_precos: TableDef<
    OrcamentoInsumoPreco,
    InsertOf<OrcamentoInsumoPreco, OrgAuto | 'fonte' | 'updated_at'>,
    [
      { foreignKeyName: 'orcamento_insumo_precos_insumo_id_fkey'; columns: ['insumo_id']; isOneToOne: false; referencedRelation: 'insumos'; referencedColumns: ['id'] },
      { foreignKeyName: 'orcamento_insumo_precos_orcamento_id_fkey'; columns: ['orcamento_id']; isOneToOne: false; referencedRelation: 'orcamentos'; referencedColumns: ['id'] },
    ]
  >;
  orcamento_item_memorias: TableDef<
    OrcamentoItemMemoria,
    InsertOf<OrcamentoItemMemoria, Std | OrgAuto | 'ordem' | 'descricao' | 'resultado'>,
    [Fk<'orcamento_item_memorias_item_id_fkey', 'item_id', 'orcamento_itens'>]
  >;
  cronogramas: TableDef<
    Cronograma,
    InsertOf<Cronograma, Std | OrgAuto | 'periodicidade'>,
    [{ foreignKeyName: 'cronogramas_orcamento_id_fkey'; columns: ['orcamento_id']; isOneToOne: true; referencedRelation: 'orcamentos'; referencedColumns: ['id'] }]
  >;
  cronograma_distribuicoes: TableDef<
    CronogramaDistribuicao,
    InsertOf<CronogramaDistribuicao, 'id' | OrgAuto>,
    [
      Fk<'cronograma_distribuicoes_cronograma_id_fkey', 'cronograma_id', 'cronogramas'>,
      Fk<'cronograma_distribuicoes_etapa_id_fkey', 'etapa_id', 'orcamento_etapas'>,
    ]
  >;
  medicoes: TableDef<
    Medicao,
    InsertOf<Medicao, Std | OrgAuto | 'data_medicao' | 'status' | 'observacoes' | 'total' | 'created_by'>,
    [Fk<'medicoes_orcamento_id_fkey', 'orcamento_id', 'orcamentos'>]
  >;
  medicao_itens: TableDef<
    MedicaoItem,
    InsertOf<MedicaoItem, 'id' | OrgAuto | 'quantidade' | 'valor' | 'observacao'>,
    [
      Fk<'medicao_itens_medicao_id_fkey', 'medicao_id', 'medicoes'>,
      Fk<'medicao_itens_item_id_fkey', 'item_id', 'orcamento_itens'>,
    ]
  >;
  encargos_sociais: TableDef<
    EncargosSociais,
    InsertOf<EncargosSociais, Std | 'organizacao_id' | 'uf' | 'vigencia' | 'is_demo' | 'total_horista' | 'total_mensalista' | 'created_by'>,
    [Fk<'encargos_sociais_organizacao_id_fkey', 'organizacao_id', 'organizacoes'>]
  >;
  encargos_sociais_itens: TableDef<
    EncargosSociaisItem,
    InsertOf<EncargosSociaisItem, 'id' | OrgAuto | 'horista' | 'mensalista' | 'ordem'>,
    [Fk<'encargos_sociais_itens_encargos_sociais_id_fkey', 'encargos_sociais_id', 'encargos_sociais'>]
  >;
  orcamento_equipes: TableDef<
    OrcamentoEquipe,
    InsertOf<OrcamentoEquipe, Std | OrgAuto | 'descricao' | 'ordem'>,
    [Fk<'orcamento_equipes_orcamento_id_fkey', 'orcamento_id', 'orcamentos'>]
  >;
  orcamento_equipe_membros: TableDef<
    OrcamentoEquipeMembro,
    InsertOf<OrcamentoEquipeMembro, 'id' | OrgAuto | 'insumo_id' | 'salario_hora' | 'aplicar_encargos' | 'quantidade' | 'horas_dia' | 'dias' | 'ordem'>,
    [
      Fk<'orcamento_equipe_membros_equipe_id_fkey', 'equipe_id', 'orcamento_equipes'>,
      Fk<'orcamento_equipe_membros_insumo_id_fkey', 'insumo_id', 'insumos'>,
    ]
  >;
  honorarios: TableDef<
    Honorario,
    InsertOf<Honorario, Std | 'orcamento_id' | 'status' | 'area_m2' | 'impostos_percentual' | 'desconto_percentual' | 'subtotal' | 'total' | 'validade_dias' | 'condicoes_pagamento' | 'observacoes' | 'created_by'>,
    [
      Fk<'honorarios_obra_id_fkey', 'obra_id', 'obras'>,
      Fk<'honorarios_orcamento_id_fkey', 'orcamento_id', 'orcamentos'>,
    ]
  >;
  honorario_disciplinas: TableDef<
    HonorarioDisciplina,
    InsertOf<HonorarioDisciplina, 'id' | OrgAuto | 'descricao' | 'area_m2' | 'valor_m2' | 'valor_obra' | 'percentual' | 'horas' | 'valor_hora' | 'valor_fixo' | 'valor' | 'prazo_dias' | 'ordem'>,
    [Fk<'honorario_disciplinas_honorario_id_fkey', 'honorario_id', 'honorarios'>]
  >;
}

// ─── Retornos de RPC ──────────────────────────────────────────────────────
export interface ResumoEtapa {
  etapa_id: Uuid;
  parent_id: Uuid | null;
  codigo: string;
  nome: string;
  nivel: number;
  ordem_path: string;
  total_sem_bdi: number;
  total: number;
  percentual: number;
}

export interface ComposicaoAnaliticaLinha {
  item_id: Uuid;
  tipo_item: ComposicaoItemTipo;
  referencia_id: Uuid;
  fonte: FonteReferencia;
  codigo: string;
  descricao: string;
  unidade: string;
  insumo_tipo: InsumoTipo | null;
  coeficiente: number;
  preco_unitario: number | null;
  custo_parcial: number | null;
  sem_preco: boolean;
}

export interface ReferenciaBusca {
  tipo: 'insumo' | 'composicao';
  id: Uuid;
  fonte: FonteReferencia;
  codigo: string;
  descricao: string;
  unidade: string;
  insumo_tipo: InsumoTipo | null;
  preco: number | null;
  is_demo: boolean;
  rank: number;
}

export type ClasseAbc = 'A' | 'B' | 'C';

export interface CurvaAbcServico {
  posicao: number;
  item_id: Uuid;
  codigo: string;
  referencia_codigo: string | null;
  descricao: string;
  unidade: string;
  quantidade: number;
  preco_unitario: number;
  total: number;
  percentual: number;
  percentual_acumulado: number;
  classe: ClasseAbc;
}

export interface CurvaAbcInsumo {
  posicao: number;
  insumo_id: Uuid | null;
  fonte: FonteReferencia | null;
  codigo: string;
  descricao: string;
  unidade: string;
  insumo_tipo: InsumoTipo | null;
  quantidade: number;
  preco_unitario: number;
  total: number;
  percentual: number;
  percentual_acumulado: number;
  classe: ClasseAbc;
}

export interface CronogramaLinha {
  etapa_id: Uuid;
  etapa_codigo: string;
  etapa_nome: string;
  etapa_total: number;
  periodo: number;
  data_inicio: IsoDate;
  data_fim: IsoDate;
  percentual: number;
  valor: number;
  percentual_acumulado: number;
  valor_acumulado: number;
}

export interface MedicaoResumoLinha {
  item_id: Uuid;
  etapa_id: Uuid;
  codigo: string;
  descricao: string;
  unidade: string;
  preco_unitario: number;
  quantidade_orcada: number;
  valor_orcado: number;
  quantidade_anterior: number;
  quantidade_atual: number;
  quantidade_acumulada: number;
  quantidade_saldo: number;
  valor_anterior: number;
  valor_atual: number;
  valor_acumulado: number;
  valor_saldo: number;
  percentual_acumulado: number;
}

export interface MaoObraResumoLinha {
  equipe_id: Uuid;
  equipe_nome: string;
  membro_id: Uuid;
  funcao: string;
  quantidade: number;
  horas_dia: number;
  dias: number;
  horas_totais: number;
  custo_hora: number;
  custo_total: number;
}

export interface MaoObraHorasLinha {
  insumo_id: Uuid;
  codigo: string;
  descricao: string;
  unidade: string;
  horas: number;
  custo: number;
}

export interface DashboardResumo {
  obras_por_status: Partial<Record<ObraStatus, number>>;
  orcamentos_total: number;
  valor_orcado_total: number;
  valor_aprovado_total: number;
  medido_total: number;
  ultimos_orcamentos: { id: Uuid; nome: string; obra_nome: string; total: number; status: OrcamentoStatus; updated_at: IsoDateTime }[];
  data_base_mais_recente: { id: Uuid; uf: string; ano: number; mes: number; regime: RegimeDesoneracao; is_demo: boolean } | null;
}

/** Parâmetros de BDI aceitos por `fn_orcamento_criar.p_bdi_padrao`. */
export interface BdiParametros {
  ac: number; s: number; r: number; g: number; df: number; l: number;
  pis: number; cofins: number; iss: number; cprb: number;
}

export interface OrcamentoFunctions {
  fn_orcamento_criar: { Args: { p_obra_id: Uuid; p_nome: string; p_data_base_id: Uuid; p_bdi_padrao?: Json | null }; Returns: Uuid };
  fn_orcamento_recalcular: { Args: { p_orcamento_id: Uuid }; Returns: Orcamento };
  fn_orcamento_renumerar: { Args: { p_orcamento_id: Uuid }; Returns: undefined };
  fn_orcamento_duplicar: { Args: { p_orcamento_id: Uuid; p_nome?: string | null; p_nova_versao?: boolean }; Returns: Uuid };
  fn_orcamento_trocar_data_base: { Args: { p_orcamento_id: Uuid; p_data_base_id: Uuid }; Returns: Orcamento };
  fn_orcamento_mover: { Args: { p_tipo: 'etapa' | 'item'; p_id: Uuid; p_novo_pai_id: Uuid | null; p_nova_ordem: number }; Returns: undefined };
  fn_orcamento_adicionar_item: {
    Args: {
      p_etapa_id: Uuid;
      p_referencia_tipo: ItemReferenciaTipo;
      p_referencia_id?: Uuid | null;
      p_quantidade?: number;
      p_descricao?: string | null;
      p_unidade?: string | null;
      p_custo_unitario?: number | null;
    };
    Returns: OrcamentoItem;
  };
  fn_orcamento_resumo: { Args: { p_orcamento_id: Uuid }; Returns: ResumoEtapa[] };
  fn_custo_insumo: { Args: { p_insumo_id: Uuid; p_data_base_id: Uuid; p_orcamento_id?: Uuid | null }; Returns: number | null };
  fn_custo_composicao: { Args: { p_composicao_id: Uuid; p_data_base_id: Uuid; p_orcamento_id?: Uuid | null }; Returns: number | null };
  fn_composicao_analitica: { Args: { p_composicao_id: Uuid; p_data_base_id: Uuid; p_orcamento_id?: Uuid | null }; Returns: ComposicaoAnaliticaLinha[] };
  fn_buscar_referencias: {
    Args: { p_termo: string; p_data_base_id: Uuid; p_organizacao_id?: Uuid | null; p_tipo?: 'insumo' | 'composicao' | null; p_limite?: number };
    Returns: ReferenciaBusca[];
  };
  fn_curva_abc_servicos: { Args: { p_orcamento_id: Uuid }; Returns: CurvaAbcServico[] };
  fn_curva_abc_insumos: { Args: { p_orcamento_id: Uuid }; Returns: CurvaAbcInsumo[] };
  fn_cronograma_fisico_financeiro: { Args: { p_orcamento_id: Uuid }; Returns: CronogramaLinha[] };
  fn_cronograma_salvar: {
    Args: {
      p_orcamento_id: Uuid;
      p_data_inicio: IsoDate;
      p_periodicidade: CronogramaPeriodicidade;
      p_num_periodos: number;
      p_distribuicoes: Json;
    };
    Returns: Uuid;
  };
  fn_medicao_criar: { Args: { p_orcamento_id: Uuid; p_periodo_inicio: IsoDate; p_periodo_fim: IsoDate }; Returns: Uuid };
  fn_medicao_resumo: { Args: { p_medicao_id: Uuid }; Returns: MedicaoResumoLinha[] };
  fn_mao_obra_resumo: { Args: { p_orcamento_id: Uuid }; Returns: MaoObraResumoLinha[] };
  fn_mao_obra_horas_orcamento: { Args: { p_orcamento_id: Uuid }; Returns: MaoObraHorasLinha[] };
  fn_honorario_recalcular: { Args: { p_honorario_id: Uuid }; Returns: Honorario };
  fn_dashboard_resumo: { Args: { p_organizacao_id: Uuid }; Returns: DashboardResumo };
  fn_encargos_duplicar: { Args: { p_encargos_id: Uuid; p_organizacao_id: Uuid; p_nome: string }; Returns: Uuid };
  /** 0030 (TESTES): cria/atualiza composição própria + substitui itens, atômico. */
  fn_composicao_propria_salvar: { Args: { p_id: Uuid | null; p_cabecalho: Json; p_itens?: Json }; Returns: Uuid };
  // Importação SINAPI (admin)
  fn_sinapi_iniciar_importacao: {
    Args: { p_uf: string; p_ano: number; p_mes: number; p_regime: RegimeDesoneracao; p_tipo: ImportacaoTipo; p_arquivo_nome?: string | null };
    Returns: Uuid;
  };
  fn_sinapi_importar_insumos: { Args: { p_importacao_id: Uuid; p_linhas: Json }; Returns: number };
  fn_sinapi_importar_composicoes: { Args: { p_importacao_id: Uuid; p_linhas: Json }; Returns: number };
  fn_sinapi_importar_composicao_itens: { Args: { p_importacao_id: Uuid; p_linhas: Json }; Returns: number };
  fn_sinapi_finalizar_importacao: { Args: { p_importacao_id: Uuid; p_publicar?: boolean }; Returns: SinapiImportacao };
  fn_sinapi_cancelar_importacao: { Args: { p_importacao_id: Uuid }; Returns: undefined };
  fn_sinapi_ufs_em_uso: { Args: Record<string, never>; Returns: string[] };
  fn_sinapi_disponibilidade: { Args: { p_uf: string }; Returns: { ano: number; mes: number; regime: RegimeDesoneracao; status: DataBaseStatus; data_base_id: Uuid }[] };
  fn_sinapi_publicar_data_base: { Args: { p_data_base_id: Uuid; p_status: DataBaseStatus }; Returns: DataBase };
}

export interface OrcamentoEnums {
  fonte_referencia: FonteReferencia;
  insumo_tipo: InsumoTipo;
  data_base_status: DataBaseStatus;
  importacao_tipo: ImportacaoTipo;
  importacao_status: ImportacaoStatus;
  orcamento_status: OrcamentoStatus;
  item_referencia_tipo: ItemReferenciaTipo;
  composicao_item_tipo: ComposicaoItemTipo;
  cronograma_periodicidade: CronogramaPeriodicidade;
  medicao_status: MedicaoStatus;
  encargo_grupo: EncargoGrupo;
  honorario_metodo: HonorarioMetodo;
  disciplina_projeto: DisciplinaProjeto;
  honorario_status: HonorarioStatus;
}

