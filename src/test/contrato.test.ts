/** Parser de `select` do PostgREST usado por scripts/verificar-contrato.mjs (agente TESTES). */
import { describe, expect, it } from 'vitest';
import { parseSelect } from '../../scripts/contrato/extrair.mjs';

describe('parseSelect (verificador de contrato)', () => {
  it('colunas, estrela, alias e cast', () => {
    expect(parseSelect('*, id, total:valor, preco::text')).toEqual([
      { tipo: 'estrela' },
      { tipo: 'coluna', alias: null, coluna: 'id' },
      { tipo: 'coluna', alias: 'total', coluna: 'valor' },
      { tipo: 'coluna', alias: null, coluna: 'preco' },
    ]);
  });

  it('embeds com alias, dica de FK, !inner e count', () => {
    expect(parseSelect('*, membros:organizacao_membros(count), item:orcamento_itens!orcamento_item_memorias_item_id_fkey!inner(orcamento_id)')).toEqual([
      { tipo: 'estrela' },
      { tipo: 'embed', alias: 'membros', tabela: 'organizacao_membros', dicas: [], filhos: [{ tipo: 'count' }] },
      {
        tipo: 'embed', alias: 'item', tabela: 'orcamento_itens', dicas: ['orcamento_item_memorias_item_id_fkey', 'inner'],
        filhos: [{ tipo: 'coluna', alias: null, coluna: 'orcamento_id' }],
      },
    ]);
  });

  it('embeds aninhados e espaços/quebras de linha', () => {
    const r = parseSelect(`id,
      obra:obras(id, cliente:clientes(nome))`);
    expect(r[1]).toMatchObject({ tipo: 'embed', tabela: 'obras', filhos: [{ coluna: 'id' }, { tipo: 'embed', alias: 'cliente', tabela: 'clientes', filhos: [{ coluna: 'nome' }] }] });
  });
});
