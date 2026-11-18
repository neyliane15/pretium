import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatNumero } from '@/lib/format';

export interface PaginationProps {
  /** página atual, 1-based */
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  // — aditivos —
  className?: string;
  /** rótulo do item contado (padrão "registros") */
  itemLabel?: string;
}

/** Sequência de páginas com reticências: 1 … 4 5 [6] 7 8 … 20 */
export function paginas(atual: number, totalPaginas: number): (number | '…')[] {
  if (totalPaginas <= 7) return Array.from({ length: totalPaginas }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const ini = Math.max(2, atual - 1);
  const fim = Math.min(totalPaginas - 1, atual + 1);
  if (ini > 2) out.push('…');
  for (let p = ini; p <= fim; p++) out.push(p);
  if (fim < totalPaginas - 1) out.push('…');
  out.push(totalPaginas);
  return out;
}

const btn =
  'inline-flex h-6 min-w-6 items-center justify-center rounded-sm border px-1.5 font-mono text-xs tabular-nums transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40';

/** Rodapé de listagem: "1–50 de 1.234 registros" + navegação por páginas. */
export function Pagination({ page, pageSize, total, onChange, className, itemLabel = 'registros' }: PaginationProps) {
  const totalPaginas = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const atual = Math.min(Math.max(1, page), totalPaginas);
  const de = total === 0 ? 0 : (atual - 1) * pageSize + 1;
  const ate = Math.min(total, atual * pageSize);

  return (
    <nav aria-label="Paginação" className={cn('flex flex-wrap items-center justify-between gap-3 text-xs text-fg-muted', className)}>
      <p aria-live="polite">
        <span className="num text-fg">
          {formatNumero(de, 0)}–{formatNumero(ate, 0)}
        </span>{' '}
        de <span className="num text-fg">{formatNumero(total, 0)}</span> {itemLabel}
      </p>
      {totalPaginas > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" className={cn(btn, 'border-border bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg')} onClick={() => onChange(atual - 1)} disabled={atual <= 1} aria-label="Página anterior">
            <ChevronLeft aria-hidden className="h-3.5 w-3.5" />
          </button>
          {paginas(atual, totalPaginas).map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} aria-hidden className="px-0.5 text-fg-subtle">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-label={`Página ${p}`}
                aria-current={p === atual ? 'page' : undefined}
                onClick={() => onChange(p)}
                className={cn(
                  btn,
                  p === atual
                    ? 'border-brand bg-primary-soft font-semibold text-fg'
                    : 'border-transparent text-fg-muted hover:border-border hover:bg-surface hover:text-fg',
                )}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" className={cn(btn, 'border-border bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg')} onClick={() => onChange(atual + 1)} disabled={atual >= totalPaginas} aria-label="Próxima página">
            <ChevronRight aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </nav>
  );
}
