import { describe, expect, it } from 'vitest';
import { distribuirLinear, paraDistribuicoes, totaisCronograma } from './cronograma';

describe('cronograma', () => {
  it('distribui linearmente fechando 100%', () => {
    const d = distribuirLinear(6, 2, 4);
    expect(d).toEqual([0, 33.3333, 33.3333, 33.3334, 0, 0]);
    expect(d.reduce((s, x) => s + x, 0)).toBeCloseTo(100, 6);
  });
  it('totaliza por período com arredondamento por célula', () => {
    const dist = new Map([['a', [50, 50]], ['b', [33.3333, 66.6667]]]);
    const t = totaisCronograma([{ id: 'a', total: 1000.01 }, { id: 'b', total: 300 }], dist, 2);
    expect(t.valores.get('a')).toEqual([500.01, 500.01]); // round2(1000,01×50%) = 500,01 (meio para cima)
    expect(t.valores.get('b')).toEqual([100, 200]);
    expect(t.porPeriodo[0]!.valor).toBe(600.01);
    expect(t.porPeriodo[1]!.acumulado).toBe(1300.02);
    expect(t.somaPct.get('b')).toBe(100);
    expect(t.total).toBe(1300.01);
  });
  it('gera distribuições só com % > 0 dentro do horizonte', () => {
    const dist = new Map([['a', [0, 40, 60, 10]]]);
    expect(paraDistribuicoes(dist, 3)).toEqual([{ etapa_id: 'a', periodo: 2, percentual: 40 }, { etapa_id: 'a', periodo: 3, percentual: 60 }]);
  });
});
