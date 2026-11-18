import { describe, expect, it } from 'vitest';
import { insumoProprioSchema, obraSchema } from './orcamento';

describe('schemas de orçamento — validação idempotente', () => {
  it('obra com campos de texto vazios pode ser validada duas vezes (regressão: "não salva a obra")', () => {
    const entrada = {
      codigo: '', nome: 'TESTE', descricao: 'x', tipo_obra: 'Comercial', status: 'planejamento' as const, cliente_id: null,
      cep: '', logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', uf: 'RJ' as const,
      area_construida_m2: 800, area_terreno_m2: 500, data_inicio_prevista: null, data_fim_prevista: '2027-11-18',
      responsavel_tecnico: 'TESTE', crea_cau: '1234', art_rrt: '123', observacoes: '',
    };
    const uma = obraSchema.parse(entrada);
    expect(uma.cep).toBeNull();
    expect(obraSchema.parse(uma)).toEqual(uma);
  });

  it('insumo próprio sem classificação pode ser validado duas vezes', () => {
    const uma = insumoProprioSchema.parse({ codigo: 'P1', descricao: 'Porcelanato', unidade: 'M2', tipo: 'material', classificacao: '', preco_proprio: 10, preco_proprio_data: null, ativo: true });
    expect(insumoProprioSchema.parse(uma)).toEqual(uma);
  });
});
