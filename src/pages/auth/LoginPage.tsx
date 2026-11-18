import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogIn, Mail } from 'lucide-react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { authApi } from '@/api/core/auth';
import { useAuth } from '@/contexts/AuthContext';
import { loginSchema, type LoginForm } from '@/schemas/core';
import { rotas } from '@/routes';
import { AuthLayout } from './AuthLayout';
import { SenhaInput } from './SenhaInput';

/** Login por e-mail e senha. Dono: FRONTEND-1. */
export default function LoginPage() {
  const { session } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [erro, setErro] = useState<string | null>(null);
  const estado = loc.state as { from?: string; aviso?: string } | null;
  const destino = estado?.from ?? rotas.dashboard;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', senha: '' } });

  if (session) return <Navigate to={destino} replace />;

  const onSubmit = handleSubmit(async ({ email, senha }) => {
    setErro(null);
    try {
      await authApi.entrar(email, senha);
      nav(destino, { replace: true });
    } catch (e) {
      setErro((e as Error).message);
    }
  });

  return (
    <AuthLayout
      eyebrow="Acesso"
      titulo="Entrar no Pretium"
      subtitulo="Acesse seus orçamentos, obras e clientes."
      rodape={
        <>
          Ainda não tem conta?{' '}
          <Link to={rotas.cadastro} className="font-medium text-primary hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        {estado?.aviso && <Alert variant="success">{estado.aviso}</Alert>}
        {erro && <Alert variant="danger">{erro}</Alert>}
        <Field label="E-mail" required error={errors.email?.message}>
          {(p) => <Input {...p} {...register('email')} type="email" autoComplete="email" autoFocus prefix={<Mail />} placeholder="voce@escritorio.com.br" />}
        </Field>
        <Field
          label="Senha"
          required
          error={errors.senha?.message}
          labelAside={
            <Link to={rotas.recuperarSenha} className="text-xs text-fg-muted hover:text-primary hover:underline">
              Esqueci a senha
            </Link>
          }
        >
          {(p) => <SenhaInput {...p} {...register('senha')} autoComplete="current-password" />}
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={isSubmitting} leftIcon={<LogIn />} className="mt-1">
          Entrar
        </Button>
      </form>
    </AuthLayout>
  );
}
