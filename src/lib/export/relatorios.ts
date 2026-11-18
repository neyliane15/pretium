/**
 * Construtores das tabelas exportáveis do orçamento (sintético, resumo, analítico, curva ABC,
 * cronograma, medição). Funções puras, testadas em relatorios.test.ts. Dono: FRONTEND-2.
 */
import { formatData, formatMesAno } from '@/lib/format';
import { LABEL_INSUMO_TIPO, LABEL_REGIME } from '@/lib/labels';
import type {
  ComposicaoAnaliticaLinha, CronogramaLinha, CurvaAbcInsumo, CurvaAbcServico, MedicaoResumoLinha, RegimeDesoneracao, ResumoEtapa,
} from '@/types/database';
import type { ColunaExport, LinhaExport, TabelaExport } from './tabela';

export interface MetaOrcamento {
  organizacao?: string | null;
  obra?: string | null;
  orcamento: string;
  codigo?: string | null;
  versao?: number | null;
  dataBase?: { uf: string; ano: number; mes: number; regime: RegimeDesoneracao; is_demo: boolean } | null;
  bdi?: number | null;
  dataOrcamento?: string | null;
  responsavel?: string | null;
}

export function metaLinhas(m: MetaOrcamento): [string, string][] {
  const out: [string, string][] = [];
  if (m.organizacao) out.push(['Empresa', m.organizacao]);
  if (m.obra) out.push(['Obra', m.obra]);
  out.push(['Orçamento', `${m.codigo ? m.codigo + ' – ' : ''}${m.orcamento}${m.versao ? ` (v${m.versao})` : ''}`]);
  if (m.dataBase) {
    out.push(['Data-base', `SINAPI ${m.dataBase.uf} ${formatMesAno(m.dataBase.ano, m.dataBase.mes)}`]);
    out.push(['Regime', LABEL_REGIME[m.dataBase.regime]]);
    if (m.dataBase.is_demo) out.push(['Aviso', 'DOCUMENTO GERADO COM DADOS DE EXEMPLO – NÃO OFICIAIS']);
  }
  if (m.bdi !== null && m.bdi !== undefined) out.push(['BDI', `${m.bdi.toFixed(2).replace('.', ',')}%`]);
  if (m.dataOrcamento) out.push(['Data', formatData(m.dataOrcamento)]);
  if (m.responsavel) out.push(['Responsável técnico', m.responsavel]);
  return out;
}

/** Linha da EAP já montada (subconjunto de `montarEap`). */
export interface LinhaEapExport {
  tipo: 'etapa' | 'item';
  nivel: number;
  codigo: string;
  descricao: string;
  fonte?: string;
  referencia_codigo?: string | null;
  unidade?: string;
  quantidade?: number;
  custo_unitario?: number;
  bdi_percentual?: number;
  preco_unitario?: number;
  total_sem_bdi: number;
  total: number;
  percentual: number;
}

const COL_SINTETICO: ColunaExport[] = [
  { chave: 'item', rotulo: 'Item', tipo: 'codigo', largura: 9 },
  { chave: 'fonte', rotulo: 'Fonte', tipo: 'texto', largura: 9 },
  { chave: 'codigo', rotulo: 'Código', tipo: 'codigo', largura: 10 },
  { chave: 'descricao', rotulo: 'Descrição', tipo: 'texto', largura: 60 },
  { chave: 'unidade', rotulo: 'Und', tipo: 'texto', largura: 6 },
  { chave: 'quantidade', rotulo: 'Quant.', tipo: 'quantidade', largura: 12 },
  { chave: 'custo', rotulo: 'Custo unit. (R$)', tipo: 'moeda', largura: 14 },
  { chave: 'bdi', rotulo: 'BDI (%)', tipo: 'percentual', largura: 8 },
  { chave: 'preco', rotulo: 'Preço unit. (R$)', tipo: 'moeda', largura: 14 },
  { chave: 'total', rotulo: 'Total (R$)', tipo: 'moeda', largura: 16 },
  { chave: 'pct', rotulo: '%', tipo: 'percentual', largura: 8 },
];

function rodape(totalSemBdi: number, total: number, chaveRotulo: string, chaveValor: string): LinhaExport[] {
  return [
    { nivel: 'total', valores: { [chaveRotulo]: 'TOTAL SEM BDI', [chaveValor]: totalSemBdi } },
    { nivel: 'total', valores: { [chaveRotulo]: 'BDI', [chaveValor]: Math.round((total - totalSemBdi) * 100) / 100 } },
    { nivel: 'total', valores: { [chaveRotulo]: 'TOTAL COM BDI', [chaveValor]: total } },
  ];
}

export function tabelaSintetico(meta: MetaOrcamento, linhas: readonly LinhaEapExport[], totais: { total_sem_bdi: number; total: number }): TabelaExport {
  return {
    nome: 'Sintético',
    titulo: `Orçamento sintético – ${meta.orcamento}`,
    meta: metaLinhas(meta),
    colunas: COL_SINTETICO,
    linhas: [
      ...linhas.map<LinhaExport>((l) =>
        l.tipo === 'etapa'
          ? { nivel: l.nivel, valores: { item: l.codigo, descricao: l.descricao.toUpperCase(), total: l.total, pct: l.percentual } }
          : {
              valores: {
                item: l.codigo, fonte: l.fonte, codigo: l.referencia_codigo, descricao: l.descricao, unidade: l.unidade,
                quantidade: l.quantidade, custo: l.custo_unitario, bdi: l.bdi_percentual, preco: l.preco_unitario, total: l.total, pct: l.percentual,
              },
            },
      ),
      ...rodape(totais.total_sem_bdi, totais.total, 'descricao', 'total'),
    ],
  };
}

export function tabelaResumo(meta: MetaOrcamento, resumo: readonly ResumoEtapa[], totais: { total_sem_bdi: number; total: number }): TabelaExport {
  return {
    nome: 'Resumo por etapa',
    titulo: `Resumo por etapa – ${meta.orcamento}`,
    meta: metaLinhas(meta),
    colunas: [
      { chave: 'item', rotulo: 'Item', tipo: 'codigo', largura: 9 },
      { chave: 'descricao', rotulo: 'Etapa', tipo: 'texto', largura: 60 },
      { chave: 'sem', rotulo: 'Total sem BDI (R$)', tipo: 'moeda', largura: 18 },
      { chave: 'total', rotulo: 'Total com BDI (R$)', tipo: 'moeda', largura: 18 },
      { chave: 'pct', rotulo: '%', tipo: 'percentual', largura: 8 },
    ],
    linhas: [
      ...resumo.map<LinhaExport>((r) => ({ nivel: r.nivel, valores: { item: r.codigo, descricao: r.nome, sem: r.total_sem_bdi, total: r.total, pct: r.percentual } })),
      { nivel: 'total', valores: { descricao: 'TOTAL', sem: totais.total_sem_bdi, total: totais.total } },
    ],
  };
}

/** Analítico: cada item seguido das linhas da composição (um nível, como `fn_composicao_analitica`). */
export function tabelaAnalitico(
  meta: MetaOrcamento,
  linhas: readonly (LinhaEapExport & { id?: string })[],
  analiticas: ReadonlyMap<string, readonly ComposicaoAnaliticaLinha[]>,
  totais: { total_sem_bdi: number; total: number },
): TabelaExport {
  const out: LinhaExport[] = [];
  for (const l of linhas) {
    if (l.tipo === 'etapa') {
      out.push({ nivel: l.nivel, valores: { item: l.codigo, descricao: l.descricao.toUpperCase(), total: l.total } });
      continue;
    }
    out.push({
      nivel: 3,
      valores: {
        item: l.codigo, fonte: l.fonte, codigo: l.referencia_codigo, descricao: l.descricao, unidade: l.unidade,
        quantidade: l.quantidade, custo: l.custo_unitario, preco: l.preco_unitario, total: l.total,
      },
    });
    for (const c of (l.id && analiticas.get(l.id)) || []) {
      out.push({
        valores: {
          fonte: c.tipo_item === 'composicao' ? 'COMP.' : c.insumo_tipo ? LABEL_INSUMO_TIPO[c.insumo_tipo] : 'INSUMO',
          codigo: c.codigo, descricao: `   ${c.descricao}`, unidade: c.unidade, coef: c.coeficiente, custo: c.preco_unitario, parcial: c.custo_parcial,
        },
      });
    }
  }
  out.push(...rodape(totais.total_sem_bdi, totais.total, 'descricao', 'total'));
  return {
    nome: 'Analítico',
    titulo: `Orçamento analítico – ${meta.orcamento}`,
    meta: metaLinhas(meta),
    colunas: [
      { chave: 'item', rotulo: 'Item', tipo: 'codigo', largura: 9 },
      { chave: 'fonte', rotulo: 'Fonte/Tipo', tipo: 'texto', largura: 12 },
      { chave: 'codigo', rotulo: 'Código', tipo: 'codigo', largura: 10 },
      { chave: 'descricao', rotulo: 'Descrição', tipo: 'texto', largura: 60 },
      { chave: 'unidade', rotulo: 'Und', tipo: 'texto', largura: 6 },
      { chave: 'coef', rotulo: 'Coeficiente', tipo: 'coeficiente', largura: 12 },
      { chave: 'quantidade', rotulo: 'Quant.', tipo: 'quantidade', largura: 12 },
      { chave: 'custo', rotulo: 'Custo unit. (R$)', tipo: 'moeda', largura: 14 },
      { chave: 'parcial', rotulo: 'Parcial (R$)', tipo: 'moeda', largura: 14 },
      { chave: 'preco', rotulo: 'Preço unit. (R$)', tipo: 'moeda', largura: 14 },
      { chave: 'total', rotulo: 'Total (R$)', tipo: 'moeda', largura: 16 },
    ],
    linhas: out,
  };
}

const COL_ABC_FIM: ColunaExport[] = [
  { chave: 'total', rotulo: 'Total (R$)', tipo: 'moeda', largura: 16 },
  { chave: 'pct', rotulo: '%', tipo: 'percentual', largura: 8 },
  { chave: 'acum', rotulo: '% acum.', tipo: 'percentual', largura: 9 },
  { chave: 'classe', rotulo: 'Classe', tipo: 'texto', largura: 7 },
];

export function tabelaAbcServicos(meta: MetaOrcamento, linhas: readonly CurvaAbcServico[]): TabelaExport {
  return {
    nome: 'Curva ABC serviços',
    titulo: `Curva ABC de serviços – ${meta.orcamento}`,
    meta: metaLinhas(meta),
    colunas: [
      { chave: 'pos', rotulo: 'Pos.', tipo: 'inteiro', largura: 6 },
      { chave: 'item', rotulo: 'Item', tipo: 'codigo', largura: 9 },
      { chave: 'codigo', rotulo: 'Código', tipo: 'codigo', largura: 10 },
      { chave: 'descricao', rotulo: 'Descrição', tipo: 'texto', largura: 60 },
      { chave: 'unidade', rotulo: 'Und', tipo: 'texto', largura: 6 },
      { chave: 'quantidade', rotulo: 'Quant.', tipo: 'quantidade', largura: 12 },
      { chave: 'preco', rotulo: 'Preço unit. (R$)', tipo: 'moeda', largura: 14 },
      ...COL_ABC_FIM,
    ],
    linhas: linhas.map((l) => ({
      valores: {
        pos: l.posicao, item: l.codigo, codigo: l.referencia_codigo, descricao: l.descricao, unidade: l.unidade, quantidade: l.quantidade,
        preco: l.preco_unitario, total: l.total, pct: l.percentual, acum: l.percentual_acumulado, classe: l.classe,
      },
    })),
  };
}

export function tabelaAbcInsumos(meta: MetaOrcamento, linhas: readonly CurvaAbcInsumo[]): TabelaExport {
  return {
    nome: 'Curva ABC insumos',
    titulo: `Curva ABC de insumos – ${meta.orcamento}`,
    meta: metaLinhas(meta),
    colunas: [
      { chave: 'pos', rotulo: 'Pos.', tipo: 'inteiro', largura: 6 },
      { chave: 'codigo', rotulo: 'Código', tipo: 'codigo', largura: 10 },
      { chave: 'descricao', rotulo: 'Descrição', tipo: 'texto', largura: 60 },
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'texto', largura: 13 },
      { chave: 'unidade', rotulo: 'Und', tipo: 'texto', largura: 6 },
      { chave: 'quantidade', rotulo: 'Quant.', tipo: 'quantidade', largura: 12 },
      { chave: 'preco', rotulo: 'Preço unit. (R$)', tipo: 'moeda', largura: 14 },
      ...COL_ABC_FIM,
    ],
    linhas: linhas.map((l) => ({
      valores: {
        pos: l.posicao, codigo: l.codigo, descricao: l.descricao, tipo: l.insumo_tipo ? LABEL_INSUMO_TIPO[l.insumo_tipo] : '', unidade: l.unidade,
        quantidade: l.quantidade, preco: l.preco_unitario, total: l.total, pct: l.percentual, acum: l.percentual_acumulado, classe: l.classe,
      },
    })),
  };
}

export interface GradeCronograma {
  periodos: { periodo: number; inicio: string; fim: string }[];
  etapas: { etapa_id: string; codigo: string; nome: string; total: number; celulas: Map<number, { percentual: number; valor: number }> }[];
  totaisPeriodo: { valor: number; acumulado: number; percentual: number; percentualAcumulado: number }[];
  total: number;
}

/** Agrupa as linhas de `fn_cronograma_fisico_financeiro` em grade etapa × período. */
export function montarGradeCronograma(linhas: readonly CronogramaLinha[]): GradeCronograma {
  const periodos = new Map<number, { periodo: number; inicio: string; fim: string }>();
  const etapas = new Map<string, GradeCronograma['etapas'][number]>();
  for (const l of linhas) {
    if (!periodos.has(l.periodo)) periodos.set(l.periodo, { periodo: l.periodo, inicio: l.data_inicio, fim: l.data_fim });
    let e = etapas.get(l.etapa_id);
    if (!e) {
      e = { etapa_id: l.etapa_id, codigo: l.etapa_codigo, nome: l.etapa_nome, total: l.etapa_total, celulas: new Map() };
      etapas.set(l.etapa_id, e);
    }
    e.celulas.set(l.periodo, { percentual: l.percentual, valor: l.valor });
  }
  const ps = [...periodos.values()].sort((a, b) => a.periodo - b.periodo);
  const es = [...etapas.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  const total = Math.round(es.reduce((s, e) => s + e.total * 100, 0)) / 100;
  let acum = 0;
  const totaisPeriodo = ps.map((p) => {
    const valor = Math.round(es.reduce((s, e) => s + (e.celulas.get(p.periodo)?.valor ?? 0) * 100, 0)) / 100;
    acum = Math.round((acum + valor) * 100) / 100;
    return { valor, acumulado: acum, percentual: total > 0 ? (valor / total) * 100 : 0, percentualAcumulado: total > 0 ? (acum / total) * 100 : 0 };
  });
  return { periodos: ps, etapas: es, totaisPeriodo, total };
}

export function tabelaCronograma(meta: MetaOrcamento, g: GradeCronograma): TabelaExport {
  const colunas: ColunaExport[] = [
    { chave: 'item', rotulo: 'Item', tipo: 'codigo', largura: 7 },
    { chave: 'etapa', rotulo: 'Etapa', tipo: 'texto', largura: 40 },
    { chave: 'total', rotulo: 'Total (R$)', tipo: 'moeda', largura: 15 },
    ...g.periodos.flatMap<ColunaExport>((p) => [
      { chave: `p${p.periodo}`, rotulo: `P${p.periodo} ${formatData(p.inicio)} (%)`, tipo: 'percentual', largura: 12 },
      { chave: `v${p.periodo}`, rotulo: `P${p.periodo} (R$)`, tipo: 'moeda', largura: 14 },
    ]),
  ];
  const linhas: LinhaExport[] = g.etapas.map((e) => ({
    valores: {
      item: e.codigo, etapa: e.nome, total: e.total,
      ...Object.fromEntries(g.periodos.flatMap((p) => [[`p${p.periodo}`, e.celulas.get(p.periodo)?.percentual ?? 0], [`v${p.periodo}`, e.celulas.get(p.periodo)?.valor ?? 0]])),
    },
  }));
  linhas.push({
    nivel: 'total',
    valores: { etapa: 'TOTAL DO PERÍODO', total: g.total, ...Object.fromEntries(g.periodos.flatMap((p, i) => [[`p${p.periodo}`, g.totaisPeriodo[i]!.percentual], [`v${p.periodo}`, g.totaisPeriodo[i]!.valor]])) },
  });
  linhas.push({
    nivel: 'total',
    valores: { etapa: 'ACUMULADO', ...Object.fromEntries(g.periodos.flatMap((p, i) => [[`p${p.periodo}`, g.totaisPeriodo[i]!.percentualAcumulado], [`v${p.periodo}`, g.totaisPeriodo[i]!.acumulado]])) },
  });
  return { nome: 'Cronograma', titulo: `Cronograma físico-financeiro – ${meta.orcamento}`, meta: metaLinhas(meta), colunas, linhas };
}

export function tabelaMedicao(meta: MetaOrcamento, numero: number, linhas: readonly MedicaoResumoLinha[]): TabelaExport {
  return {
    nome: `Medição ${numero}`,
    titulo: `Boletim de medição nº ${numero} – ${meta.orcamento}`,
    meta: metaLinhas(meta),
    colunas: [
      { chave: 'item', rotulo: 'Item', tipo: 'codigo', largura: 9 },
      { chave: 'descricao', rotulo: 'Descrição', tipo: 'texto', largura: 50 },
      { chave: 'unidade', rotulo: 'Und', tipo: 'texto', largura: 6 },
      { chave: 'preco', rotulo: 'Preço unit. (R$)', tipo: 'moeda', largura: 13 },
      { chave: 'qorc', rotulo: 'Qtd. orçada', tipo: 'quantidade', largura: 12 },
      { chave: 'qant', rotulo: 'Qtd. anterior', tipo: 'quantidade', largura: 12 },
      { chave: 'qatu', rotulo: 'Qtd. no período', tipo: 'quantidade', largura: 12 },
      { chave: 'qacu', rotulo: 'Qtd. acumulada', tipo: 'quantidade', largura: 12 },
      { chave: 'vatu', rotulo: 'Valor período (R$)', tipo: 'moeda', largura: 15 },
      { chave: 'vacu', rotulo: 'Valor acumulado (R$)', tipo: 'moeda', largura: 15 },
      { chave: 'vsal', rotulo: 'Saldo (R$)', tipo: 'moeda', largura: 15 },
      { chave: 'pct', rotulo: '% acum.', tipo: 'percentual', largura: 9 },
    ],
    linhas: linhas.map((l) => ({
      valores: {
        item: l.codigo, descricao: l.descricao, unidade: l.unidade, preco: l.preco_unitario, qorc: l.quantidade_orcada, qant: l.quantidade_anterior,
        qatu: l.quantidade_atual, qacu: l.quantidade_acumulada, vatu: l.valor_atual, vacu: l.valor_acumulado, vsal: l.valor_saldo, pct: l.percentual_acumulado,
      },
    })),
  };
}
