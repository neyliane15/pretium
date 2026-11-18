import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, LogOut, Mail } from 'lucide-react';
import { Alert, Badge, Button, Field, Input, useToast } from '@/components/ui';
import { useCriarOrganizacao, useMeusConvites } from '@/api/core/organizacao';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { formatDocumento } from '@/lib/format';
import { LABEL_ORG_ROLE } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import { criarOrganizacaoSchema, type CriarOrganizacaoForm } from '@/schemas/core';
import { rotas } from '@/routes';
import { AuthLayout } from '@/pages/auth/AuthLayout';

/** Onboarding: aceitar convite pendente ou criar o próprio escritório. Dono: FRONTEND-1. */
export default function CriarOrganizacaoPage() {
  const { signOut, profile } = useAuth();
  const { organizacao, organizacoes } = useOrganizacao();
  const { data: convites = [] } = useMeusConvites();
  const criar = useCriarOrganizacao();
  const nav = useNavigate();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CriarOrganizacaoForm>({ resolver: zodResolver(criarOrganizacaoSchema), defaultValues: { nome: '', cnpj: '' } });

  // "Criar nova organização" a partir da Topbar também usa esta tela (usuário já tem org)
  const primeira = !organizacao && organizacoes.length === 0;

  const onSubmit = handleSubmit((d) => {
    const dados = criarOrganizacaoSchema.parse(d);
    criar.mutate(dados, {
      onSuccess: () => {
        toast.success('Escritório criado', dados.nome);
        nav(rotas.dashboard, { replace: true });
      },
      onError: (e) => toast.error('Não foi possível criar o escritório', mensagemErro(e)),
    });
  });

  return (
    <AuthLayout
      eyebrow={primeira ? 'Primeiros passos' : 'Nova organização'}
      titulo={primeira ? 'Configure seu escritório' : 'Criar organização'}
      subtitulo="Orçamentos, obras e clientes ficam organizados por escritório. Você poderá convidar sua equipe depois."
      largura={420}
      rodape={
        primeira ? (
          <button type="button" className="inline-flex items-center gap-1 hover:text-fg hover:underline" onClick={() => void signOut()}>
            <LogOut className="h-3.5 w-3.5" aria-hidden /> Sair ({profile?.email})
          </button>
        ) : (
          <Link to={rotas.dashboard} className="hover:text-fg hover:underline">
            Cancelar
          </Link>
        )
      }
    >
      {convites.length > 0 && (
        <div className="mb-5">
          <div className="mb-2 font-mono text-2xs uppercase tracking-[0.1em] text-fg-subtle">Convites pendentes</div>
          <ul className="flex flex-col gap-1.5">
            {convites.map((c) => (
              <li key={c.id}>
                <Link
                  to={rotas.convite(c.token)}
                  className="group flex items-center gap-3 rounded-sm border border-border bg-surface-2 px-3 py-2 hover:border-brand hover:bg-primary-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Mail className="h-4 w-4 text-brand" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-base font-medium">{c.organizacao_nome}</span>
                  <Badge variant="outline">{LABEL_ORG_ROLE[c.papel]}</Badge>
                  <ArrowRight className="h-3.5 w-3.5 text-fg-subtle group-hover:text-fg" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.1em] text-fg-subtle">
            <span className="h-px flex-1 bg-border" /> ou crie o seu <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        {criar.isError && <Alert variant="danger">{mensagemErro(criar.error)}</Alert>}
        <Field label="Nome do escritório" required error={errors.nome?.message}>
          {(p) => <Input {...p} {...register('nome')} autoFocus placeholder="Ex.: Silva Engenharia" prefix={<Building2 />} />}
        </Field>
        <Field label="CNPJ" hint="Opcional — aparece nos relatórios." error={errors.cnpj?.message}>
          {(p) => (
            <Input
              {...p}
              {...register('cnpj', { onBlur: (e) => setValue('cnpj', formatDocumento(e.target.value, '')) })}
              inputMode="numeric"
              placeholder="00.000.000/0000-00"
              className="num"
            />
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={criar.isPending} rightIcon={<ArrowRight />}>
          Criar e continuar
        </Button>
      </form>
    </AuthLayout>
  );
}
