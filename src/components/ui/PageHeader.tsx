import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface Crumb {
  label: ReactNode;
  to?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: readonly Crumb[];
  /** ações à direita */
  actions?: ReactNode;
  /** selos ao lado do título (status, demo) */
  badges?: ReactNode;
  /** conteúdo abaixo (ex.: <TabLinks/>) */
  children?: ReactNode;
  className?: string;
}

/** Cabeçalho padrão de página: trilha, título display, descrição, ações. */
export function PageHeader({ title, description, breadcrumbs, actions, badges, children, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-4', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Trilha" className="mb-1.5 flex items-center gap-1 text-xs text-fg-subtle">
          {breadcrumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight aria-hidden className="h-3 w-3" />}
              {c.to ? (
                <Link to={c.to} className="hover:text-fg hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className="text-fg-muted">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-2xl font-semibold leading-8">{title}</h1>
            {badges}
          </div>
          {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </header>
  );
}
