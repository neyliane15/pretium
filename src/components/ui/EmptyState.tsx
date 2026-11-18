import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** botão(ões) de ação primária */
  action?: ReactNode;
  className?: string;
  /** `inline` = sem moldura (dentro de cards/tabelas) */
  variant?: 'framed' | 'inline';
}

/** Estado vazio com moldura tracejada e malha de prancha ao fundo. */
export function EmptyState({ icon, title, description, action, className, variant = 'framed' }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-10 text-center',
        variant === 'framed' && 'blueprint-grid corner-marks rounded border border-dashed border-border-strong bg-surface-2',
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded border border-border bg-surface text-brand shadow-xs [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
      )}
      <h3 className="font-display text-md font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-4 flex items-center gap-2">{action}</div>}
    </div>
  );
}
