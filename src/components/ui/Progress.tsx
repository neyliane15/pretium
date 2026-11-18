import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatNumero } from '@/lib/format';

export interface ProgressProps {
  /** 0–100 */
  value: number;
  label?: ReactNode;
  // — aditivos —
  /** texto à direita (padrão: percentual) */
  valueText?: ReactNode;
  variant?: 'brand' | 'success' | 'danger';
  /** listras animadas (processando) */
  striped?: boolean;
  className?: string;
}

const BAR = { brand: 'bg-brand', success: 'bg-success', danger: 'bg-danger' };

/** Barra de progresso fina (6px) com régua de 10% em fundo e rótulo mono. */
export function Progress({ value, label, valueText, variant = 'brand', striped, className }: ProgressProps) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className={cn('w-full', className)}>
      {(label || valueText !== null) && (
        <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
          <span className="text-fg-muted">{label}</span>
          <span className="num text-fg">{valueText ?? `${formatNumero(v, 0)}%`}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v)}
        aria-label={typeof label === 'string' ? label : 'Progresso'}
        className="relative h-1.5 w-full overflow-hidden rounded-xs border border-border bg-sunken"
        style={{
          backgroundImage: 'linear-gradient(90deg, rgb(var(--c-border-strong) / .6) 1px, transparent 1px)',
          backgroundSize: '10% 100%',
        }}
      >
        <div
          className={cn('h-full transition-[width] duration-300 ease-out', BAR[variant], striped && 'animate-progress motion-reduce:animate-none')}
          style={{
            width: `${v}%`,
            backgroundImage: striped ? 'repeating-linear-gradient(-45deg, rgb(255 255 255 / .22) 0 4px, transparent 4px 8px)' : undefined,
            backgroundSize: striped ? '16px 100%' : undefined,
          }}
        />
      </div>
    </div>
  );
}
