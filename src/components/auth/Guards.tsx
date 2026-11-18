import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { LoadingBlock } from '@/components/ui';
import { rotas } from '@/routes';

/**
 * Guardas de rota. Dono: FRONTEND-1.
 * Ordem no App: RequireAuth → RequireActive → RequireOrg → (RequireAdmin)
 */
function FullLoading() {
  return <LoadingBlock className="min-h-screen" label="Carregando Pretium…" />;
}

export function RequireAuth({ children }: { children?: ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <FullLoading />;
  if (!session) return <Navigate to={rotas.login} replace state={{ from: loc.pathname + loc.search }} />;
  return children ?? <Outlet />;
}

export function RequireActive({ children }: { children?: ReactNode }) {
  const { status, loading } = useAuth();
  if (loading) return <FullLoading />;
  if (status === 'pending') return <Navigate to={rotas.aguardandoAprovacao} replace />;
  if (status === 'blocked') return <Navigate to={rotas.bloqueado} replace />;
  return children ?? <Outlet />;
}

export function RequireOrg({ children }: { children?: ReactNode }) {
  const { organizacao, loading } = useOrganizacao();
  const { isAdmin } = useAuth();
  if (loading) return <FullLoading />;
  // admin pode navegar sem organização (vai direto ao painel admin)
  if (!organizacao && !isAdmin) return <Navigate to={rotas.onboardingOrganizacao} replace />;
  return children ?? <Outlet />;
}

export function RequireAdmin({ children }: { children?: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <FullLoading />;
  if (!isAdmin) return <Navigate to={rotas.dashboard} replace />;
  return children ?? <Outlet />;
}
