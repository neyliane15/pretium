import { Outlet } from 'react-router-dom';
import { ClipboardList, FileSpreadsheet, LayoutGrid, Settings, ShieldCheck, Building2, Users } from 'lucide-react';
import { Badge, PageHeader, TabLinks } from '@/components/ui';
import { rotas } from '@/routes';

/** Dono: FRONTEND-1. Moldura das páginas /admin/*. */
export default function AdminLayout() {
  return (
    <>
      <PageHeader
        title="Administração"
        description="Controle global do Pretium: contas, organizações, tabelas de referência e auditoria."
        breadcrumbs={[{ label: 'Administração' }]}
        badges={
          <Badge variant="brand" className="gap-1">
            <ShieldCheck className="h-3 w-3" aria-hidden /> Admin global
          </Badge>
        }
      >
        <TabLinks
          items={[
            { to: rotas.admin, label: 'Visão geral', end: true, icon: <LayoutGrid /> },
            { to: rotas.adminUsuarios, label: 'Usuários', icon: <Users /> },
            { to: rotas.adminOrganizacoes, label: 'Organizações', icon: <Building2 /> },
            { to: rotas.adminSinapi, label: 'Tabelas SINAPI', icon: <FileSpreadsheet /> },
            { to: rotas.adminAuditoria, label: 'Auditoria', icon: <ClipboardList /> },
            { to: rotas.adminConfiguracoes, label: 'Configurações', icon: <Settings /> },
          ]}
        />
      </PageHeader>
      <Outlet />
    </>
  );
}
