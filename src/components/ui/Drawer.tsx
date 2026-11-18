import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from './Button';
import { useFocusTrap } from './floating';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  /** largura em px (padrão 480; limitada à viewport) */
  width?: number;
  children?: ReactNode;
  // — aditivos —
  /** rótulo técnico acima do título (ex.: código SINAPI) */
  eyebrow?: ReactNode;
  /** ações no cabeçalho, à esquerda do botão fechar */
  actions?: ReactNode;
  /** impede fechar por Esc/backdrop (ex.: durante salvamento) */
  dismissable?: boolean;
  className?: string;
}

/**
 * Painel lateral direito (memória de cálculo, composição analítica, detalhes).
 * Diálogo modal: portal, trap de foco, Esc, retorno do foco, filete laranja no topo.
 */
export function Drawer({ open, onClose, title, description, footer, width = 480, children, eyebrow, actions, dismissable = true, className }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useFocusTrap(ref, open, dismissable ? onClose : undefined);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div aria-hidden className="absolute inset-0 animate-fade-in bg-overlay/40" onClick={() => dismissable && onClose()} />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={{ width: `min(${width}px, 100vw)` }}
        className={cn(
          'absolute inset-y-0 right-0 flex animate-drawer-in flex-col border-l border-border-strong bg-surface shadow-lg focus:outline-none',
          className,
        )}
      >
        {/* filete de acento no topo */}
        <span aria-hidden className="absolute left-0 top-0 h-[2px] w-12 bg-brand" />
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {eyebrow && <div className="mb-0.5 font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle">{eyebrow}</div>}
            {title && (
              <h2 id={titleId} className="font-display text-lg font-semibold leading-6">
                {title}
              </h2>
            )}
            {description && (
              <p id={descId} className="mt-0.5 text-sm text-fg-muted">
                {description}
              </p>
            )}
          </div>
          <div className="-mr-1 flex shrink-0 items-center gap-1">
            {actions}
            {dismissable && <IconButton label="Fechar painel" icon={<X />} size="sm" onClick={onClose} />}
          </div>
        </header>
        <div data-dialog-body className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {children}
        </div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-4 py-2.5">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}
