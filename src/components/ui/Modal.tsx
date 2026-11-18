import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, IconButton } from './Button';
import { useFocusTrap } from './floating';

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

/** Diálogo modal acessível: portal, trap de foco, Esc, restauração do foco ao fechar. */
export function Modal({ open, onClose, title, description, footer, size = 'md', dismissable = true, children, className }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useFocusTrap(ref, open, dismissable ? onClose : undefined);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[5vh] sm:p-6 sm:pt-[6vh]">
      <div aria-hidden className="fixed inset-0 animate-fade-in bg-overlay/50 backdrop-blur-[1px]" onClick={() => dismissable && onClose()} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'corner-marks corner-marks-brand relative flex max-h-[90vh] w-full animate-scale-in flex-col rounded-lg border border-border-strong bg-surface shadow-lg focus:outline-none',
          SIZES[size],
          className,
        )}
      >
        {(title || dismissable) && (
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-6 py-4">
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
        <div data-dialog-body className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-3 rounded-b-lg border-t border-border bg-surface-2 px-6 py-3.5">{footer}</div>}
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
          <Button onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button data-autofocus variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <div className="text-base text-fg-muted">{description}</div>}
    </Modal>
  );
}
