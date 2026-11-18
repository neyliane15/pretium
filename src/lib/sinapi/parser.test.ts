import { describe, expect, it } from 'vitest';
import {
  camposFaltantes, detectarFormato, detectarLinhaCabecalho, detectarTipo, emLotes, extrairAnalitico, extrairComposicoes,
  extrairInsumos, inferirMetadadosArquivo, inferirTipoInsumo, normalizarCodigo, normalizarTexto, parseCsv, parseNumero,
  regimePorNome, sugerirMapeamento, tipoPorAba, type Matriz,
} from './parser';

const INSUMOS_UF: Matriz = [
  ['SISTEMA NACIONAL DE PESQUISA DE CUSTOS E ÍNDICES DA CONSTRUÇÃO CIVIL'],
  ['PREÇOS DE INSUMOS'],
  ['DATA DE EMISSÃO: 10/10/2026', null, null, 'LOCALIDADE: RIO DE JANEIRO'],
  [],
  ['CÓDIGO  ', 'DESCRIÇÃO DO INSUMO', 'UNIDADE DE MEDIDA', 'ORIGEM DE PREÇO', 'PREÇO MEDIANO R$'],
  ['00000370', 'AREIA MEDIA - POSTO JAZIDA/FORNECEDOR (RETIRADO NA JAZIDA, SEM TRANSPORTE)', 'm3', 'C', '123,45'],
  [1379, 'CIMENTO PORTLAND COMPOSTO CP II-32', 'KG', 'C', 0.89],
  ['4750.0', 'PEDREIRO (HORISTA)', 'H', 'CR', '1.234,56'],
  ['10511', 'BETONEIRA 400 L - CHP DIURNO', 'CHP', 'AS', '12.5'],
  ['99999', 'INSUMO SEM PRECO', 'UN', 'C', ''],
  ['Fonte: SINAPI / CAIXA'],
];

describe('normalização', () => {
  it('texto sem acento e espaços colapsados', () => {
    expect(normalizarTexto('  Código   do  Insumo ')).toBe('CODIGO DO INSUMO');
    expect(normalizarTexto('Preço\nMediano R$')).toBe('PRECO MEDIANO R$');
  });
  it('código: zeros à esquerda e ".0"', () => {
    expect(normalizarCodigo('00000370')).toBe('370');
    expect(normalizarCodigo(4750)).toBe('4750');
    expect(normalizarCodigo('4750.0')).toBe('4750');
    expect(normalizarCodigo('0')).toBe('0');
    expect(normalizarCodigo('TOTAL')).toBeNull();
    expect(normalizarCodigo('')).toBeNull();
  });
  it('números pt-BR e nativos', () => {
    expect(parseNumero('1.234,56')).toBe(1234.56);
    expect(parseNumero('1234,56')).toBe(1234.56);
    expect(parseNumero('1234.56')).toBe(1234.56);
    expect(parseNumero('1.234.567')).toBe(1234567);
    expect(parseNumero(' R$ 10 ')).toBe(10);
    expect(parseNumero(0.89)).toBe(0.89);
    expect(parseNumero('')).toBeNull();
    expect(parseNumero('abc')).toBeNull();
  });
  it('tipo de insumo pela unidade/descrição', () => {
    expect(inferirTipoInsumo('H', 'PEDREIRO (HORISTA)')).toBe('mao_de_obra');
    expect(inferirTipoInsumo('CHP', 'BETONEIRA')).toBe('equipamento');
    expect(inferirTipoInsumo('MES', 'ENGENHEIRO CIVIL DE OBRA JUNIOR (MENSALISTA)')).toBe('mao_de_obra');
    expect(inferirTipoInsumo('KG', 'CIMENTO')).toBe('material');
  });
});

describe('detecção', () => {
  it('linha de cabeçalho nas 40 primeiras', () => {
    expect(detectarLinhaCabecalho(INSUMOS_UF)).toBe(4);
    expect(detectarLinhaCabecalho([['a'], ['b']])).toBe(-1);
  });
  it('tipo pelo cabeçalho e pela aba', () => {
    expect(detectarTipo(INSUMOS_UF[4]!)).toBe('insumos');
    expect(detectarTipo(['CODIGO DA COMPOSICAO', 'DESCRICAO DA COMPOSICAO', 'UNIDADE', 'CUSTO TOTAL'])).toBe('composicoes');
    expect(detectarTipo(['CODIGO DA COMPOSICAO', 'TIPO ITEM', 'CODIGO ITEM', 'DESCRIÇÃO ITEM', 'COEFICIENTE'])).toBe('analitico');
    expect(detectarTipo(['Código', 'Descrição', 'Unidade', 'RJ', 'SP'], 'CSD')).toBe('composicoes');
    expect(tipoPorAba('ISD')).toBe('insumos');
    expect(tipoPorAba('CCD')).toBe('composicoes');
    expect(tipoPorAba('Analítico')).toBe('analitico');
  });
  it('regime e metadados do arquivo', () => {
    expect(regimePorNome('ISD')).toBe('nao_desonerado');
    expect(regimePorNome('ICD')).toBe('desonerado');
    expect(regimePorNome('NaoDesonerado')).toBe('nao_desonerado');
    expect(regimePorNome('Desonerado')).toBe('desonerado');
    expect(inferirMetadadosArquivo('SINAPI_Preco_Ref_Insumos_RJ_202609_NaoDesonerado.xlsx')).toEqual({
      uf: 'RJ', ano: 2026, mes: 9, regime: 'nao_desonerado', tipo: 'insumos',
    });
    expect(inferirMetadadosArquivo('SINAPI_Custo_Ref_Composicoes_Analitico_RJ_202609_Desonerado.xlsx').tipo).toBe('analitico');
  });
  it('formato consolidado por colunas de UF', () => {
    expect(detectarFormato(['CODIGO', 'DESCRICAO', 'UNIDADE', 'AC', 'AL', 'RJ'])).toBe('consolidado');
    expect(detectarFormato(INSUMOS_UF[4]!)).toBe('uf');
  });
});

describe('mapeamento e extração — formato por UF', () => {
  it('sugere colunas e extrai insumos com erros por linha', () => {
    const map = sugerirMapeamento(INSUMOS_UF[4]!, 'insumos');
    expect(map).toMatchObject({ codigo: 0, descricao: 1, unidade: 2, origem_preco: 3, preco: 4 });
    expect(camposFaltantes('insumos', map)).toHaveLength(0);
    const r = extrairInsumos(INSUMOS_UF, 4, map);
    expect(r.linhas.map((l) => l.codigo)).toEqual(['370', '1379', '4750', '10511']);
    expect(r.linhas[0]).toMatchObject({ unidade: 'M3', preco: 123.45, origem_preco: 'C', tipo: 'material', linha: 6 });
    expect(r.linhas[2]).toMatchObject({ preco: 1234.56, tipo: 'mao_de_obra' });
    expect(r.linhas[3]).toMatchObject({ preco: 12.5, tipo: 'equipamento' });
    expect(r.erros).toEqual([{ linha: 10, codigo: '99999', mensagem: 'Preço ausente' }]);
    expect(r.ignoradas).toBe(1); // rodapé
  });

  it('composições sintéticas', () => {
    const m: Matriz = [
      ['DESCRICAO DA CLASSE', 'CODIGO DA COMPOSICAO', 'DESCRICAO DA COMPOSICAO', 'UNIDADE', 'CUSTO TOTAL', '% MAO DE OBRA'],
      ['REVESTIMENTO', '87878', 'CHAPISCO APLICADO EM ALVENARIAS', 'M2', '4,56', '61,2'],
      ['REVESTIMENTO', '87879', 'SEM CUSTO', 'M2', null, null],
    ];
    const map = sugerirMapeamento(m[0]!, 'composicoes');
    expect(map).toMatchObject({ codigo: 1, descricao: 2, unidade: 3, custo: 4, grupo: 0, perc_mao_obra: 5 });
    const r = extrairComposicoes(m, 0, map);
    expect(r.linhas).toEqual([
      expect.objectContaining({ codigo: '87878', custo: 4.56, grupo: 'REVESTIMENTO', perc_mao_obra: 61.2, linha: 2 }),
    ]);
    expect(r.erros[0]).toMatchObject({ codigo: '87879', mensagem: 'Custo ausente' });
  });

  it('analítico: cabeçalho de composição + itens', () => {
    const m: Matriz = [
      ['CODIGO DA COMPOSICAO', 'DESCRICAO DA COMPOSICAO', 'UNIDADE', 'TIPO ITEM', 'CODIGO ITEM', 'DESCRIÇÃO ITEM', 'UNIDADE ITEM', 'COEFICIENTE', 'CUSTO TOTAL'],
      ['87878', 'CHAPISCO', 'M2', null, null, null, null, null, '4,56'],
      ['87878', 'CHAPISCO', 'M2', 'INSUMO', '00001379', 'CIMENTO', 'KG', '2,4300', null],
      ['87878', 'CHAPISCO', 'M2', 'COMPOSICAO', '88309', 'PEDREIRO COM ENCARGOS', 'H', '0,1', null],
      ['87878', 'CHAPISCO', 'M2', 'INSUMO', '370', 'AREIA', 'M3', '0', null],
      ['87878', 'CHAPISCO', 'M2', 'OUTRO', '1', 'X', 'UN', '1', null],
    ];
    const map = sugerirMapeamento(m[0]!, 'analitico');
    expect(map).toMatchObject({ composicao_codigo: 0, tipo_item: 3, item_codigo: 4, coeficiente: 7, descricao: 5, unidade: 6 });
    const r = extrairAnalitico(m, 0, map);
    expect(r.composicoes).toEqual([{ codigo: '87878', descricao: 'CHAPISCO', unidade: 'M2', custo: 4.56, linha: 2 }]);
    expect(r.linhas).toEqual([
      { composicao_codigo: '87878', tipo_item: 'INSUMO', item_codigo: '1379', coeficiente: 2.43, descricao: 'CIMENTO', unidade: 'KG', linha: 3 },
      { composicao_codigo: '87878', tipo_item: 'COMPOSICAO', item_codigo: '88309', coeficiente: 0.1, descricao: 'PEDREIRO COM ENCARGOS', unidade: 'H', linha: 4 },
    ]);
    expect(r.erros.map((e) => e.linha)).toEqual([5, 6]);
  });
});

describe('formato consolidado (ISD/CSD) e filtro de UF', () => {
  it('usa a coluna da UF escolhida como preço', () => {
    const m: Matriz = [
      ['Classificação', 'Código do Insumo', 'Descrição do insumo', 'Unidade', 'Origem de Preço', 'AC', 'RJ', 'SP'],
      ['MATERIAL', '370', 'AREIA MEDIA', 'M3', 'C', '100,00', '123,45', '110,00'],
    ];
    const map = sugerirMapeamento(m[0]!, 'insumos', 'RJ');
    expect(map.preco).toBe(6);
    expect(map.classificacao).toBe(0);
    expect(extrairInsumos(m, 0, map).linhas[0]).toMatchObject({ codigo: '370', preco: 123.45, classificacao: 'MATERIAL' });
    expect(sugerirMapeamento(m[0]!, 'insumos', 'SP').preco).toBe(7);
  });

  it('filtra pela coluna UF quando existir', () => {
    const m: Matriz = [
      ['UF', 'CODIGO', 'DESCRICAO', 'UNIDADE', 'PRECO'],
      ['RJ', '370', 'AREIA', 'M3', '1'],
      ['SP', '370', 'AREIA', 'M3', '2'],
    ];
    const map = sugerirMapeamento(m[0]!, 'insumos');
    expect(map.uf).toBe(0);
    const r = extrairInsumos(m, 0, map, { uf: 'RJ' });
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]!.preco).toBe(1);
    expect(r.ignoradas).toBe(1);
  });
});

describe('CSV e lotes', () => {
  it('detecta ; e aspas', () => {
    expect(parseCsv('﻿CODIGO;DESCRICAO;PRECO\r\n370;"AREIA; MEDIA ""LAVADA""";123,45\n')).toEqual([
      ['CODIGO', 'DESCRICAO', 'PRECO'],
      ['370', 'AREIA; MEDIA "LAVADA"', '123,45'],
    ]);
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('divide em lotes', () => {
    expect(emLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
