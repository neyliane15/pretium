import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Hourglass, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { formatDataHora } from '@/lib/format';
import { rotas } from '@/routes';
import { AuthLayout } from './AuthLayout';

/** Conta criada aguardando aprovação do administrador. */
export default function AguardandoAprovacaoPage() {
  const { profile, status, signOut, refreshProfile } = useAuth();
  const [verificando, setVerificando] = useState(false);
  if (status === 'active') return <Navigate to={rotas.dashboard} replace />;
  if (status === 'blocked') return <Navigate to={rotas.bloqueado} replace />;

  return (
    <AuthLayout eyebrow="Conta pendente" titulo="Aguardando aprovação">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-accent/50 bg-accent-soft text-warning">
            <Hourglass className="h-4.5 w-4.5" aria-hidden />
          </span>
          <p className="text-base text-fg-muted">
            Sua conta <strong className="font-medium text-fg">{profile?.email}</strong> foi criada e está em análise. Você receberá acesso assim que um
            administrador aprovar o cadastro.
          </p>
        </div>
        <dl className="grid grid-cols-2 rounded-sm border border-border font-mono text-2xs uppercase tracking-[0.08em]">
          <div className="border-r border-border px-3 py-2">
            <dt className="text-fg-subtle">Situação</dt>
            <dd className="mt-0.5 normal-case tracking-normal text-warning">Pendente</dd>
          </div>
          <div className="px-3 py-2">
            <dt className="text-fg-subtle">Cadastro</dt>
            <dd className="num mt-0.5 normal-case tracking-normal text-fg">{formatDataHora(profile?.created_at)}</dd>
          </div>
        </dl>
        <div className="flex gap-2">
          <Button
            block
            leftIcon={<RefreshCw />}
            loading={verificando}
            onClick={async () => {
              setVerificando(true);
              await refreshProfile();
              setVerificando(false);
            }}
          >
            Verificar novamente
          </Button>
          <Button block variant="ghost" leftIcon={<LogOut />} onClick={() => void signOut()}>
            Sair
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
