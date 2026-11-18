import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/brand/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { NAV } from './nav';

/** Barra lateral azul-petróleo (sempre escura). Dono: FRONTEND-1. */
export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const { isAdmin } = useAuth();
  return (
    <aside
      className={cn(
        'no-print flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-fg',
        collapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
      )}
    >
      <div className="flex h-topbar shrink-0 items-center border-b border-sidebar-border px-4">
        <Logo variant={collapsed ? 'mark' : 'full'} height={22} className="text-sidebar-fg" />
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Navegação principal">
        {NAV.filter((g) => !g.admin || isAdmin).map((g) => (
          <div key={g.titulo} className="mb-4">
            {!collapsed && <div className="mb-1 px-2 font-mono text-2xs uppercase tracking-[0.1em] text-sidebar-muted/80">{g.titulo}</div>}
            <ul className="flex flex-col gap-px">
              {g.itens.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.end}
                    title={collapsed ? it.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'relative flex h-7 items-center gap-2.5 rounded-sm px-2 text-base text-sidebar-muted transition-colors',
                        'hover:bg-white/5 hover:text-sidebar-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isActive && 'bg-white/[0.07] font-medium text-sidebar-fg before:absolute before:inset-y-1 before:-left-2 before:w-[3px] before:rounded-r-sm before:bg-brand',
                      )
                    }
                  >
                    <it.icon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    {!collapsed && <span className="truncate">{it.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {!collapsed && (
        <div className="border-t border-sidebar-border px-4 py-2.5 font-mono text-2xs uppercase tracking-[0.08em] text-sidebar-muted/70">
          SINAPI · RJ
        </div>
      )}
    </aside>
  );
}
