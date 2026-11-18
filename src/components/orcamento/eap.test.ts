import { describe, expect, it } from 'vitest';
import { descendentes, montarEap, nivelEtapa, novaOrdemIrmao } from './eap';

const etapas = [
  { id: 'e1', parent_id: null, ordem: 1, nome: 'Serviços preliminares', codigo: '' },
  { id: 'e2', parent_id: null, ordem: 2, nome: 'Alvenaria', codigo: '' },
  { id: 'e21', parent_id: 'e2', ordem: 1, nome: 'Térreo', codigo: '' },
];
const itens = [
  { id: 'i1', etapa_id: 'e1', ordem: 1, quantidade: 10, custo_unitario: 12.345, bdi_percentual: 25, codigo: '' },
  { id: 'i2', etapa_id: 'e2', ordem: 1, quantidade: 3, custo_unitario: 100, bdi_percentual: 20, codigo: '' },
  { id: 'i3', etapa_id: 'e21', ordem: 1, quantidade: 2.5, custo_unitario: 40, bdi_percentual: 20, codigo: '' },
];

describe('montarEap', () => {
  it('ordena subetapas antes dos itens e numera como fn_orcamento_renumerar', () => {
    const r = montarEap(etapas, itens);
    expect(r.linhas.map((l) => `${l.codigo}:${l.id}`)).toEqual(['1:e1', '1.1:i1', '2:e2', '2.1:e21', '2.1.1:i3', '2.2:i2']);
    expect(r.linhas.find((l) => l.id === 'e2')?.nivel).toBe(1);
    expect(r.linhas.find((l) => l.id === 'i3')?.nivel).toBe(3);
  });

  it('totaliza com arredondamento por item (§8.3)', () => {
    const r = montarEap(etapas, itens);
    // i1: custo 12,35 → preço round2(12,35×1,25)=15,44 → total 154,40; sem BDI 123,50
    const i1 = r.linhas.find((l) => l.id === 'i1');
    expect(i1 && i1.tipo === 'item' && i1.total).toBe(154.4);
    // e2 = i2 (3×120=360) + e21 (2,5×48=120) = 480
    const e2 = r.linhas.find((l) => l.id === 'e2');
    expect(e2?.total).toBe(480);
    expect(r.total).toBe(634.4);
    expect(r.total_sem_bdi).toBe(123.5 + 300 + 100);
    expect(r.total_bdi).toBe(110.9);
    expect(e2?.tipo === 'etapa' && e2.qtdItens).toBe(2);
  });

  it('recolhe etapas mantendo totais', () => {
    const r = montarEap(etapas, itens, new Set(['e2']));
    expect(r.linhas.map((l) => l.id)).toEqual(['e1', 'i1', 'e2']);
    expect(r.total).toBe(634.4);
  });

  it('percentuais somam 100 nas etapas de 1º nível', () => {
    const r = montarEap(etapas, itens);
    const soma = r.linhas.filter((l) => l.tipo === 'etapa' && l.nivel === 1).reduce((s, l) => s + l.percentual, 0);
    expect(soma).toBeCloseTo(100, 8);
  });
});

describe('utilitários da EAP', () => {
  it('descendentes e nível', () => {
    expect(descendentes(etapas, itens, 'e2')).toEqual({ etapas: ['e2', 'e21'], itens: ['i2', 'i3'] });
    expect(nivelEtapa(etapas, 'e21')).toBe(2);
  });
  it('nova ordem ao mover entre irmãos', () => {
    const irmaos = etapas.filter((e) => e.parent_id === null);
    expect(novaOrdemIrmao(irmaos, 'e2', -1)).toBe(1);
    expect(novaOrdemIrmao(irmaos, 'e1', -1)).toBeNull();
    expect(novaOrdemIrmao(irmaos, 'e1', 1)).toBe(2);
  });
});
