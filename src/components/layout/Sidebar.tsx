import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/brand/Logo';
import { Tooltip } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useDataBaseMaisRecente } from '@/api/core/configuracoes';
import { formatMesAno } from '@/lib/format';
import { LABEL_REGIME } from '@/lib/labels';
import { rotas } from '@/routes';
import { NAV } from './nav';

export interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

/** Barra lateral azul-petróleo (sempre escura). Dono: FRONTEND-1. */
export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const { isAdmin } = useAuth();
  const { data: db } = useDataBaseMaisRecente();

  return (
    <aside
      className={cn(
        'no-print relative flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-fg transition-[width] duration-150',
        collapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
      )}
    >
      {/* malha sutil de prancha no topo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgb(var(--c-sidebar-border)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--c-sidebar-border)) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
          maskImage: 'linear-gradient(to bottom, black, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)',
        }}
      />
      <div className={cn('relative flex h-topbar shrink-0 items-center border-b border-sidebar-border', collapsed ? 'justify-center px-0' : 'px-4')}>
        <NavLink to={rotas.dashboard} aria-label="Pretium — início" className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo variant={collapsed ? 'mark' : 'full'} height={22} className="text-sidebar-fg" />
        </NavLink>
      </div>

      <nav className="relative flex-1 overflow-y-auto overflow-x-hidden px-2 py-3" aria-label="Navegação principal">
        {NAV.filter((g) => !g.admin || isAdmin).map((g, gi) => (
          <div key={g.titulo} className={cn('mb-3', collapsed && gi > 0 && 'border-t border-sidebar-border/70 pt-3')}>
            {!collapsed && (
              <div className="mb-1 flex items-center gap-2 px-2 font-mono text-2xs uppercase tracking-[0.12em] text-sidebar-muted/80">
                <span>{g.titulo}</span>
                <span aria-hidden className="h-px flex-1 bg-sidebar-border/70" />
              </div>
            )}
            <ul className="flex flex-col gap-px">
              {g.itens.map((it) => {
                const link = (
                  <NavLink
                    to={it.to}
                    end={it.end}
                    aria-label={collapsed ? it.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'relative flex h-7 items-center gap-2.5 rounded-sm text-base text-sidebar-muted transition-colors',
                        collapsed ? 'justify-center px-0' : 'px-2',
                        'hover:bg-white/[0.06] hover:text-sidebar-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isActive &&
                          'bg-white/[0.08] font-medium text-sidebar-fg before:absolute before:inset-y-1 before:-left-2 before:w-[3px] before:rounded-r-sm before:bg-brand',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <it.icon aria-hidden className={cn('h-4 w-4 shrink-0', isActive && 'text-brand')} strokeWidth={1.75} />
                        {!collapsed && <span className="truncate">{it.label}</span>}
                      </>
                    )}
                  </NavLink>
                );
                return (
                  <li key={it.to}>
                    {collapsed ? (
                      <Tooltip content={it.label} side="right">
                        {link}
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('relative flex items-center border-t border-sidebar-border', collapsed ? 'justify-center py-2' : 'gap-2 py-2 pl-4 pr-2')}>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="font-mono text-2xs uppercase tracking-[0.1em] text-sidebar-muted/80">Data-base vigente</div>
            <div className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-xs text-sidebar-fg">
              {db ? (
                <>
                  <span>
                    SINAPI {db.uf} · {formatMesAno(db.ano, db.mes)}
                  </span>
                  {db.is_demo && <span className="rounded-xs bg-accent px-1 text-[9px] font-semibold uppercase leading-[14px] text-accent-fg">Exemplo</span>}
                </>
              ) : (
                <span className="text-sidebar-muted">SINAPI · RJ</span>
              )}
            </div>
            {db && <div className="truncate text-2xs text-sidebar-muted/80">{LABEL_REGIME[db.regime]}</div>}
          </div>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-sidebar-muted hover:bg-white/[0.06] hover:text-sidebar-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </aside>
  );
}
