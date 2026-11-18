import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, Mail } from 'lucide-react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { authApi } from '@/api/core/auth';
import { useAuth } from '@/contexts/AuthContext';
import { loginSchema, type LoginForm } from '@/schemas/core';
import { rotas } from '@/routes';
import { AuthLayout } from './AuthLayout';

/** Login por e-mail e senha. Dono: FRONTEND-1. */
export default function LoginPage() {
  const { session } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [erro, setErro] = useState<string | null>(null);
  const [ver, setVer] = useState(false);
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
          {(p) => (
            <div className="relative">
              <Input {...p} {...register('senha')} type={ver ? 'text' : 'password'} autoComplete="current-password" className="pr-8" />
              <button
                type="button"
                onClick={() => setVer((v) => !v)}
                aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute inset-y-0 right-1 my-auto flex h-6 w-6 items-center justify-center rounded-sm text-fg-subtle hover:bg-sunken hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ver ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={isSubmitting} leftIcon={<LogIn />} className="mt-1">
          Entrar
        </Button>
      </form>
    </AuthLayout>
  );
}
