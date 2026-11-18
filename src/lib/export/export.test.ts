import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { BOM, campoCsv, numeroCsv, tabelaParaCsv } from './csv';
import { nomeAba, tabelasParaWorkbook } from './xlsx';
import { nomeArquivo, type TabelaExport } from './tabela';
import { montarGradeCronograma, tabelaAbcServicos, tabelaCronograma, tabelaSintetico } from './relatorios';
import type { CronogramaLinha, CurvaAbcServico } from '@/types/database';

const meta = {
  orcamento: 'Residência Silva', obra: 'Casa', organizacao: 'Escritório X',
  dataBase: { uf: 'RJ', ano: 2026, mes: 9, regime: 'nao_desonerado' as const, is_demo: true }, bdi: 22.12,
};

describe('CSV pt-BR', () => {
  it('formata números com vírgula decimal e sem milhar', () => {
    expect(numeroCsv(1234567.891, 2)).toBe('1234567,89');
    expect(numeroCsv(-0.5, 2)).toBe('-0,50');
    expect(numeroCsv(1.005, 2)).toBe('1,01');
    expect(numeroCsv(3, 0)).toBe('3');
  });
  it('escapa campos com ; e aspas', () => {
    expect(campoCsv('a;b')).toBe('"a;b"');
    expect(campoCsv('pol 1/2"')).toBe('"pol 1/2"""');
    expect(campoCsv('simples')).toBe('simples');
  });
  it('gera BOM, cabeçalho e separador ;', () => {
    const t: TabelaExport = {
      nome: 'x', titulo: 'Teste', meta: [['Obra', 'A']],
      colunas: [{ chave: 'd', rotulo: 'Descrição', tipo: 'texto' }, { chave: 'v', rotulo: 'Valor', tipo: 'moeda' }],
      linhas: [{ valores: { d: 'Item; 1', v: 10.5 } }, { valores: { d: 'Vazio', v: null } }],
    };
    const csv = tabelaParaCsv(t);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toContain('Descrição;Valor\r\n"Item; 1";10,50\r\nVazio;\r\n');
    expect(csv).toContain('Obra;A');
  });
});

describe('XLSX', () => {
  it('cria abas com células numéricas formatadas', () => {
    const t = tabelaSintetico(
      meta,
      [
        { tipo: 'etapa', nivel: 1, codigo: '1', descricao: 'Preliminares', total_sem_bdi: 100, total: 125, percentual: 100 },
        { tipo: 'item', nivel: 2, codigo: '1.1', descricao: 'Placa', fonte: 'SINAPI', referencia_codigo: '74209', unidade: 'M2', quantidade: 2, custo_unitario: 50, bdi_percentual: 25, preco_unitario: 62.5, total_sem_bdi: 100, total: 125, percentual: 100 },
      ],
      { total_sem_bdi: 100, total: 125 },
    );
    const wb = tabelasParaWorkbook([t, t]);
    expect(wb.SheetNames).toEqual(['Sintético', 'Sintético (2)']);
    const ws = wb.Sheets['Sintético']!;
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1 });
    const hdr = rows.findIndex((r) => r[0] === 'Item');
    expect(hdr).toBeGreaterThan(0);
    const item = rows[hdr + 2]!;
    expect(item[9]).toBe(125);
    expect(rows.some((r) => r[0] === 'Aviso')).toBe(true);
    const cell = ws[XLSX.utils.encode_cell({ r: hdr + 2, c: 9 })] as XLSX.CellObject;
    expect(cell.t).toBe('n');
    expect(cell.z).toBe('#,##0.00');
  });
  it('nomes de aba e arquivo seguros', () => {
    expect(nomeAba('a/b:c*'.repeat(10)).length).toBeLessThanOrEqual(31);
    expect(nomeArquivo('Orçamento sintético – Casa X')).toBe('orcamento-sintetico-casa-x');
  });
});

describe('relatórios', () => {
  it('curva ABC de serviços', () => {
    const l: CurvaAbcServico = { posicao: 1, item_id: 'i', codigo: '1.1', referencia_codigo: '87503', descricao: 'Alvenaria', unidade: 'M2', quantidade: 10, preco_unitario: 80, total: 800, percentual: 100, percentual_acumulado: 100, classe: 'A' };
    const t = tabelaAbcServicos(meta, [l]);
    expect(t.linhas[0]!.valores.classe).toBe('A');
    expect(t.colunas.map((c) => c.chave)).toContain('acum');
  });
  it('grade do cronograma com totais por período e acumulado', () => {
    const base = { data_inicio: '2026-01-01', data_fim: '2026-01-31', percentual_acumulado: 0, valor_acumulado: 0 };
    const linhas: CronogramaLinha[] = [
      { ...base, etapa_id: 'a', etapa_codigo: '1', etapa_nome: 'A', etapa_total: 1000, periodo: 1, percentual: 50, valor: 500 },
      { ...base, etapa_id: 'a', etapa_codigo: '1', etapa_nome: 'A', etapa_total: 1000, periodo: 2, percentual: 50, valor: 500, data_inicio: '2026-02-01', data_fim: '2026-02-28' },
      { ...base, etapa_id: 'b', etapa_codigo: '2', etapa_nome: 'B', etapa_total: 500, periodo: 1, percentual: 0, valor: 0 },
      { ...base, etapa_id: 'b', etapa_codigo: '2', etapa_nome: 'B', etapa_total: 500, periodo: 2, percentual: 100, valor: 500, data_inicio: '2026-02-01', data_fim: '2026-02-28' },
    ];
    const g = montarGradeCronograma(linhas);
    expect(g.total).toBe(1500);
    expect(g.totaisPeriodo.map((t) => t.valor)).toEqual([500, 1000]);
    expect(g.totaisPeriodo[1]!.percentualAcumulado).toBeCloseTo(100);
    const t = tabelaCronograma(meta, g);
    expect(t.colunas).toHaveLength(3 + 4);
    expect(t.linhas.at(-1)!.valores.v2).toBe(1500);
  });
});
