import { Outlet } from 'react-router-dom';
import { PageHeader, TabLinks } from '@/components/ui';
import { rotas } from '@/routes';

/** Dono: FRONTEND-1. Moldura das páginas /admin/*. */
export default function AdminLayout() {
  return (
    <>
      <PageHeader title="Administração" description="Controle global do Pretium.">
        <TabLinks
          items={[
            { to: rotas.admin, label: 'Visão geral', end: true },
            { to: rotas.adminUsuarios, label: 'Usuários' },
            { to: rotas.adminOrganizacoes, label: 'Organizações' },
            { to: rotas.adminSinapi, label: 'Tabelas SINAPI' },
            { to: rotas.adminAuditoria, label: 'Auditoria' },
            { to: rotas.adminConfiguracoes, label: 'Configurações' },
          ]}
        />
      </PageHeader>
      <Outlet />
    </>
  );
}
