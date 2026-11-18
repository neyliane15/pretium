import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/brand/Logo';
import { Tooltip } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useDataBaseMaisRecente } from '@/api/core/configuracoes';
import { formatMesAno } from '@/lib/format';
import { LABEL_REGIME } from '@/lib/labels';
import { rotas } from '@/routes';
import { NAV, type NavGroup, type NavItem } from './nav';

export interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Item principal: 36px de altura, ícone em "célula" própria, barra de acento no ativo. */
function ItemLink({ it, collapsed }: { it: NavItem; collapsed: boolean }) {
  const link = (
    <NavLink
      to={it.to}
      end={it.end}
      aria-label={collapsed ? it.label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex h-9 items-center gap-3 rounded-md text-base text-sidebar-muted transition-colors',
          collapsed ? 'justify-center px-0' : 'px-2.5',
          'hover:bg-white/[0.05] hover:text-sidebar-fg',
          focusRing,
          isActive && 'bg-white/[0.08] font-medium text-sidebar-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span aria-hidden className="absolute inset-y-2 -left-3 w-[3px] rounded-r-sm bg-brand" />
          )}
          <it.icon
            aria-hidden
            strokeWidth={1.75}
            className={cn('h-[17px] w-[17px] shrink-0 transition-colors', isActive ? 'text-brand' : 'text-sidebar-muted/90 group-hover:text-sidebar-fg')}
          />
          {!collapsed && <span className="truncate">{it.label}</span>}
        </>
      )}
    </NavLink>
  );
  return <li>{collapsed ? <Tooltip content={it.label} side="right">{link}</Tooltip> : link}</li>;
}

/** Grupo recolhível (ex.: Administração): um item-pai com subitens recuados numa linha-guia. */
function GrupoRecolhivel({ g, collapsed }: { g: NavGroup; collapsed: boolean }) {
  const { pathname } = useLocation();
  const cfg = g.recolhivel!;
  const ativo = pathname === cfg.prefixo || pathname.startsWith(`${cfg.prefixo}/`);
  const [aberto, setAberto] = useState(ativo);
  useEffect(() => {
    if (ativo) setAberto(true);
  }, [ativo]);

  if (collapsed) {
    return <ItemLink it={{ to: cfg.prefixo, label: cfg.label, icon: cfg.icon }} collapsed />;
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className={cn(
          'group flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-base transition-colors',
          'hover:bg-white/[0.05] hover:text-sidebar-fg',
          focusRing,
          ativo ? 'font-medium text-sidebar-fg' : 'text-sidebar-muted',
        )}
      >
        <cfg.icon
          aria-hidden
          strokeWidth={1.75}
          className={cn('h-[17px] w-[17px] shrink-0', ativo ? 'text-brand' : 'text-sidebar-muted/90 group-hover:text-sidebar-fg')}
        />
        <span className="flex-1 truncate text-left">{cfg.label}</span>
        <ChevronRight aria-hidden className={cn('h-3.5 w-3.5 shrink-0 text-sidebar-muted transition-transform duration-150', aberto && 'rotate-90')} />
      </button>
      {aberto && (
        <ul className="relative mb-1 ml-[19px] mt-1 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
          {g.itens.map((it) => (
            <li key={it.to}>
              <NavLink
                to={it.to}
                end={it.end}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-8 items-center rounded-md px-2.5 text-sm transition-colors',
                    'text-sidebar-muted hover:bg-white/[0.05] hover:text-sidebar-fg',
                    focusRing,
                    isActive &&
                      'bg-white/[0.07] font-medium text-sidebar-fg before:absolute before:-left-[13px] before:inset-y-1.5 before:w-px before:bg-brand',
                  )
                }
              >
                <span className="truncate">{it.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Barra lateral azul-petróleo (sempre escura). Dono: FRONTEND-1. */
export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const { isAdmin } = useAuth();
  const { data: db } = useDataBaseMaisRecente();
  const grupos = NAV.filter((g) => !g.admin || isAdmin);

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
        className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-[0.3]"
        style={{
          backgroundImage:
            'linear-gradient(rgb(var(--c-sidebar-border)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--c-sidebar-border)) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
          maskImage: 'linear-gradient(to bottom, black, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)',
        }}
      />
      <div className={cn('relative flex h-topbar shrink-0 items-center border-b border-sidebar-border', collapsed ? 'justify-center px-0' : 'px-5')}>
        <NavLink to={rotas.dashboard} aria-label="Pretium — início" className={cn('rounded-sm', focusRing)}>
          <Logo variant={collapsed ? 'mark' : 'full'} height={22} className="text-sidebar-fg" />
        </NavLink>
      </div>

      <nav
        className={cn('relative flex flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden py-5', collapsed ? 'px-2' : 'px-3')}
        aria-label="Navegação principal"
      >
        {grupos.map((g, gi) => (
          <section key={g.titulo} aria-label={g.titulo} className={cn(collapsed && gi > 0 && 'border-t border-sidebar-border/70 pt-5')}>
            {!collapsed && !g.recolhivel && gi > 0 && (
              <h2 className="mb-2 px-2.5 text-2xs font-semibold uppercase tracking-[0.14em] text-sidebar-muted/70">{g.titulo}</h2>
            )}
            <ul className="flex flex-col gap-1">
              {g.recolhivel ? (
                <GrupoRecolhivel g={g} collapsed={collapsed} />
              ) : (
                g.itens.map((it) => <ItemLink key={it.to} it={it} collapsed={collapsed} />)
              )}
            </ul>
          </section>
        ))}
      </nav>

      <div className={cn('relative border-t border-sidebar-border', collapsed ? 'flex justify-center py-3' : 'p-3')}>
        {collapsed ? (
          onToggle && <ToggleBtn collapsed onToggle={onToggle} />
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-sidebar-border bg-sidebar-2/60 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-2xs font-semibold uppercase tracking-[0.12em] text-sidebar-muted/70">Data-base vigente</div>
              <div className="mt-1 flex items-center gap-1.5 truncate font-mono text-xs text-sidebar-fg">
                {db ? (
                  <>
                    <span>
                      SINAPI {db.uf} · {formatMesAno(db.ano, db.mes)}
                    </span>
                    {db.is_demo && (
                      <span className="rounded-xs bg-accent px-1 text-[9px] font-semibold uppercase leading-[14px] text-accent-fg">Exemplo</span>
                    )}
                  </>
                ) : (
                  <span className="text-sidebar-muted">SINAPI · RJ</span>
                )}
              </div>
              {db && <div className="mt-0.5 truncate text-2xs text-sidebar-muted/80">{LABEL_REGIME[db.regime]}</div>}
            </div>
            {onToggle && <ToggleBtn collapsed={false} onToggle={onToggle} />}
          </div>
        )}
      </div>
    </aside>
  );
}

function ToggleBtn({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
      title={collapsed ? 'Expandir menu' : 'Recolher menu'}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-sidebar-muted hover:bg-white/[0.06] hover:text-sidebar-fg',
        focusRing,
      )}
    >
      {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
    </button>
  );
}
