import { Suspense, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Alert, LoadingBlock } from '@/components/ui';
import { useAvisoGlobal, useDataBaseMaisRecente } from '@/api/core/configuracoes';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { formatMesAno } from '@/lib/format';
import { rotas } from '@/routes';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const KEY = 'pretium.sidebar';

function lerRecolhida(): boolean {
  try {
    return localStorage.getItem(KEY) === 'recolhida';
  } catch {
    return false;
  }
}

/** Faixas globais: aviso do admin, organização bloqueada e dados de exemplo. */
function Faixas() {
  const aviso = useAvisoGlobal();
  const { data: db } = useDataBaseMaisRecente();
  const { organizacao } = useOrganizacao();
  const { isAdmin } = useAuth();
  const [avisoFechado, setAvisoFechado] = useState<string | null>(null);

  return (
    <>
      {db?.is_demo && (
        <div className="no-print flex items-center gap-3 border-b border-accent/40 bg-accent-soft px-4 py-1 text-xs text-fg">
          <span aria-hidden className="hazard-stripe h-3 w-6 shrink-0 rounded-xs" />
          <span className="whitespace-nowrap font-mono text-2xs font-semibold uppercase tracking-[0.1em]"><span className="hidden sm:inline">Ambiente com </span>dados de exemplo</span>
          <span className="hidden truncate text-fg-muted sm:inline">
            A data-base {db.uf} {formatMesAno(db.ano, db.mes)} é demonstrativa — os preços não são oficiais.
          </span>
          {isAdmin && (
            <Link to={rotas.adminSinapiImportar} className="ml-auto shrink-0 font-medium text-primary hover:underline">
              Importar tabela oficial
            </Link>
          )}
        </div>
      )}
      {(aviso && avisoFechado !== aviso) || organizacao?.status === 'bloqueada' ? (
        <div className="no-print flex flex-col gap-2 px-6 pt-4">
          {aviso && avisoFechado !== aviso && (
            <Alert variant="info" title="Aviso" onDismiss={() => setAvisoFechado(aviso)}>
              {aviso}
            </Alert>
          )}
          {organizacao?.status === 'bloqueada' && (
            <Alert variant="danger" title="Organização bloqueada">
              Esta organização está bloqueada pelo administrador: os dados estão disponíveis somente para leitura.
            </Alert>
          )}
        </div>
      ) : null}
    </>
  );
}

const CONSULTA_MOVEL = '(max-width: 767px)';

/** `true` em telas estreitas (< 768 px): a sidebar vira gaveta sobreposta. */
function useTelaEstreita(): boolean {
  const [estreita, setEstreita] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(CONSULTA_MOVEL).matches));
  useEffect(() => {
    const mq = window.matchMedia?.(CONSULTA_MOVEL);
    if (!mq) return;
    const fn = (e: MediaQueryListEvent) => setEstreita(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return estreita;
}

/** Moldura autenticada: sidebar + topbar + faixas + conteúdo rolável. Dono: FRONTEND-1. */
export function AppShell() {
  const estreita = useTelaEstreita();
  const [menuAberto, setMenuAberto] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenuAberto(false), [pathname, estreita]);
  useEffect(() => {
    if (!menuAberto) return;
    const fn = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAberto(false);
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [menuAberto]);
  const [recolhida, setRecolhida] = useState(lerRecolhida);
  const alternar = () =>
    setRecolhida((r) => {
      try {
        localStorage.setItem(KEY, r ? 'expandida' : 'recolhida');
      } catch {
        /* ignore */
      }
      return !r;
    });

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <a
        href="#conteudo"
        className="sr-only z-[80] rounded bg-surface px-3 py-2 text-base font-medium text-fg shadow-md focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
      >
        Pular para o conteúdo
      </a>
      {!estreita && <Sidebar collapsed={recolhida} onToggle={alternar} />}
      {estreita && menuAberto && (
        <>
          <div aria-hidden className="no-print fixed inset-0 z-40 bg-black/40" onClick={() => setMenuAberto(false)} />
          <div role="dialog" aria-modal="true" aria-label="Menu de navegação" className="no-print fixed inset-y-0 left-0 z-50 shadow-xl">
            <Sidebar />
          </div>
        </>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={estreita ? () => setMenuAberto(true) : undefined} />
        <main id="conteudo" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto focus:outline-none">
          <Faixas />
          <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-6 sm:py-5">
            <Suspense fallback={<LoadingBlock />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AppShell;
