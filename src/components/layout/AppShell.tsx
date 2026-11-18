import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { LoadingBlock } from '@/components/ui';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/** Moldura autenticada: sidebar fixa + topbar + conteúdo rolável. Dono: FRONTEND-1. */
export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="conteudo" className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] px-6 py-5">
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
