/**
 * Parser das planilhas SINAPI (lógica pura, sem dependência de SheetJS/DOM).
 * Contrato: docs/ARQUITETURA.md §9. Dono: FRONTEND-1.
 *
 * Fluxo: matriz de células (linhas × colunas) → detectar linha de cabeçalho → detectar tipo/formato
 * → sugerir mapeamento de colunas (editável na tela) → extrair linhas normalizadas + erros.
 */
import type { InsumoTipo, RegimeDesoneracao } from '@/types/database';
import type { LinhaComposicaoItemSinapi, LinhaComposicaoSinapi, LinhaInsumoSinapi, TipoPlanilhaSinapi } from '@/types/sinapi-import';

export type Celula = string | number | boolean | Date | null | undefined;
export type Matriz = readonly (readonly Celula[])[];

/** Formato da planilha: legado (um arquivo por UF) ou consolidado (colunas de preço por UF). */
export type FormatoSinapi = 'uf' | 'consolidado';

export const UFS_BR = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'] as const;

// ─── Normalização básica ──────────────────────────────────────────────────

/** Remove acentos, caixa alta, espaços colapsados ("Código  do Insumo" → "CODIGO DO INSUMO"). */
export function normalizarTexto(v: Celula): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Código SINAPI: trim, remove ".0" final e zeros à esquerda. `null` se não for numérico. */
export function normalizarCodigo(v: Celula): string | null {
  if (v === null || v === undefined || typeof v === 'boolean' || v instanceof Date) return null;
  let s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(v)) : String(v).trim();
  s = s.replace(/\.0+$/, '').replace(/\s/g, '');
  if (!/^\d+$/.test(s)) return null;
  s = s.replace(/^0+(?=\d)/, '');
  return s;
}

/** Número pt-BR ou nativo: 1.234,56 · 1234,56 · 1234.56 · 1234. `null` se vazio/inválido. */
export function parseNumero(v: Celula): number | null {
  if (v === null || v === undefined || typeof v === 'boolean' || v instanceof Date) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = v.replace(/R\$|%|\s|\u00a0/g, '').trim();
  if (!s || s === '-') return null;
  const virgula = s.lastIndexOf(',');
  const ponto = s.lastIndexOf('.');
  if (virgula >= 0 && ponto >= 0) {
    s = virgula > ponto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (virgula >= 0) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizarUnidade(v: Celula): string {
  return normalizarTexto(v).replace(/\s+/g, '').replace(/²/g, '2').replace(/³/g, '3');
}

const texto = (v: Celula): string => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());

/** Heurística §9.2: CHP/CHI ⇒ equipamento; H (e MES de mensalista) ⇒ mão de obra; senão material. */
export function inferirTipoInsumo(unidade: string, descricao: string): InsumoTipo {
  const u = normalizarUnidade(unidade);
  const d = normalizarTexto(descricao);
  if (u === 'CHP' || u === 'CHI') return 'equipamento';
  if (u === 'H') return /\bCHP\b|\bCHI\b|EQUIPAMENTO|MAQUINA|CAMINHAO|BETONEIRA|RETROESCAVADEIRA/.test(d) ? 'equipamento' : 'mao_de_obra';
  if (u === 'MES' && /MENSALISTA|ENCARREGADO|ENGENHEIRO|ARQUITETO|TECNICO|MESTRE|ALMOXARIFE|VIGIA|APONTADOR/.test(d)) return 'mao_de_obra';
  return 'material';
}

// ─── Cabeçalho, tipo e formato ────────────────────────────────────────────

/** Índice (0-based) da 1ª linha, entre as 40 primeiras, com "CODIGO" e "DESCRI". -1 se não achar. */
export function detectarLinhaCabecalho(linhas: Matriz, max = 40): number {
  const n = Math.min(max, linhas.length);
  for (let i = 0; i < n; i++) {
    const cells = (linhas[i] ?? []).map(normalizarTexto);
    if (cells.some((c) => c.includes('CODIGO')) && cells.some((c) => c.includes('DESCRI'))) return i;
  }
  return -1;
}

/** Tipo pela sigla da aba do formato consolidado (ISD/ICD → insumos; CSD/CCD → composições; ANALITICO). */
export function tipoPorAba(nomeAba: string): TipoPlanilhaSinapi | null {
  const n = normalizarTexto(nomeAba);
  if (/ANALITIC/.test(n)) return 'analitico';
  if (/\bI[SC]D\b|^I[SC]D/.test(n)) return 'insumos';
  if (/\bC[SC]D\b|^C[SC]D/.test(n)) return 'composicoes';
  return null;
}

/** Regime pela sigla (…SD ⇒ não desonerado, …CD ⇒ desonerado) ou por "NaoDesonerado"/"Desonerado". */
export function regimePorNome(nome: string): RegimeDesoneracao | null {
  const n = normalizarTexto(nome).replace(/[_\-.]/g, ' ');
  if (/NAO ?DESONERAD|SEM DESONERA|\b[IC]SD\b|^[IC]SD/.test(n)) return 'nao_desonerado';
  if (/DESONERAD|COM DESONERA|\b[IC]CD\b|^[IC]CD/.test(n)) return 'desonerado';
  return null;
}

/** Detecta o tipo pelo cabeçalho (e, em último caso, pelo nome da aba/arquivo). */
export function detectarTipo(cabecalho: readonly Celula[], nome = ''): TipoPlanilhaSinapi {
  const h = cabecalho.map(normalizarTexto);
  const tem = (re: RegExp) => h.some((c) => re.test(c));
  if (tem(/TIPO ?ITEM/) || tem(/COEFICIENTE/)) return 'analitico';
  const porNome = tipoPorAba(nome);
  if (porNome) return porNome;
  const n = normalizarTexto(nome);
  if (/ANALITIC/.test(n)) return 'analitico';
  if (tem(/COMPOSICAO/) || tem(/^CUSTO/) || /COMPOSIC/.test(n)) return 'composicoes';
  return 'insumos';
}

/** Consolidado quando há ≥ 2 colunas cujo cabeçalho é exatamente uma UF. */
export function detectarFormato(cabecalho: readonly Celula[]): FormatoSinapi {
  const ufs = cabecalho.map(normalizarTexto).filter((c) => (UFS_BR as readonly string[]).includes(c));
  return ufs.length >= 2 ? 'consolidado' : 'uf';
}

/** Metadados a partir do nome do arquivo: SINAPI_Preco_Ref_Insumos_RJ_202609_NaoDesonerado.xlsx */
export function inferirMetadadosArquivo(nome: string): { uf?: string; ano?: number; mes?: number; regime?: RegimeDesoneracao; tipo?: TipoPlanilhaSinapi } {
  const out: { uf?: string; ano?: number; mes?: number; regime?: RegimeDesoneracao; tipo?: TipoPlanilhaSinapi } = {};
  const base = nome.replace(/\.[^.]+$/, '');
  const partes = base.split(/[_\-\s.]+/);
  const uf = partes.find((p) => (UFS_BR as readonly string[]).includes(p.toUpperCase()) && p.length === 2);
  if (uf) out.uf = uf.toUpperCase();
  const am = /(20\d{2})(0[1-9]|1[0-2])(?!\d)/.exec(base) ?? /(0[1-9]|1[0-2])[-_/]?(20\d{2})/.exec(base);
  if (am) {
    const [a, b] = am[1]!.length === 4 ? [am[1]!, am[2]!] : [am[2]!, am[1]!];
    out.ano = Number(a);
    out.mes = Number(b);
  }
  const r = regimePorNome(base);
  if (r) out.regime = r;
  const n = normalizarTexto(base);
  if (/ANALITIC/.test(n)) out.tipo = 'analitico';
  else if (/COMPOSIC|SINTETIC/.test(n)) out.tipo = 'composicoes';
  else if (/INSUMO/.test(n)) out.tipo = 'insumos';
  return out;
}

// ─── Campos e mapeamento ──────────────────────────────────────────────────

export interface CampoDef {
  campo: string;
  rotulo: string;
  obrigatorio: boolean;
  /** sinônimos normalizados (match exato tem prioridade sobre "contém") */
  sinonimos: readonly string[];
  /** coluna de valor por UF no formato consolidado */
  valorUf?: boolean;
}

export const CAMPOS: Record<TipoPlanilhaSinapi, readonly CampoDef[]> = {
  insumos: [
    { campo: 'codigo', rotulo: 'Código', obrigatorio: true, sinonimos: ['CODIGO', 'CODIGO DO INSUMO', 'COD INSUMO', 'CODIGO INSUMO'] },
    { campo: 'descricao', rotulo: 'Descrição', obrigatorio: true, sinonimos: ['DESCRICAO', 'DESCRICAO DO INSUMO', 'DESCRICAO INSUMO'] },
    { campo: 'unidade', rotulo: 'Unidade', obrigatorio: true, sinonimos: ['UNIDADE', 'UNIDADE DE MEDIDA', 'UND', 'UN'] },
    { campo: 'preco', rotulo: 'Preço', obrigatorio: true, valorUf: true, sinonimos: ['PRECO MEDIANO R$', 'PRECO MEDIANO', 'PRECO', 'PRECO UNITARIO', 'PRECO (R$)'] },
    { campo: 'origem_preco', rotulo: 'Origem do preço', obrigatorio: false, sinonimos: ['ORIGEM DE PRECO', 'ORIGEM DO PRECO', 'ORIGEM'] },
    { campo: 'classificacao', rotulo: 'Classificação', obrigatorio: false, sinonimos: ['CLASSIFICACAO', 'CLASSE', 'GRUPO'] },
    { campo: 'uf', rotulo: 'Coluna UF (filtro)', obrigatorio: false, sinonimos: ['UF', 'ESTADO'] },
  ],
  composicoes: [
    { campo: 'codigo', rotulo: 'Código', obrigatorio: true, sinonimos: ['CODIGO DA COMPOSICAO', 'CODIGO COMPOSICAO', 'CODIGO'] },
    { campo: 'descricao', rotulo: 'Descrição', obrigatorio: true, sinonimos: ['DESCRICAO DA COMPOSICAO', 'DESCRICAO COMPOSICAO', 'DESCRICAO'] },
    { campo: 'unidade', rotulo: 'Unidade', obrigatorio: true, sinonimos: ['UNIDADE', 'UNIDADE DE MEDIDA', 'UND'] },
    { campo: 'custo', rotulo: 'Custo total', obrigatorio: true, valorUf: true, sinonimos: ['CUSTO TOTAL', 'CUSTO', 'CUSTO (R$)', 'CUSTO UNITARIO'] },
    { campo: 'grupo', rotulo: 'Grupo/classe', obrigatorio: false, sinonimos: ['DESCRICAO DA CLASSE', 'GRUPO', 'CLASSE', 'DESCRICAO DO TIPO 1', 'TIPO'] },
    { campo: 'perc_mao_obra', rotulo: '% mão de obra', obrigatorio: false, sinonimos: ['% MAO DE OBRA', 'PERC MAO DE OBRA', '%MO', '% MO'] },
    { campo: 'custo_mao_obra', rotulo: 'Custo mão de obra', obrigatorio: false, sinonimos: ['CUSTO MAO DE OBRA', 'CUSTO MO'] },
    { campo: 'custo_material', rotulo: 'Custo material', obrigatorio: false, sinonimos: ['CUSTO MATERIAL', 'CUSTO MATERIAIS'] },
    { campo: 'custo_equipamento', rotulo: 'Custo equipamento', obrigatorio: false, sinonimos: ['CUSTO EQUIPAMENTO', 'CUSTO EQUIPAMENTOS'] },
    { campo: 'custo_servicos', rotulo: 'Custo serviços/outros', obrigatorio: false, sinonimos: ['CUSTO SERVICOS TERCEIROS', 'CUSTO OUTROS', 'CUSTO SERVICOS'] },
    { campo: 'uf', rotulo: 'Coluna UF (filtro)', obrigatorio: false, sinonimos: ['UF', 'ESTADO'] },
  ],
  analitico: [
    { campo: 'composicao_codigo', rotulo: 'Código da composição', obrigatorio: true, sinonimos: ['CODIGO DA COMPOSICAO', 'CODIGO COMPOSICAO', 'COD COMPOSICAO'] },
    { campo: 'tipo_item', rotulo: 'Tipo do item', obrigatorio: true, sinonimos: ['TIPO ITEM', 'TIPO DO ITEM', 'TIPO'] },
    { campo: 'item_codigo', rotulo: 'Código do item', obrigatorio: true, sinonimos: ['CODIGO ITEM', 'CODIGO DO ITEM', 'COD ITEM'] },
    { campo: 'coeficiente', rotulo: 'Coeficiente', obrigatorio: true, sinonimos: ['COEFICIENTE', 'COEF', 'QUANTIDADE'] },
    { campo: 'descricao', rotulo: 'Descrição do item', obrigatorio: false, sinonimos: ['DESCRICAO ITEM', 'DESCRICAO DO ITEM', 'DESCRICAO'] },
    { campo: 'unidade', rotulo: 'Unidade do item', obrigatorio: false, sinonimos: ['UNIDADE ITEM', 'UNIDADE DO ITEM', 'UNIDADE', 'UND'] },
    { campo: 'descricao_composicao', rotulo: 'Descrição da composição', obrigatorio: false, sinonimos: ['DESCRICAO DA COMPOSICAO', 'DESCRICAO COMPOSICAO'] },
    { campo: 'unidade_composicao', rotulo: 'Unidade da composição', obrigatorio: false, sinonimos: ['UNIDADE DA COMPOSICAO', 'UNIDADE COMPOSICAO', 'UNIDADE'] },
    { campo: 'custo', rotulo: 'Custo (cabeçalho)', obrigatorio: false, valorUf: true, sinonimos: ['CUSTO TOTAL', 'CUSTO', 'PRECO TOTAL'] },
    { campo: 'uf', rotulo: 'Coluna UF (filtro)', obrigatorio: false, sinonimos: ['UF', 'ESTADO'] },
  ],
};

/** campo → índice da coluna (ou null = não mapeado) */
export type Mapeamento = Record<string, number | null>;

/**
 * Sugere o mapeamento: 1º match exato de sinônimo, depois "começa com", depois "contém".
 * Cada coluna é usada no máximo uma vez. No consolidado, o campo de valor (preço/custo) vai para a
 * coluna cujo cabeçalho é exatamente a UF.
 */
export function sugerirMapeamento(cabecalho: readonly Celula[], tipo: TipoPlanilhaSinapi, uf = 'RJ', formato?: FormatoSinapi): Mapeamento {
  const h = cabecalho.map(normalizarTexto);
  const fmt = formato ?? detectarFormato(cabecalho);
  const usadas = new Set<number>();
  const map: Mapeamento = {};
  const campos = CAMPOS[tipo];

  // colunas de UF (consolidado) nunca são candidatas para outros campos
  if (fmt === 'consolidado') h.forEach((c, i) => (UFS_BR as readonly string[]).includes(c) && usadas.add(i));

  const achar = (sin: readonly string[], modo: 'exato' | 'inicio' | 'contem'): number => {
    for (const s of sin) {
      const i = h.findIndex((c, idx) => !usadas.has(idx) && c !== '' && (modo === 'exato' ? c === s : modo === 'inicio' ? c.startsWith(s) : c.includes(s)));
      if (i >= 0) return i;
    }
    return -1;
  };

  for (const c of campos) map[c.campo] = null;

  if (fmt === 'consolidado') {
    const valor = campos.find((c) => c.valorUf);
    const i = h.findIndex((c) => c === uf.toUpperCase());
    if (valor && i >= 0) map[valor.campo] = i;
  }

  for (const modo of ['exato', 'inicio', 'contem'] as const) {
    for (const c of campos) {
      if (map[c.campo] !== null) continue;
      if (fmt === 'consolidado' && c.valorUf) continue;
      // "UF" só por match exato (evita casar com qualquer coisa)
      if (c.campo === 'uf' && modo !== 'exato') continue;
      // "TIPO"/"UN" curtos só exatos
      const sin = modo === 'exato' ? c.sinonimos : c.sinonimos.filter((s) => s.length > 3);
      const i = achar(sin, modo);
      if (i >= 0) {
        map[c.campo] = i;
        usadas.add(i);
      }
    }
  }
  return map;
}

/** Campos obrigatórios sem coluna. */
export function camposFaltantes(tipo: TipoPlanilhaSinapi, map: Mapeamento): CampoDef[] {
  return CAMPOS[tipo].filter((c) => c.obrigatorio && (map[c.campo] === null || map[c.campo] === undefined));
}

// ─── Extração ─────────────────────────────────────────────────────────────

export interface ErroLinha {
  linha: number;
  codigo: string | null;
  mensagem: string;
}

export interface ResultadoExtracao<T> {
  linhas: T[];
  erros: ErroLinha[];
  /** linhas ignoradas (títulos, rodapés, outras UFs, vazias) */
  ignoradas: number;
}

export interface OpcoesExtracao {
  /** UF filtrada quando houver coluna UF mapeada */
  uf?: string;
}

export type ResultadoAnalitico = ResultadoExtracao<LinhaComposicaoItemSinapi> & {
  /** cabeçalhos de composição (linhas sem TIPO ITEM) — descrição/unidade/custo */
  composicoes: LinhaComposicaoSinapi[];
};

const cel = (row: readonly Celula[], map: Mapeamento, campo: string): Celula => {
  const i = map[campo];
  return i === null || i === undefined ? null : row[i];
};

function filtradaPorUf(row: readonly Celula[], map: Mapeamento, uf?: string): boolean {
  if (!uf || map.uf === null || map.uf === undefined) return false;
  const v = normalizarTexto(row[map.uf]);
  return v !== '' && v !== uf.toUpperCase();
}

const vazia = (row: readonly Celula[] | undefined) => !row || row.every((c) => c === null || c === undefined || String(c).trim() === '');

export function extrairInsumos(linhas: Matriz, cab: number, map: Mapeamento, op: OpcoesExtracao = {}): ResultadoExtracao<LinhaInsumoSinapi> {
  const out: LinhaInsumoSinapi[] = [];
  const erros: ErroLinha[] = [];
  let ignoradas = 0;
  for (let i = cab + 1; i < linhas.length; i++) {
    const row = linhas[i] ?? [];
    const linha = i + 1;
    if (vazia(row)) continue;
    const codigo = normalizarCodigo(cel(row, map, 'codigo'));
    if (!codigo || filtradaPorUf(row, map, op.uf)) {
      ignoradas++;
      continue;
    }
    const descricao = texto(cel(row, map, 'descricao'));
    const unidade = normalizarUnidade(cel(row, map, 'unidade'));
    const preco = parseNumero(cel(row, map, 'preco'));
    if (!descricao) erros.push({ linha, codigo, mensagem: 'Descrição ausente' });
    else if (!unidade) erros.push({ linha, codigo, mensagem: 'Unidade ausente' });
    else if (preco === null) erros.push({ linha, codigo, mensagem: 'Preço ausente' });
    else if (preco < 0) erros.push({ linha, codigo, mensagem: 'Preço negativo' });
    else {
      const origem = texto(cel(row, map, 'origem_preco')).toUpperCase();
      const classificacao = texto(cel(row, map, 'classificacao'));
      out.push({
        codigo,
        descricao,
        unidade,
        preco,
        origem_preco: origem || null,
        classificacao: classificacao || null,
        tipo: inferirTipoInsumo(unidade, descricao),
        linha,
      });
    }
  }
  return { linhas: out, erros, ignoradas };
}

export function extrairComposicoes(linhas: Matriz, cab: number, map: Mapeamento, op: OpcoesExtracao = {}): ResultadoExtracao<LinhaComposicaoSinapi> {
  const out: LinhaComposicaoSinapi[] = [];
  const erros: ErroLinha[] = [];
  let ignoradas = 0;
  for (let i = cab + 1; i < linhas.length; i++) {
    const row = linhas[i] ?? [];
    const linha = i + 1;
    if (vazia(row)) continue;
    const codigo = normalizarCodigo(cel(row, map, 'codigo'));
    if (!codigo || filtradaPorUf(row, map, op.uf)) {
      ignoradas++;
      continue;
    }
    const descricao = texto(cel(row, map, 'descricao'));
    const unidade = normalizarUnidade(cel(row, map, 'unidade'));
    const custo = parseNumero(cel(row, map, 'custo'));
    if (!descricao) erros.push({ linha, codigo, mensagem: 'Descrição ausente' });
    else if (!unidade) erros.push({ linha, codigo, mensagem: 'Unidade ausente' });
    else if (custo === null) erros.push({ linha, codigo, mensagem: 'Custo ausente' });
    else if (custo < 0) erros.push({ linha, codigo, mensagem: 'Custo negativo' });
    else {
      const grupo = texto(cel(row, map, 'grupo'));
      out.push({
        codigo,
        descricao,
        unidade,
        custo,
        grupo: grupo || null,
        perc_mao_obra: parseNumero(cel(row, map, 'perc_mao_obra')),
        custo_mao_obra: parseNumero(cel(row, map, 'custo_mao_obra')),
        custo_material: parseNumero(cel(row, map, 'custo_material')),
        custo_equipamento: parseNumero(cel(row, map, 'custo_equipamento')),
        custo_servicos: parseNumero(cel(row, map, 'custo_servicos')),
        linha,
      });
    }
  }
  return { linhas: out, erros, ignoradas };
}

function tipoItem(v: Celula): 'INSUMO' | 'COMPOSICAO' | null {
  const n = normalizarTexto(v);
  if (!n) return null;
  if (n.startsWith('INSUMO')) return 'INSUMO';
  if (n.startsWith('COMPOSICAO') || n.startsWith('COMPOSIC')) return 'COMPOSICAO';
  return null;
}

export function extrairAnalitico(linhas: Matriz, cab: number, map: Mapeamento, op: OpcoesExtracao = {}): ResultadoAnalitico {
  const out: LinhaComposicaoItemSinapi[] = [];
  const composicoes: LinhaComposicaoSinapi[] = [];
  const erros: ErroLinha[] = [];
  let ignoradas = 0;
  for (let i = cab + 1; i < linhas.length; i++) {
    const row = linhas[i] ?? [];
    const linha = i + 1;
    if (vazia(row)) continue;
    const comp = normalizarCodigo(cel(row, map, 'composicao_codigo'));
    if (!comp || filtradaPorUf(row, map, op.uf)) {
      ignoradas++;
      continue;
    }
    const tipoBruto = cel(row, map, 'tipo_item');
    const tipo = tipoItem(tipoBruto);
    if (!tipo) {
      if (normalizarTexto(tipoBruto) !== '') {
        erros.push({ linha, codigo: comp, mensagem: `Tipo de item desconhecido: "${texto(tipoBruto)}"` });
        continue;
      }
      // linha de cabeçalho da composição
      const descricao = texto(cel(row, map, 'descricao_composicao')) || texto(cel(row, map, 'descricao'));
      const unidade = normalizarUnidade(cel(row, map, 'unidade_composicao')) || normalizarUnidade(cel(row, map, 'unidade'));
      const custo = parseNumero(cel(row, map, 'custo'));
      if (descricao && unidade && custo !== null) composicoes.push({ codigo: comp, descricao, unidade, custo, linha });
      else ignoradas++;
      continue;
    }
    const item = normalizarCodigo(cel(row, map, 'item_codigo'));
    const coef = parseNumero(cel(row, map, 'coeficiente'));
    if (!item) erros.push({ linha, codigo: comp, mensagem: 'Código do item ausente ou inválido' });
    else if (coef === null) erros.push({ linha, codigo: comp, mensagem: `Coeficiente ausente (item ${item})` });
    else if (coef <= 0) erros.push({ linha, codigo: comp, mensagem: `Coeficiente deve ser maior que zero (item ${item})` });
    else if (tipo === 'COMPOSICAO' && item === comp) erros.push({ linha, codigo: comp, mensagem: 'Composição não pode conter a si mesma' });
    else {
      const descricao = texto(cel(row, map, 'descricao'));
      const unidade = normalizarUnidade(cel(row, map, 'unidade'));
      out.push({ composicao_codigo: comp, tipo_item: tipo, item_codigo: item, coeficiente: coef, descricao: descricao || null, unidade: unidade || null, linha });
    }
  }
  return { linhas: out, composicoes, erros, ignoradas };
}

export type ResultadoQualquer =
  | ({ tipo: 'insumos' } & ResultadoExtracao<LinhaInsumoSinapi>)
  | ({ tipo: 'composicoes' } & ResultadoExtracao<LinhaComposicaoSinapi>)
  | ({ tipo: 'analitico' } & ResultadoAnalitico);

export function extrair(tipo: TipoPlanilhaSinapi, linhas: Matriz, cab: number, map: Mapeamento, op: OpcoesExtracao = {}): ResultadoQualquer {
  if (tipo === 'insumos') return { tipo, ...extrairInsumos(linhas, cab, map, op) };
  if (tipo === 'composicoes') return { tipo, ...extrairComposicoes(linhas, cab, map, op) };
  return { tipo, ...extrairAnalitico(linhas, cab, map, op) };
}

// ─── CSV e lotes ──────────────────────────────────────────────────────────

/** CSV com detecção de separador (; , ou tab) e aspas duplas (RFC 4180). */
export function parseCsv(conteudo: string): string[][] {
  const txt = conteudo.replace(/^\uFEFF/, '');
  const amostra = txt.slice(0, 5000).split(/\r?\n/).slice(0, 20).join('\n');
  const contar = (c: string) => amostra.split(c).length - 1;
  const sep = [';', '\t', ','].reduce((a, b) => (contar(b) > contar(a) ? b : a), ';');
  const out: string[][] = [];
  let row: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i]!;
    if (aspas) {
      if (ch === '"') {
        if (txt[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += ch;
    } else if (ch === '"' && campo === '') aspas = true;
    else if (ch === sep) {
      row.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && txt[i + 1] === '\n') i++;
      row.push(campo);
      out.push(row);
      row = [];
      campo = '';
    } else campo += ch;
  }
  if (campo !== '' || row.length) {
    row.push(campo);
    out.push(row);
  }
  return out;
}

/** Divide em lotes de até `n` itens. */
export function emLotes<T>(arr: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
