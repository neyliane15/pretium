import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, FlaskConical, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger' | 'demo';

export interface AlertProps {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  /** botão/link à direita */
  action?: ReactNode;
  className?: string;
  // — aditivos —
  /** substitui o ícone padrão (`null` remove) */
  icon?: ReactNode | null;
  /** botão de fechar (×) */
  onDismiss?: () => void;
}

const STYLES: Record<AlertVariant, { box: string; bar: string; icon: string }> = {
  info: { box: 'bg-info-soft border-info/25', bar: 'bg-info', icon: 'text-info' },
  success: { box: 'bg-success-soft border-success/25', bar: 'bg-success', icon: 'text-success' },
  warning: { box: 'bg-warning-soft border-warning/30', bar: 'bg-accent', icon: 'text-warning' },
  danger: { box: 'bg-danger-soft border-danger/25', bar: 'bg-danger', icon: 'text-danger' },
  demo: { box: 'bg-accent-soft border-accent/50', bar: 'hazard-stripe', icon: 'text-warning' },
};

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle, demo: FlaskConical };

/** Faixa de aviso inline (somente leitura, dados de exemplo, erros de carregamento). */
export function Alert({ variant = 'info', title, children, action, className, icon, onDismiss }: AlertProps) {
  const s = STYLES[variant];
  const Icon = ICONS[variant];
  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={cn('relative flex items-start gap-2.5 overflow-hidden rounded border py-2 pl-3.5 pr-2.5 text-sm text-fg', s.box, className)}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0', variant === 'demo' ? 'w-1' : 'w-[3px]', s.bar)} />
      {icon !== null && (
        <span aria-hidden className={cn('mt-px shrink-0 [&_svg]:h-4 [&_svg]:w-4', s.icon)}>
          {icon ?? <Icon />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium leading-5 text-fg">{title}</p>}
        {children && <div className={cn('text-fg-muted', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1.5 self-center">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dispensar aviso"
          onClick={onDismiss}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:bg-surface/60 hover:text-fg"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
