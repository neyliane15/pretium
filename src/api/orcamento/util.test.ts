import { describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/OrganizacaoContext', () => ({ useOrganizacao: () => ({ organizacao: null }) }));

import { buscarTodas } from './util';

/** Simula o PostgREST com `max_rows`: cada página devolve no máximo `limite` linhas do intervalo pedido. */
function servidor(total: number, limite: number) {
  const linhas = Array.from({ length: total }, (_, i) => i);
  const pedidos: [number, number][] = [];
  const pagina = async (de: number, ate: number) => {
    pedidos.push([de, ate]);
    return { data: linhas.slice(de, Math.min(ate + 1, de + limite)), error: null };
  };
  return { pagina, pedidos };
}

describe('buscarTodas (paginação por range)', () => {
  it('junta todos os lotes até esgotar, sem truncar em max_rows', async () => {
    const s = servidor(12_345, 5000);
    const r = await buscarTodas(s.pagina);
    expect(r).toHaveLength(12_345);
    expect(r[12_344]).toBe(12_344);
    expect(s.pedidos).toEqual(Array.from({ length: 13 }, (_, k) => [k * 1000, k * 1000 + 999]));
  });

  it('uma única requisição quando cabe num lote; vazio devolve []', async () => {
    const s = servidor(7, 5000);
    expect(await buscarTodas(s.pagina)).toHaveLength(7);
    expect(s.pedidos).toHaveLength(1);
    expect(await buscarTodas(servidor(0, 5000).pagina)).toEqual([]);
  });

  it('total múltiplo exato do lote faz uma requisição extra vazia e para', async () => {
    const s = servidor(2000, 5000);
    expect(await buscarTodas(s.pagina)).toHaveLength(2000);
    expect(s.pedidos).toHaveLength(3);
  });

  it('propaga o erro do PostgREST', async () => {
    const erro = { message: 'falhou', code: '42501' };
    await expect(buscarTodas(async () => ({ data: null, error: erro }))).rejects.toBe(erro);
  });
});
