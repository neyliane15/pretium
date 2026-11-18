import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RequireActive, RequireAdmin, RequireAuth, RequireOrg } from '@/components/auth/Guards';
import { LoadingBlock } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { ConfiguracaoNecessaria } from '@/pages/_shared/ConfiguracaoNecessaria';

/**
 * ROTEAMENTO COMPLETO DO PRETIUM — declarado pelo agente de projeto.
 * Os agentes de frontend implementam as páginas nos arquivos indicados; NÃO renomeie arquivos.
 * Dono deste arquivo: FRONTEND-1 (FRONTEND-2 solicita mudanças via docs/CONTRATO_ALTERACOES.md).
 * Caminhos: src/routes.ts.
 */

// ── Autenticação / onboarding (FRONTEND-1) ───────────────────────────────
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const CadastroPage = lazy(() => import('@/pages/auth/CadastroPage'));
const RecuperarSenhaPage = lazy(() => import('@/pages/auth/RecuperarSenhaPage'));
const RedefinirSenhaPage = lazy(() => import('@/pages/auth/RedefinirSenhaPage'));
const AguardandoAprovacaoPage = lazy(() => import('@/pages/auth/AguardandoAprovacaoPage'));
const BloqueadoPage = lazy(() => import('@/pages/auth/BloqueadoPage'));
const AceitarConvitePage = lazy(() => import('@/pages/auth/AceitarConvitePage'));
const CriarOrganizacaoPage = lazy(() => import('@/pages/onboarding/CriarOrganizacaoPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

// ── Cadastros, organização, perfil (FRONTEND-1) ──────────────────────────
const ClientesListPage = lazy(() => import('@/pages/clientes/ClientesListPage'));
const ClienteDetalhePage = lazy(() => import('@/pages/clientes/ClienteDetalhePage'));
const OrganizacaoDadosPage = lazy(() => import('@/pages/organizacao/OrganizacaoDadosPage'));
const OrganizacaoMembrosPage = lazy(() => import('@/pages/organizacao/OrganizacaoMembrosPage'));
const PerfilPage = lazy(() => import('@/pages/perfil/PerfilPage'));

// ── Administração (FRONTEND-1) ───────────────────────────────────────────
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage'));
const AdminUsuariosPage = lazy(() => import('@/pages/admin/AdminUsuariosPage'));
const AdminOrganizacoesPage = lazy(() => import('@/pages/admin/AdminOrganizacoesPage'));
const AdminSinapiPage = lazy(() => import('@/pages/admin/AdminSinapiPage'));
const AdminSinapiImportarPage = lazy(() => import('@/pages/admin/AdminSinapiImportarPage'));
const AdminAuditoriaPage = lazy(() => import('@/pages/admin/AdminAuditoriaPage'));
const AdminConfiguracoesPage = lazy(() => import('@/pages/admin/AdminConfiguracoesPage'));

// ── Painel, obras, orçamento, referências, honorários (FRONTEND-2) ────────
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const ObrasListPage = lazy(() => import('@/pages/obras/ObrasListPage'));
const ObraDetalhePage = lazy(() => import('@/pages/obras/ObraDetalhePage'));
const OrcamentosListPage = lazy(() => import('@/pages/orcamentos/OrcamentosListPage'));
const OrcamentoLayout = lazy(() => import('@/pages/orcamentos/OrcamentoLayout'));
const OrcamentoAnaliticoPage = lazy(() => import('@/pages/orcamentos/OrcamentoAnaliticoPage'));
const OrcamentoSinteticoPage = lazy(() => import('@/pages/orcamentos/OrcamentoSinteticoPage'));
const OrcamentoDadosPage = lazy(() => import('@/pages/orcamentos/OrcamentoDadosPage'));
const OrcamentoBdiPage = lazy(() => import('@/pages/orcamentos/OrcamentoBdiPage'));
const OrcamentoCronogramaPage = lazy(() => import('@/pages/orcamentos/OrcamentoCronogramaPage'));
const OrcamentoCurvaAbcPage = lazy(() => import('@/pages/orcamentos/OrcamentoCurvaAbcPage'));
const OrcamentoMaoObraPage = lazy(() => import('@/pages/orcamentos/OrcamentoMaoObraPage'));
const OrcamentoMedicoesPage = lazy(() => import('@/pages/orcamentos/OrcamentoMedicoesPage'));
const MedicaoDetalhePage = lazy(() => import('@/pages/orcamentos/MedicaoDetalhePage'));
const OrcamentoRelatoriosPage = lazy(() => import('@/pages/orcamentos/OrcamentoRelatoriosPage'));
const SinapiConsultaPage = lazy(() => import('@/pages/referencias/SinapiConsultaPage'));
const ComposicaoDetalhePage = lazy(() => import('@/pages/referencias/ComposicaoDetalhePage'));
const ComposicoesPropriasPage = lazy(() => import('@/pages/referencias/ComposicoesPropriasPage'));
const ComposicaoPropriaEditorPage = lazy(() => import('@/pages/referencias/ComposicaoPropriaEditorPage'));
const InsumosPropriosPage = lazy(() => import('@/pages/referencias/InsumosPropriosPage'));
const EncargosPage = lazy(() => import('@/pages/referencias/EncargosPage'));
const EncargosDetalhePage = lazy(() => import('@/pages/referencias/EncargosDetalhePage'));
const HonorariosListPage = lazy(() => import('@/pages/honorarios/HonorariosListPage'));
const HonorarioEditorPage = lazy(() => import('@/pages/honorarios/HonorarioEditorPage'));
const ImprimirOrcamentoPage = lazy(() => import('@/pages/relatorios/ImprimirOrcamentoPage'));

// eslint-disable-next-line react-refresh/only-export-components -- exportado para testes (createMemoryRouter)
export const routes: RouteObject[] = [
  // Públicas
  { path: '/login', element: <LoginPage /> },
  { path: '/cadastro', element: <CadastroPage /> },
  { path: '/recuperar-senha', element: <RecuperarSenhaPage /> },
  { path: '/redefinir-senha', element: <RedefinirSenhaPage /> },

  // Autenticadas, sem exigir status ativo
  {
    element: <RequireAuth />,
    children: [
      { path: '/aguardando-aprovacao', element: <AguardandoAprovacaoPage /> },
      { path: '/bloqueado', element: <BloqueadoPage /> },
      { path: '/convite/:token', element: <AceitarConvitePage /> },
      {
        element: <RequireActive />,
        children: [
          { path: '/onboarding/organizacao', element: <CriarOrganizacaoPage /> },

          // Impressão (fora do AppShell)
          { element: <RequireOrg />, children: [{ path: '/imprimir/orcamentos/:orcamentoId/:relatorio', element: <ImprimirOrcamentoPage /> }] },

          // Aplicação
          {
            element: <RequireOrg />,
            children: [
              {
                element: <AppShell />,
                children: [
                  { index: true, element: <DashboardPage /> },

                  { path: 'obras', element: <ObrasListPage /> },
                  { path: 'obras/:obraId', element: <ObraDetalhePage /> },

                  { path: 'orcamentos', element: <OrcamentosListPage /> },
                  {
                    path: 'orcamentos/:orcamentoId',
                    element: <OrcamentoLayout />,
                    children: [
                      { index: true, element: <OrcamentoAnaliticoPage /> },
                      { path: 'sintetico', element: <OrcamentoSinteticoPage /> },
                      { path: 'dados', element: <OrcamentoDadosPage /> },
                      { path: 'bdi', element: <OrcamentoBdiPage /> },
                      { path: 'cronograma', element: <OrcamentoCronogramaPage /> },
                      { path: 'curva-abc', element: <OrcamentoCurvaAbcPage /> },
                      { path: 'mao-de-obra', element: <OrcamentoMaoObraPage /> },
                      { path: 'medicoes', element: <OrcamentoMedicoesPage /> },
                      { path: 'medicoes/:medicaoId', element: <MedicaoDetalhePage /> },
                      { path: 'relatorios', element: <OrcamentoRelatoriosPage /> },
                    ],
                  },

                  { path: 'referencias', element: <Navigate to="/referencias/sinapi" replace /> },
                  { path: 'referencias/sinapi', element: <SinapiConsultaPage /> },
                  { path: 'referencias/composicoes/:composicaoId', element: <ComposicaoDetalhePage /> },
                  { path: 'referencias/composicoes-proprias', element: <ComposicoesPropriasPage /> },
                  { path: 'referencias/composicoes-proprias/nova', element: <ComposicaoPropriaEditorPage /> },
                  { path: 'referencias/composicoes-proprias/:composicaoId', element: <ComposicaoPropriaEditorPage /> },
                  { path: 'referencias/insumos-proprios', element: <InsumosPropriosPage /> },
                  { path: 'referencias/encargos', element: <EncargosPage /> },
                  { path: 'referencias/encargos/:encargosId', element: <EncargosDetalhePage /> },

                  { path: 'honorarios', element: <HonorariosListPage /> },
                  { path: 'honorarios/:honorarioId', element: <HonorarioEditorPage /> },

                  { path: 'clientes', element: <ClientesListPage /> },
                  { path: 'clientes/:clienteId', element: <ClienteDetalhePage /> },

                  { path: 'organizacao', element: <OrganizacaoDadosPage /> },
                  { path: 'organizacao/membros', element: <OrganizacaoMembrosPage /> },
                  { path: 'perfil', element: <PerfilPage /> },

                  {
                    path: 'admin',
                    element: <RequireAdmin />,
                    children: [
                      {
                        element: <AdminLayout />,
                        children: [
                          { index: true, element: <AdminDashboardPage /> },
                          { path: 'usuarios', element: <AdminUsuariosPage /> },
                          { path: 'organizacoes', element: <AdminOrganizacoesPage /> },
                          { path: 'sinapi', element: <AdminSinapiPage /> },
                          { path: 'sinapi/importar', element: <AdminSinapiImportarPage /> },
                          { path: 'auditoria', element: <AdminAuditoriaPage /> },
                          { path: 'configuracoes', element: <AdminConfiguracoesPage /> },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

const router = createBrowserRouter(routes, {
  future: { v7_relativeSplatPath: true, v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_partialHydration: true, v7_skipActionErrorRevalidation: true },
});

export default function App() {
  if (!isSupabaseConfigured) return <ConfiguracaoNecessaria />;
  return (
    <Suspense fallback={<LoadingBlock className="min-h-screen" label="Carregando Pretium…" />}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </Suspense>
  );
}
