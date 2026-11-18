import { describe, expect, it, vi } from 'vitest';
import { zipSync } from 'fflate';
import * as XLSXns from 'xlsx';
import { baixarMaisRecente, baixarPacote, importarNacional, lerPacote, type Rpc, SinapiIndisponivel } from './sinapi';
import { classificarAba, colunaDaUf, escolherArquivoReferencia, mesesCandidatos, urlPacoteNacional } from '../../src/lib/sinapi/nacional';
import { UFS_BR } from '../../src/lib/sinapi/parser';

const XLSX = ((XLSXns as unknown as { default?: typeof XLSXns }).default ?? XLSXns) as typeof XLSXns;

/** Planilha nacional simulada no layout descrito para o arquivo de referência (cabeçalho na linha 10). */
function planilhaNacional(): Uint8Array {
  const topo = (titulo: string) => [[titulo], ['Mês de referência: 09/2026'], [], [], [], [], [], []];
  // ISD/ICD: UFs na própria linha de títulos, logo após "Origem de Preço"
  const insumos = (fator: number) => [
    ...topo('SINAPI - Insumos'),
    [null, null, null, null, null, ...UFS_BR.map(() => 'Preço mediano')],
    ['Classificação', 'Código do Insumo', 'Descrição do insumo', 'Unidade', 'Origem de Preço', ...UFS_BR],
    ['MATERIAL', 370, 'AREIA MEDIA - POSTO JAZIDA/FORNECEDOR', 'M3', 'C', ...UFS_BR.map((_, i) => (100 + i) * fator)],
    ['MATERIAL', 1379, 'CIMENTO PORTLAND COMPOSTO CP II-32', 'KG', 'C', ...UFS_BR.map((_, i) => (0.8 + i / 100) * fator)],
    ['MAO DE OBRA', 4750, 'PEDREIRO', 'H', 'C', ...UFS_BR.map((_, i) => (20 + i) * fator)],
  ];
  // CSD/CCD: siglas numa linha acima (2 colunas por UF: Custo, %AS)
  const composicoes = (fator: number) => [
    ...topo('SINAPI - Composições'),
    [null, null, null, null, ...UFS_BR.flatMap((u) => [u, null])],
    ['Grupo', 'Código da Composição', 'Descrição', 'Unidade', ...UFS_BR.flatMap(() => ['Custo (R$)', '%AS'])],
    ['ASSENTAMENTO', 87503, 'ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS', 'M2', ...UFS_BR.flatMap((_, i) => [(70 + i) * fator, 40])],
    ['CHAPISCO', 87878, 'CHAPISCO APLICADO EM ALVENARIAS', 'M2', ...UFS_BR.flatMap((_, i) => [(4 + i / 10) * fator, 55])],
  ];
  const analitico = [
    ...topo('SINAPI - Analítico'),
    [],
    ['Grupo', 'Código da Composição', 'Tipo Item', 'Código do Item', 'Descrição', 'Unidade', 'Coeficiente', 'Situação'],
    ['ASSENTAMENTO', 87503, null, null, 'ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS', 'M2', null, null],
    ['ASSENTAMENTO', 87503, 'INSUMO', 1379, 'CIMENTO', 'KG', 2.5, 'COM PREÇO'],
    ['ASSENTAMENTO', 87503, 'INSUMO', 4750, 'PEDREIRO', 'H', 0.8, 'COM PREÇO'],
    ['CHAPISCO', 87878, 'INSUMO', 370, 'AREIA', 'M3', 0.004, 'COM PREÇO'],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Menu']]), 'Menu');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(insumos(1)), 'ISD');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(insumos(1.1)), 'ICD');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(insumos(1.2)), 'ISE');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(composicoes(1)), 'CSD');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(composicoes(1.1)), 'CCD');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(analitico), 'Analítico');
  const xlsx = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
  return zipSync({
    'SINAPI_Referência_2026_09.xlsx': xlsx,
    'SINAPI_familias_e_coeficientes_2026_09.xlsx': new Uint8Array([1, 2, 3]),
    'leia-me.pdf': new Uint8Array([1]),
  });
}

function rpcFalso() {
  const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
  let n = 0;
  const rpc: Rpc = async (fn, args) => {
    chamadas.push({ fn, args });
    if (fn === 'fn_sinapi_iniciar_importacao') return `imp-${++n}`;
    if (fn === 'fn_sinapi_finalizar_importacao') return { data_base_id: `db-${args.p_importacao_id as string}` };
    if (fn.startsWith('fn_sinapi_importar_')) return (args.p_linhas as unknown[]).length;
    return null;
  };
  return { rpc, chamadas };
}

describe('SINAPI nacional — utilitários', () => {
  it('URL, meses candidatos e abas', () => {
    expect(urlPacoteNacional(2026, 9)).toBe('https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais/SINAPI-2026-09-formato-xlsx.zip');
    expect(mesesCandidatos(new Date(Date.UTC(2026, 0, 5)), 3)).toEqual([{ ano: 2026, mes: 1 }, { ano: 2025, mes: 12 }, { ano: 2025, mes: 11 }]);
    expect(classificarAba('CCD')).toEqual({ tipo: 'composicoes', regime: 'desonerado' });
    expect(classificarAba('ISD')).toEqual({ tipo: 'insumos', regime: 'nao_desonerado' });
    expect(classificarAba('Analítico')).toEqual({ tipo: 'analitico', regime: null });
    expect(classificarAba('ISE')).toBeNull();
    expect(escolherArquivoReferencia(['x/SINAPI_familias.xlsx', 'x/SINAPI_Referência_2026_09.xlsx'])).toBe('x/SINAPI_Referência_2026_09.xlsx');
  });

  it('coluna da UF na linha de títulos ou na linha acima', () => {
    expect(colunaDaUf([['a'], [null, 'RJ', null, 'SP'], ['Código', 'Custo', '%AS', 'Custo']], 2, 'SP')).toBe(3);
    expect(colunaDaUf([['Código', 'Descrição', 'AC', 'RJ']], 0, 'RJ')).toBe(3);
    expect(colunaDaUf([['Código', 'Descrição']], 0, 'RJ')).toBe(-1);
  });
});

describe('SINAPI nacional — pacote → importação', () => {
  it('lê o ZIP e importa a UF pedida nos dois regimes, com analítico uma vez', async () => {
    const { abas } = lerPacote(planilhaNacional());
    expect(abas.map((a) => a.nome)).toEqual(['ISD', 'ICD', 'CSD', 'CCD', 'Analítico']);

    const { rpc, chamadas } = rpcFalso();
    const r = await importarNacional(rpc, { ano: 2026, mes: 9, url: 'u', ufs: ['sp', 'RJ'], abas, analiticoJaImportado: false });
    expect(r.avisos).toEqual([]);
    expect(r.ufs.map((u) => u.uf)).toEqual(['SP', 'RJ']);
    expect(r.ufs[0]!.regimes).toEqual([
      { regime: 'nao_desonerado', insumos: 3, composicoes: 2, dataBaseId: expect.any(String) },
      { regime: 'desonerado', insumos: 3, composicoes: 2, dataBaseId: expect.any(String) },
    ]);
    expect(r.analitico).toBe(3);
    expect(chamadas.filter((c) => c.fn === 'fn_sinapi_importar_composicao_itens')).toHaveLength(1);

    // preço da coluna certa: SP é o 26º UF (índice 25) → areia = 125 (SD) e 137,5 (CD)
    const lotesIns = chamadas.filter((c) => c.fn === 'fn_sinapi_importar_insumos').map((c) => c.args.p_linhas as { codigo: string; preco: number }[]);
    expect(lotesIns[0]!.find((l) => l.codigo === '370')!.preco).toBe(125);
    expect(lotesIns[1]!.find((l) => l.codigo === '370')!.preco).toBeCloseTo(137.5);
    // composições: custo da coluna da UF (não do %AS ao lado)
    const lotesComp = chamadas.filter((c) => c.fn === 'fn_sinapi_importar_composicoes').map((c) => c.args.p_linhas as { codigo: string; custo: number }[]);
    expect(lotesComp[0]!.find((l) => l.codigo === '87503')!.custo).toBe(95);
    // RJ (índice 18)
    expect(lotesComp[2]!.find((l) => l.codigo === '87503')!.custo).toBe(88);

    // iniciar com UF/ano/mês/regime/tipo corretos; composições publicam
    const inicios = chamadas.filter((c) => c.fn === 'fn_sinapi_iniciar_importacao').map((c) => `${c.args.p_uf}|${c.args.p_regime}|${c.args.p_tipo}`);
    expect(inicios.slice(0, 3)).toEqual(['SP|nao_desonerado|insumos', 'SP|nao_desonerado|analitico', 'SP|nao_desonerado|composicoes']);
    const publica = chamadas.filter((c) => c.fn === 'fn_sinapi_finalizar_importacao').map((c) => c.args.p_publicar);
    expect(publica.filter(Boolean)).toHaveLength(4); // 2 UFs × 2 regimes
  });

  it('respeita o prazo: UFs que não couberem ficam pendentes', async () => {
    const { abas } = lerPacote(planilhaNacional());
    const { rpc } = rpcFalso();
    const r = await importarNacional(rpc, { ano: 2026, mes: 9, url: 'u', ufs: ['SP', 'MG'], abas, analiticoJaImportado: true, prazo: Date.now() - 1 });
    expect(r.pendentes).toEqual(['SP', 'MG']);
    expect(r.analitico).toBeNull();
  });

  it('cancela a importação se um lote falhar', async () => {
    const { abas } = lerPacote(planilhaNacional());
    const { rpc: base, chamadas } = rpcFalso();
    const rpc: Rpc = async (fn, args) => {
      if (fn === 'fn_sinapi_importar_insumos') throw new Error('falhou');
      return base(fn, args);
    };
    await expect(importarNacional(rpc, { ano: 2026, mes: 9, url: 'u', ufs: ['SP'], abas, analiticoJaImportado: true })).rejects.toThrow('falhou');
    expect(chamadas.some((c) => c.fn === 'fn_sinapi_cancelar_importacao')).toBe(true);
  });
});

describe('SINAPI nacional — download', () => {
  const resp = (status: number, corpo: Uint8Array | string, tipo = 'application/zip') =>
    new Response(corpo, { status, headers: { 'content-type': tipo } });

  it('404 ⇒ não publicado; 403 ⇒ indisponível; HTML ⇒ não publicado; ZIP ⇒ bytes', async () => {
    expect(await baixarPacote(2026, 9, vi.fn(async () => resp(404, 'x')) as unknown as typeof fetch)).toBeNull();
    await expect(baixarPacote(2026, 9, vi.fn(async () => resp(403, 'x')) as unknown as typeof fetch)).rejects.toBeInstanceOf(SinapiIndisponivel);
    expect(await baixarPacote(2026, 9, vi.fn(async () => resp(200, '<html>' + 'x'.repeat(2000), 'text/html')) as unknown as typeof fetch)).toBeNull();
    const zip = planilhaNacional();
    const p = await baixarPacote(2026, 9, vi.fn(async () => resp(200, zip)) as unknown as typeof fetch);
    expect(p?.bytes.length).toBe(zip.length);
  });

  it('mais recente: volta meses até achar o pacote', async () => {
    const zip = planilhaNacional();
    const f = vi.fn(async (url: string) => (url.includes('2026-08') ? resp(200, zip) : resp(404, 'x')));
    const r = await baixarMaisRecente(new Date(Date.UTC(2026, 9, 3)), f as unknown as typeof fetch);
    expect(r?.ano).toBe(2026);
    expect(r?.mes).toBe(8);
    expect(f).toHaveBeenCalledTimes(3);
  });
});

describe('SINAPI nacional — falhas de rede e nomes', () => {
  it('fetch failed ⇒ SinapiIndisponivel com o motivo', async () => {
    const erro = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET', message: 'socket hang up' } });
    const f = vi.fn(async () => {
      throw erro;
    });
    await expect(baixarPacote(2026, 10, f as unknown as typeof fetch, 2)).rejects.toThrow(/encerrou a conexão/);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('ano/mês pelo nome do arquivo', async () => {
    const { anoMesDoNome } = await import('../../src/lib/sinapi/pacote');
    expect(anoMesDoNome('SINAPI-2026-10-formato-xlsx.zip')).toEqual({ ano: 2026, mes: 10 });
    expect(anoMesDoNome('SINAPI_Referência_2026_09.xlsx')).toEqual({ ano: 2026, mes: 9 });
    expect(anoMesDoNome('planilha.xlsx')).toBeNull();
  });
});
