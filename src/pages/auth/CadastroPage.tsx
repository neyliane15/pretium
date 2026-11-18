import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate } from 'react-router-dom';
import { MailCheck, UserPlus } from 'lucide-react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { authApi } from '@/api/core/auth';
import { useAuth } from '@/contexts/AuthContext';
import { cadastroSchema, type CadastroForm } from '@/schemas/core';
import { rotas } from '@/routes';
import { AuthLayout } from './AuthLayout';
import { ForcaSenha, SenhaInput } from './SenhaInput';

/** Cadastro (nome, e-mail, senha ≥ 8, confirmação). Novos usuários entram "pendentes" se a aprovação for obrigatória. */
export default function CadastroPage() {
  const { session } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CadastroForm>({ resolver: zodResolver(cadastroSchema), defaultValues: { nome: '', email: '', senha: '', confirmacao: '' } });

  if (session) return <Navigate to={rotas.dashboard} replace />;

  const onSubmit = handleSubmit(async ({ nome, email, senha }) => {
    setErro(null);
    try {
      await authApi.cadastrar(nome, email, senha);
      setEnviadoPara(email);
    } catch (e) {
      setErro((e as Error).message);
    }
  });

  if (enviadoPara) {
    return (
      <AuthLayout eyebrow="Cadastro" titulo="Confirme seu e-mail" rodape={<Link to={rotas.login} className="font-medium text-primary hover:underline">Voltar para o login</Link>}>
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded border border-border bg-surface-2 text-brand">
            <MailCheck className="h-5 w-5" aria-hidden />
          </span>
          <p className="text-base text-fg">
            Enviamos um link de confirmação para <strong className="font-medium">{enviadoPara}</strong>.
          </p>
          <p className="text-sm text-fg-muted">
            Depois de confirmar, sua conta poderá precisar de aprovação de um administrador antes do primeiro acesso.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Cadastro"
      titulo="Criar conta"
      subtitulo="Para engenheiros, arquitetos e escritórios de orçamento."
      largura={400}
      rodape={
        <>
          Já tem conta?{' '}
          <Link to={rotas.login} className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        {erro && <Alert variant="danger">{erro}</Alert>}
        <Field label="Nome completo" required error={errors.nome?.message}>
          {(p) => <Input {...p} {...register('nome')} autoComplete="name" autoFocus />}
        </Field>
        <Field label="E-mail profissional" required error={errors.email?.message}>
          {(p) => <Input {...p} {...register('email')} type="email" autoComplete="email" />}
        </Field>
        <Field label="Senha" required error={errors.senha?.message} hint={!errors.senha ? 'Mínimo de 8 caracteres.' : undefined}>
          {(p) => <SenhaInput {...p} {...register('senha')} autoComplete="new-password" />}
        </Field>
        <ForcaSenha senha={watch('senha')} />
        <Field label="Confirme a senha" required error={errors.confirmacao?.message}>
          {(p) => <SenhaInput {...p} {...register('confirmacao')} autoComplete="new-password" />}
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={isSubmitting} leftIcon={<UserPlus />} className="mt-1">
          Criar conta
        </Button>
        <p className="text-center text-xs text-fg-subtle">Ao criar a conta, você concorda com o uso dos seus dados para operação do sistema.</p>
      </form>
    </AuthLayout>
  );
}
