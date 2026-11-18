import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Send } from 'lucide-react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { authApi } from '@/api/core/auth';
import { recuperarSchema, type RecuperarForm } from '@/schemas/core';
import { rotas } from '@/routes';
import { AuthLayout } from './AuthLayout';

/** Envia o e-mail de redefinição (`redirectTo = ${origin}/redefinir-senha`). */
export default function RecuperarSenhaPage() {
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecuperarForm>({ resolver: zodResolver(recuperarSchema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async ({ email }) => {
    setErro(null);
    try {
      await authApi.recuperarSenha(email);
      setEnviado(email);
    } catch (e) {
      setErro((e as Error).message);
    }
  });

  return (
    <AuthLayout
      eyebrow="Recuperação"
      titulo="Recuperar senha"
      subtitulo="Informe o e-mail da conta. Enviaremos um link para criar uma nova senha."
      rodape={
        <Link to={rotas.login} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Voltar para o login
        </Link>
      }
    >
      {enviado ? (
        <Alert variant="success" title="Verifique sua caixa de entrada">
          Se existir uma conta para <strong className="font-medium text-fg">{enviado}</strong>, você receberá o link em instantes. Confira também o spam.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
          {erro && <Alert variant="danger">{erro}</Alert>}
          <Field label="E-mail" required error={errors.email?.message}>
            {(p) => <Input {...p} {...register('email')} type="email" autoComplete="email" autoFocus prefix={<Mail />} />}
          </Field>
          <Button type="submit" variant="primary" size="lg" block loading={isSubmitting} leftIcon={<Send />}>
            Enviar link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
