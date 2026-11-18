import { cn } from '@/lib/cn';

export interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  /** texto para leitores de tela */
  label?: string;
}

const SIZES = { xs: 'h-3 w-3 border', sm: 'h-3.5 w-3.5 border-[1.5px]', md: 'h-5 w-5 border-2', lg: 'h-8 w-8 border-2' };

export function Spinner({ size = 'sm', className, label = 'Carregando' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={cn('inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent opacity-80', SIZES[size], className)} />
  );
}

/** Spinner centralizado ocupando a área (carregamento de página/painel). */
export function LoadingBlock({ label = 'Carregando…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex min-h-[160px] items-center justify-center gap-2 text-sm text-fg-muted', className)}>
      <Spinner size="sm" className="text-brand" />
      <span>{label}</span>
    </div>
  );
}
