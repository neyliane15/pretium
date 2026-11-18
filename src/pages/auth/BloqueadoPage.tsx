import { Navigate } from 'react-router-dom';
import { Ban, LogOut } from 'lucide-react';
import { Alert, Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { rotas } from '@/routes';
import { AuthLayout } from './AuthLayout';

/** Conta bloqueada pelo administrador (exibe o motivo). */
export default function BloqueadoPage() {
  const { profile, status, signOut } = useAuth();
  if (status === 'active') return <Navigate to={rotas.dashboard} replace />;
  if (status === 'pending') return <Navigate to={rotas.aguardandoAprovacao} replace />;

  return (
    <AuthLayout eyebrow="Acesso suspenso" titulo="Conta bloqueada">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-danger/30 bg-danger-soft text-danger">
            <Ban className="h-4.5 w-4.5" aria-hidden />
          </span>
          <p className="text-base text-fg-muted">
            O acesso da conta <strong className="font-medium text-fg">{profile?.email}</strong> foi suspenso por um administrador. Se acredita que é um engano,
            entre em contato com o responsável pelo sistema.
          </p>
        </div>
        <Alert variant="danger" title="Motivo informado">
          {profile?.motivo_bloqueio || 'Nenhum motivo foi registrado.'}
        </Alert>
        <Button block variant="secondary" leftIcon={<LogOut />} onClick={() => void signOut()}>
          Sair
        </Button>
      </div>
    </AuthLayout>
  );
}
