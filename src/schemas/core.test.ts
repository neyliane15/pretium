import { describe, expect, it } from 'vitest';
import { cadastroSchema, clienteSchema, criarOrganizacaoSchema } from './core';

const baseCliente = {
  tipo: 'PJ' as const, nome: 'Construtora X', nome_fantasia: '', documento: '', inscricao_estadual: '', email: '', telefone: '',
  contato_nome: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', uf: '', observacoes: '', ativo: true,
};

describe('schemas do núcleo', () => {
  it('cadastro exige senha ≥ 8 e confirmação igual', () => {
    expect(cadastroSchema.safeParse({ nome: 'Ana Souza', email: 'ana@x.com', senha: '1234567', confirmacao: '1234567' }).success).toBe(false);
    const r = cadastroSchema.safeParse({ nome: 'Ana Souza', email: 'ana@x.com', senha: '12345678', confirmacao: '12345679' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['confirmacao']);
  });

  it('cliente: vazios viram null e documento é validado pelo tipo', () => {
    const ok = clienteSchema.parse({ ...baseCliente, documento: '11.222.333/0001-81', telefone: '(21) 99999-0000' });
    expect(ok.documento).toBe('11222333000181');
    expect(ok.email).toBeNull();
    expect(ok.telefone).toBe('21999990000');
    expect(clienteSchema.safeParse({ ...baseCliente, documento: '11.222.333/0001-82' }).success).toBe(false);
    expect(clienteSchema.safeParse({ ...baseCliente, tipo: 'PF', documento: '529.982.247-25' }).success).toBe(true);
    expect(clienteSchema.safeParse({ ...baseCliente, tipo: 'PF', documento: '11.222.333/0001-81' }).success).toBe(false);
  });

  it('organização: CNPJ opcional', () => {
    expect(criarOrganizacaoSchema.parse({ nome: 'Silva Eng', cnpj: '' }).cnpj).toBeNull();
    expect(criarOrganizacaoSchema.safeParse({ nome: 'Silva Eng', cnpj: '123' }).success).toBe(false);
  });
});
