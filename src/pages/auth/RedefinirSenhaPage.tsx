import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { Alert, Button, Field, LoadingBlock } from '@/components/ui';
import { authApi } from '@/api/core/auth';
import { useAuth } from '@/contexts/AuthContext';
import { redefinirSchema, type RedefinirForm } from '@/schemas/core';
import { rotas } from '@/routes';
import { AuthLayout } from './AuthLayout';
import { ForcaSenha, SenhaInput } from './SenhaInput';

/** Destino do link de recuperação: o supabase-js troca o token da URL por uma sessão (detectSessionInUrl). */
export default function RedefinirSenhaPage() {
  const { session, loading, signOut } = useAuth();
  const nav = useNavigate();
  const [erro, setErro] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RedefinirForm>({ resolver: zodResolver(redefinirSchema), defaultValues: { senha: '', confirmacao: '' } });

  const onSubmit = handleSubmit(async ({ senha }) => {
    setErro(null);
    try {
      await authApi.redefinirSenha(senha);
      await signOut();
      nav(rotas.login, { replace: true, state: { aviso: 'Senha alterada. Entre com a nova senha.' } });
    } catch (e) {
      setErro((e as Error).message);
    }
  });

  return (
    <AuthLayout eyebrow="Recuperação" titulo="Definir nova senha" subtitulo="Escolha uma senha com pelo menos 8 caracteres.">
      {loading ? (
        <LoadingBlock className="min-h-[120px]" label="Validando link…" />
      ) : !session ? (
        <div className="flex flex-col gap-3">
          <Alert variant="warning" title="Link inválido ou expirado">
            Solicite um novo e-mail de recuperação para continuar.
          </Alert>
          <Link to={rotas.recuperarSenha} className="text-center text-sm font-medium text-primary hover:underline">
            Solicitar novo link
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
          {erro && <Alert variant="danger">{erro}</Alert>}
          <Field label="Nova senha" required error={errors.senha?.message}>
            {(p) => <SenhaInput {...p} {...register('senha')} autoComplete="new-password" autoFocus />}
          </Field>
          <ForcaSenha senha={watch('senha')} />
          <Field label="Confirme a nova senha" required error={errors.confirmacao?.message}>
            {(p) => <SenhaInput {...p} {...register('confirmacao')} autoComplete="new-password" />}
          </Field>
          <Button type="submit" variant="primary" size="lg" block loading={isSubmitting} leftIcon={<KeyRound />}>
            Salvar nova senha
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
