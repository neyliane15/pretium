import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from './Button';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  /** rodapé (botões). Convenção: secundário à esquerda do primário, alinhados à direita */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** impede fechar clicando fora / Esc (ex.: durante salvamento) */
  dismissable?: boolean;
  children?: ReactNode;
  className?: string;
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-[calc(100vw-48px)] h-[calc(100vh-48px)]' };

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Diálogo modal acessível: portal, trap de foco, Esc, restauração do foco ao fechar. */
export function Modal({ open, onClose, title, description, footer, size = 'md', dismissable = true, children, className }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const anterior = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && el) {
        const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (nodes.length === 0) return;
        const f = nodes[0]!;
        const l = nodes[nodes.length - 1]!;
        if (e.shiftKey && document.activeElement === f) {
          e.preventDefault();
          l.focus();
        } else if (!e.shiftKey && document.activeElement === l) {
          e.preventDefault();
          f.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      anterior?.focus?.();
    };
  }, [open, dismissable, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6 pt-[8vh]">
      <div aria-hidden className="fixed inset-0 animate-fade-in bg-overlay/50 backdrop-blur-[1px]" onClick={() => dismissable && onClose()} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'corner-marks corner-marks-brand relative flex w-full animate-scale-in flex-col rounded border border-border-strong bg-surface shadow-lg focus:outline-none',
          SIZES[size],
          className,
        )}
      >
        {(title || dismissable) && (
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
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
            {dismissable && <IconButton label="Fechar" icon={<X />} size="sm" onClick={onClose} className="-mr-1" />}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-4 py-2.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** botão de confirmação vermelho */
  destructive?: boolean;
  loading?: boolean;
}

/** Confirmação padrão (exclusões, ações irreversíveis). */
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', destructive, loading }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      dismissable={!loading}
      footer={
        <>
          <button
            type="button"
            className="h-control rounded border border-border-strong bg-surface px-3 text-base text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-autofocus
            className={cn(
              'h-control rounded border border-black/10 px-3 text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
              destructive ? 'bg-danger text-white hover:brightness-95' : 'bg-primary text-primary-fg hover:bg-primary-hover',
            )}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Aguarde…' : confirmLabel}
          </button>
        </>
      }
    >
      {description && <div className="text-base text-fg-muted">{description}</div>}
    </Modal>
  );
}
