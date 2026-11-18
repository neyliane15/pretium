import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useFloating } from './floating';

export interface TooltipProps {
  content: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** elemento focável/hoverável (botão, ícone com tabIndex, badge…) */
  children: ReactElement;
  /** atraso de abertura em ms (padrão 350) */
  delay?: number;
  className?: string;
}

type Handlers = {
  onMouseEnter?: (e: SyntheticEvent) => void;
  onMouseLeave?: (e: SyntheticEvent) => void;
  onFocus?: (e: SyntheticEvent) => void;
  onBlur?: (e: SyntheticEvent) => void;
  'aria-describedby'?: string;
};

function focoPorTeclado(el: HTMLElement): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

/**
 * Dica curta em portal (grafite, 11px). Abre no hover (com atraso) e no foco do teclado; Esc fecha.
 * Liga `aria-describedby` ao filho. Para rótulos de ícones prefira `IconButton label`.
 */
export function Tooltip({ content, side = 'top', children, delay = 350, className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number>();
  const { style, side: efetivo } = useFloating(anchorRef, tipRef, open, { side, align: 'center', offset: 6 });

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!isValidElement<Handlers>(children) || content === null || content === undefined || content === '') return children;
  const props = children.props;

  const abrir = (imediato: boolean) => {
    window.clearTimeout(timer.current);
    if (imediato) setOpen(true);
    else timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const fechar = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

  const child = cloneElement(children, {
    'aria-describedby': cn(props['aria-describedby'], open && id) || undefined,
    onMouseEnter: (e: SyntheticEvent) => {
      anchorRef.current = e.currentTarget as HTMLElement;
      abrir(false);
      props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: SyntheticEvent) => {
      fechar();
      props.onMouseLeave?.(e);
    },
    onFocus: (e: SyntheticEvent) => {
      anchorRef.current = e.currentTarget as HTMLElement;
      // só abre no foco por teclado
      if (focoPorTeclado(e.currentTarget as HTMLElement)) abrir(true);
      props.onFocus?.(e);
    },
    onBlur: (e: SyntheticEvent) => {
      fechar();
      props.onBlur?.(e);
    },
  });

  return (
    <>
      {child}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            data-side={efetivo}
            style={style}
            className={cn(
              'pointer-events-none z-[70] max-w-[280px] animate-fade-in rounded-sm border border-tooltip-border bg-tooltip px-2 py-1 text-xs leading-4 text-tooltip-fg shadow-md',
              className,
            )}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
