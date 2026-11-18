import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeVariant = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'outline' | 'demo';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** ponto colorido à esquerda (status) */
  dot?: boolean;
  size?: 'sm' | 'md';
}

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: 'bg-sunken text-fg-muted border-border',
  brand: 'bg-primary-soft text-primary border-primary/25',
  accent: 'bg-accent-soft text-warning border-accent/40',
  success: 'bg-success-soft text-success border-success/25',
  warning: 'bg-warning-soft text-warning border-warning/25',
  danger: 'bg-danger-soft text-danger border-danger/25',
  info: 'bg-info-soft text-info border-info/25',
  outline: 'bg-transparent text-fg-muted border-border-strong',
  // Dados de demonstração: faixa amarela de sinalização, sempre legível
  demo: 'bg-accent text-accent-fg border-black/15 font-semibold uppercase tracking-[0.06em]',
};

const DOT: Record<BadgeVariant, string> = {
  neutral: 'bg-fg-subtle', brand: 'bg-brand', accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning',
  danger: 'bg-danger', info: 'bg-info', outline: 'bg-fg-subtle', demo: 'bg-accent-fg',
};

export function Badge({ variant = 'neutral', dot, size = 'sm', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border font-medium leading-none',
        size === 'sm' ? 'h-[18px] px-1.5 text-2xs' : 'h-5 px-2 text-xs',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {dot && <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', DOT[variant])} />}
      {children}
    </span>
  );
}

/** Selo padrão para qualquer dado `is_demo` (docs/ARQUITETURA.md §10). */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge variant="demo" className={className} title="Dados de exemplo – importe a tabela oficial SINAPI">
      Exemplo
    </Badge>
  );
}
