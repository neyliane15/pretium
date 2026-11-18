import { describe, expect, it } from 'vitest';
import {
  avaliarExpressao,
  calcularBdi,
  calcularItem,
  classeAbc,
  curvaAbc,
  custoComposicao,
  custoMembro,
  gerarPeriodos,
  numerarEap,
  round2,
  totalHonorarios,
  totalizarOrcamento,
  valorDisciplina,
} from './calc';

describe('round2', () => {
  it('arredonda meio para longe do zero como o Postgres', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(0.125)).toBe(0.13);
    expect(round2(-0.001)).toBe(0);
  });
});

describe('calcularBdi (TCU)', () => {
  it('aplica a fórmula do Acórdão 2622/2013', () => {
    // (1,0607 × 1,0123 × 1,074) / (1 − 0,0665) − 1 = 0,235355… → 23,54%
    const bdi = calcularBdi({ ac: 4, s: 0.4, r: 1.27, g: 0.4, df: 1.23, l: 7.4, pis: 0.65, cofins: 3, iss: 3, cprb: 0 });
    expect(bdi).toBe(23.54);
  });
  it('zera quando todos os parâmetros são zero', () => {
    expect(calcularBdi({ ac: 0, s: 0, r: 0, g: 0, df: 0, l: 0, pis: 0, cofins: 0, iss: 0, cprb: 0 })).toBe(0);
  });
  it('rejeita tributos ≥ 100%', () => {
    expect(() => calcularBdi({ ac: 0, s: 0, r: 0, g: 0, df: 0, l: 0, pis: 50, cofins: 50, iss: 0, cprb: 0 })).toThrow();
  });
});

describe('itens e totais', () => {
  it('custo de composição = round2(Σ coef × preço)', () => {
    expect(custoComposicao([{ coeficiente: 0.5, preco: 10.333 }, { coeficiente: 1.25, preco: 3.1 }, { coeficiente: 2, preco: null }])).toBe(9.04);
    expect(custoComposicao([{ coeficiente: 1, preco: null }])).toBeNull();
  });
  it('preço com BDI e totais arredondados por item', () => {
    expect(calcularItem({ quantidade: 12.345, custo_unitario: 57.89, bdi_percentual: 22.12 })).toEqual({
      custo_unitario: 57.89,
      preco_unitario: 70.7,
      total_sem_bdi: 714.65,
      total: 872.79,
    });
  });
  it('totaliza etapas com subetapas', () => {
    const r = totalizarOrcamento(
      [
        { id: 'e1', parent_id: null },
        { id: 'e11', parent_id: 'e1' },
        { id: 'e2', parent_id: null },
      ],
      [
        { etapa_id: 'e1', total_sem_bdi: 10.1, total: 12.2 },
        { etapa_id: 'e11', total_sem_bdi: 0.2, total: 0.3 },
        { etapa_id: 'e2', total_sem_bdi: 5, total: 6 },
      ],
    );
    expect(r.etapas.get('e1')).toEqual({ total_sem_bdi: 10.3, total: 12.5 });
    expect(r.total).toBe(18.5);
    expect(r.total_bdi).toBe(3.2);
  });
  it('numera a EAP', () => {
    const n = numerarEap(
      [
        { id: 'a', parent_id: null, ordem: 2 },
        { id: 'b', parent_id: null, ordem: 1 },
        { id: 'c', parent_id: 'a', ordem: 1 },
      ],
      [
        { id: 'i1', etapa_id: 'a', ordem: 1 },
        { id: 'i2', etapa_id: 'c', ordem: 1 },
      ],
    );
    expect(n.etapas.get('b')).toBe('1');
    expect(n.etapas.get('a')).toBe('2');
    expect(n.etapas.get('c')).toBe('2.1');
    expect(n.itens.get('i1')).toBe('2.2');
    expect(n.itens.get('i2')).toBe('2.1.1');
  });
});

describe('curva ABC', () => {
  it('classifica pelo acumulado anterior', () => {
    expect(classeAbc(0)).toBe('A');
    expect(classeAbc(79.99)).toBe('A');
    expect(classeAbc(80)).toBe('B');
    expect(classeAbc(95)).toBe('C');
    const linhas = [
      { id: '1', codigo: '1', total: 70 },
      { id: '2', codigo: '2', total: 15 },
      { id: '3', codigo: '3', total: 10 },
      { id: '4', codigo: '4', total: 5 },
      { id: '5', codigo: '5', total: 0 },
    ];
    const r = curvaAbc(linhas, { total: (l) => l.total, codigo: (l) => l.codigo, id: (l) => l.id });
    expect(r.map((x) => x.classe)).toEqual(['A', 'A', 'B', 'C']);
    expect(r).toHaveLength(4);
    expect(r[3]?.percentual_acumulado).toBeCloseTo(100);
  });
});

describe('mão de obra e honorários', () => {
  it('custo de membro com encargos sobre salário-hora', () => {
    expect(custoMembro({ quantidade: 2, horas_dia: 8, dias: 10, preco_insumo_hora: null, salario_hora: 10, aplicar_encargos: true }, 100)).toEqual({
      horas_totais: 160,
      custo_hora: 20,
      custo_total: 3200,
    });
  });
  it('honorários com impostos por dentro', () => {
    expect(valorDisciplina({ metodo: 'area', valor_m2: 45.5 }, 120)).toBe(5460);
    expect(valorDisciplina({ metodo: 'percentual_obra', percentual: 5 }, null, 100000)).toBe(5000);
    expect(totalHonorarios([5460, 5000], 10, 10).total).toBe(10460);
  });
});

describe('cronograma', () => {
  it('gera períodos mensais ajustando fim de mês', () => {
    const p = gerarPeriodos('2026-01-31', 'mensal', 3);
    expect(p[0]).toEqual({ periodo: 1, inicio: '2026-01-31', fim: '2026-02-27' });
    expect(p[1]?.inicio).toBe('2026-02-28');
    expect(p[2]?.inicio).toBe('2026-03-31');
  });
  it('gera períodos semanais', () => {
    expect(gerarPeriodos('2026-11-02', 'semanal', 2)[1]).toEqual({ periodo: 2, inicio: '2026-11-09', fim: '2026-11-15' });
  });
});

describe('avaliarExpressao', () => {
  it('avalia expressões pt-BR', () => {
    expect(avaliarExpressao('2*(3,50+4,20)*2,80 - 1,20x2,10')).toEqual({ ok: true, valor: 40.6 });
    expect(avaliarExpressao('-2^2')).toEqual({ ok: true, valor: -4 });
    expect(avaliarExpressao('10 / 3')).toEqual({ ok: true, valor: 3.3333 });
  });
  it('rejeita entradas inválidas', () => {
    expect(avaliarExpressao('').ok).toBe(false);
    expect(avaliarExpressao('2*(3').ok).toBe(false);
    expect(avaliarExpressao('1.234,56').ok).toBe(false);
    expect(avaliarExpressao('alert(1)').ok).toBe(false);
    expect(avaliarExpressao('5/0').ok).toBe(false);
  });
});
