import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, Field, Input } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { mensagemErro, supabase } from '@/lib/supabase';
import { rotas } from '@/routes';
import { AuthLayout } from './AuthLayout';

/**
 * Dono: FRONTEND-1. Versão inicial funcional (e-mail/senha) criada pelo agente de projeto para
 * destravar o desenvolvimento; F1 refina (react-hook-form + zod, mensagens, "lembrar-me").
 */
export default function LoginPage() {
  const { session } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const destino = (loc.state as { from?: string } | null)?.from ?? rotas.dashboard;

  if (session) return <Navigate to={destino} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : mensagemErro(error));
    else nav(destino, { replace: true });
  };

  return (
    <AuthLayout
      titulo="Entrar"
      subtitulo="Acesse seus orçamentos e obras."
      rodape={
        <>
          Não tem conta?{' '}
          <Link to={rotas.cadastro} className="font-medium text-primary hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        <Field label="E-mail" required>
          {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
        </Field>
        <Field
          label="Senha"
          required
          error={erro}
          labelAside={
            <Link to={rotas.recuperarSenha} className="text-xs text-fg-muted hover:text-primary hover:underline">
              Esqueci a senha
            </Link>
          }
        >
          {(p) => <Input {...p} type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />}
        </Field>
        <Button type="submit" variant="primary" block loading={enviando} className="mt-1">
          Entrar
        </Button>
      </form>
    </AuthLayout>
  );
}
