import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  /** linha de contexto abaixo (ex.: "12 orçamentos") */
  hint?: ReactNode;
  icon?: ReactNode;
  /** variação (+/−) com cor semântica */
  delta?: { value: string; trend: 'up' | 'down' | 'flat' };
  className?: string;
  /** destaque com cantoneiras laranja */
  highlight?: boolean;
}

/** KPI: rótulo em caixa-alta mono, valor grande em mono tabular. */
export function Stat({ label, value, hint, icon, delta, className, highlight }: StatProps) {
  return (
    <div className={cn('corner-marks relative rounded border border-border bg-surface p-3.5 shadow-xs', highlight && 'corner-marks-brand', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle">{label}</span>
        {icon && <span className="text-fg-subtle [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
      </div>
      <div className="num mt-1.5 whitespace-nowrap text-lg font-semibold leading-7 tracking-tight text-fg sm:text-2xl sm:leading-8">{value}</div>
      {(hint || delta) && (
        <div className="mt-0.5 flex items-center gap-2 text-xs text-fg-muted">
          {delta && (
            <span className={cn('num font-medium', delta.trend === 'up' && 'text-success', delta.trend === 'down' && 'text-danger')}>
              {delta.value}
            </span>
          )}
          {hint}
        </div>
      )}
    </div>
  );
}
