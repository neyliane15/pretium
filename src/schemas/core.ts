/** Esquemas zod do núcleo (auth, perfil, organização, clientes). Mensagens pt-BR. Dono: FRONTEND-1. */
import { z } from 'zod';
import { documentoValido, somenteDigitos } from '@/lib/format';

const vazioParaNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const textoOpcional = z.preprocess(vazioParaNull, z.string().trim().nullable());
const email = z.string().trim().min(1, 'Informe o e-mail.').email('E-mail inválido.');
const emailOpcional = z.preprocess(vazioParaNull, z.string().trim().email('E-mail inválido.').nullable());
const uf = z.preprocess(vazioParaNull, z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'UF inválida.').nullable());
const cep = z.preprocess(
  (v) => (typeof v === 'string' ? somenteDigitos(v) || null : v),
  z.string().length(8, 'CEP deve ter 8 dígitos.').nullable(),
);
const telefone = z.preprocess(
  (v) => (typeof v === 'string' ? somenteDigitos(v) || null : v),
  z.string().min(10, 'Telefone incompleto.').max(11, 'Telefone inválido.').nullable(),
);
export const senha = z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.').max(72, 'Senha muito longa.');

// ─── Auth ─────────────────────────────────────────────────────────────────
export const loginSchema = z.object({ email, senha: z.string().min(1, 'Informe a senha.') });
export type LoginForm = z.infer<typeof loginSchema>;

export const cadastroSchema = z
  .object({
    nome: z.string().trim().min(3, 'Informe seu nome completo.'),
    email,
    senha,
    confirmacao: z.string(),
  })
  .refine((d) => d.senha === d.confirmacao, { path: ['confirmacao'], message: 'As senhas não conferem.' });
export type CadastroForm = z.infer<typeof cadastroSchema>;

export const recuperarSchema = z.object({ email });
export type RecuperarForm = z.infer<typeof recuperarSchema>;

export const redefinirSchema = z
  .object({ senha, confirmacao: z.string() })
  .refine((d) => d.senha === d.confirmacao, { path: ['confirmacao'], message: 'As senhas não conferem.' });
export type RedefinirForm = z.infer<typeof redefinirSchema>;

export const trocarSenhaSchema = z
  .object({ atual: z.string().min(1, 'Informe a senha atual.'), senha, confirmacao: z.string() })
  .refine((d) => d.senha === d.confirmacao, { path: ['confirmacao'], message: 'As senhas não conferem.' });
export type TrocarSenhaForm = z.infer<typeof trocarSenhaSchema>;

// ─── Perfil ───────────────────────────────────────────────────────────────
export const perfilSchema = z.object({
  nome: z.string().trim().min(3, 'Informe seu nome.'),
  telefone,
  crea_cau: textoOpcional,
});
export type PerfilForm = z.input<typeof perfilSchema>;

// ─── Organização ──────────────────────────────────────────────────────────
const cnpjOpcional = z.preprocess(
  (v) => (typeof v === 'string' ? somenteDigitos(v) || null : v),
  z
    .string()
    .length(14, 'CNPJ deve ter 14 dígitos.')
    .refine((d) => documentoValido(d), 'CNPJ inválido.')
    .nullable(),
);

export const criarOrganizacaoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do escritório.'),
  cnpj: cnpjOpcional,
});
export type CriarOrganizacaoForm = z.input<typeof criarOrganizacaoSchema>;

export const organizacaoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.'),
  razao_social: textoOpcional,
  cnpj: cnpjOpcional,
  email: emailOpcional,
  telefone,
  site: textoOpcional,
  cep,
  logradouro: textoOpcional,
  numero: textoOpcional,
  complemento: textoOpcional,
  bairro: textoOpcional,
  municipio: textoOpcional,
  uf,
  uf_padrao: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'UF inválida.'),
  regime_padrao: z.enum(['nao_desonerado', 'desonerado']),
  responsavel_tecnico: textoOpcional,
  crea_cau: textoOpcional,
});
export type OrganizacaoForm = z.input<typeof organizacaoSchema>;
export type OrganizacaoDados = z.output<typeof organizacaoSchema>;

export const conviteSchema = z.object({ email, papel: z.enum(['owner', 'editor', 'viewer']) });
export type ConviteForm = z.infer<typeof conviteSchema>;

// ─── Clientes ─────────────────────────────────────────────────────────────
export const clienteSchema = z
  .object({
    tipo: z.enum(['PF', 'PJ']),
    nome: z.string().trim().min(2, 'Informe o nome ou razão social.'),
    nome_fantasia: textoOpcional,
    documento: z.preprocess((v) => (typeof v === 'string' ? somenteDigitos(v) || null : v), z.string().nullable()),
    inscricao_estadual: textoOpcional,
    email: emailOpcional,
    telefone,
    contato_nome: textoOpcional,
    cep,
    logradouro: textoOpcional,
    numero: textoOpcional,
    complemento: textoOpcional,
    bairro: textoOpcional,
    municipio: textoOpcional,
    uf,
    observacoes: textoOpcional,
    ativo: z.boolean(),
  })
  .superRefine((d, ctx) => {
    if (!d.documento) return;
    const esperado = d.tipo === 'PF' ? 11 : 14;
    if (d.documento.length !== esperado || !documentoValido(d.documento)) {
      ctx.addIssue({ code: 'custom', path: ['documento'], message: d.tipo === 'PF' ? 'CPF inválido.' : 'CNPJ inválido.' });
    }
  });
export type ClienteForm = z.input<typeof clienteSchema>;
export type ClienteDados = z.output<typeof clienteSchema>;
