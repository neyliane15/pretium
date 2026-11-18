/** Esquemas zod do domínio de obras/orçamento (FRONTEND-2). Mensagens pt-BR. */
import { z } from 'zod';
import { UFS } from '@/lib/labels';

const textoOpc = z.string().trim().max(500).optional().transform((v) => (v ? v : null));
const numOpc = z.number({ invalid_type_error: 'Informe um número' }).nonnegative('Não pode ser negativo').nullable();
const dataOpc = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida').nullable();

export const obraSchema = z
  .object({
    codigo: textoOpc,
    nome: z.string().trim().min(2, 'Informe o nome da obra').max(200),
    descricao: textoOpc,
    tipo_obra: textoOpc,
    status: z.enum(['planejamento', 'orcamento', 'em_execucao', 'paralisada', 'concluida', 'cancelada']),
    cliente_id: z.string().uuid().nullable(),
    cep: textoOpc,
    logradouro: textoOpc,
    numero: textoOpc,
    complemento: textoOpc,
    bairro: textoOpc,
    municipio: textoOpc,
    uf: z.enum(UFS, { errorMap: () => ({ message: 'UF inválida' }) }),
    area_construida_m2: numOpc,
    area_terreno_m2: numOpc,
    data_inicio_prevista: dataOpc,
    data_fim_prevista: dataOpc,
    responsavel_tecnico: textoOpc,
    crea_cau: textoOpc,
    art_rrt: textoOpc,
    observacoes: z.string().trim().max(4000).optional().transform((v) => (v ? v : null)),
  })
  .refine((o) => !o.data_inicio_prevista || !o.data_fim_prevista || o.data_fim_prevista >= o.data_inicio_prevista, {
    message: 'O término deve ser posterior ao início',
    path: ['data_fim_prevista'],
  });
export type ObraForm = z.input<typeof obraSchema>;
export type ObraDados = z.output<typeof obraSchema>;

export const novoOrcamentoSchema = z.object({
  obra_id: z.string().uuid('Selecione a obra'),
  nome: z.string().trim().min(2, 'Informe o nome do orçamento').max(200),
  data_base_id: z.string().uuid('Selecione a data-base'),
  preset_bdi: z.enum(['edificacoes', 'fornecimento_materiais', 'zero']),
});
export type NovoOrcamentoForm = z.infer<typeof novoOrcamentoSchema>;

export const insumoProprioSchema = z.object({
  codigo: z.string().trim().min(1, 'Informe o código').max(30),
  descricao: z.string().trim().min(3, 'Informe a descrição').max(500),
  unidade: z.string().trim().min(1, 'Informe a unidade').max(10),
  tipo: z.enum(['material', 'mao_de_obra', 'equipamento', 'servico', 'taxa', 'outro']),
  classificacao: textoOpc,
  preco_proprio: numOpc,
  preco_proprio_data: dataOpc,
  ativo: z.boolean(),
});
export type InsumoProprioForm = z.input<typeof insumoProprioSchema>;

export const medicaoSchema = z
  .object({ inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe o início'), fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe o fim') })
  .refine((m) => m.fim >= m.inicio, { message: 'O fim deve ser igual ou posterior ao início', path: ['fim'] });
