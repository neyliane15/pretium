import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useClickOutside, useFloating } from './floating';

export interface DropdownMenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** texto à direita (atalho, contagem) */
  hint?: ReactNode;
}

export type DropdownMenuEntry = DropdownMenuItem | 'separator';

export interface DropdownMenuProps {
  /** botão que abre o menu (ex.: <IconButton label="Ações" icon={<MoreHorizontal/>}/>) */
  trigger: ReactElement;
  align?: 'start' | 'end';
  items: readonly DropdownMenuEntry[];
  /** cabeçalho opcional do menu (ex.: nome e e-mail no menu do usuário) */
  header?: ReactNode;
  /** largura mínima em px (padrão 180) */
  minWidth?: number;
  /** rótulo acessível do menu */
  'aria-label'?: string;
}

type TriggerProps = {
  onClick?: (e: ReactMouseEvent) => void;
  onKeyDown?: (e: ReactKeyboardEvent) => void;
};

/**
 * Menu de ações (padrão WAI-ARIA menu button). Abre com clique, Enter, Espaço ou ↓/↑;
 * navegação ↑ ↓ Home End e por letra inicial; Esc/Tab fecham e devolvem o foco ao gatilho.
 */
export function DropdownMenu({ trigger, align = 'start', items, header, minWidth = 180, ...aria }: DropdownMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const anchorRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { style } = useFloating(anchorRef, menuRef, open, { side: 'bottom', align, offset: 4 });

  const habilitados = useMemo(
    () => items.map((it, i) => (it !== 'separator' && !it.disabled ? i : -1)).filter((i) => i >= 0),
    [items],
  );

  const fechar = useCallback((devolverFoco = true) => {
    setOpen(false);
    setAtivo(-1);
    if (devolverFoco) anchorRef.current?.focus();
  }, []);

  const refs = useMemo(() => [anchorRef, menuRef] as const, []);
  useClickOutside(refs, open, () => fechar(false));

  useEffect(() => {
    if (open && ativo >= 0) menuRef.current?.querySelector<HTMLElement>(`[data-index="${ativo}"]`)?.focus();
    else if (open) menuRef.current?.focus();
  }, [open, ativo]);

  const abrir = (primeiro: 'first' | 'last' | 'none') => {
    setOpen(true);
    if (primeiro === 'first') setAtivo(habilitados[0] ?? -1);
    else if (primeiro === 'last') setAtivo(habilitados[habilitados.length - 1] ?? -1);
    else setAtivo(-1);
  };

  const mover = (delta: number) => {
    if (habilitados.length === 0) return;
    const pos = habilitados.indexOf(ativo);
    const next = pos < 0 ? (delta > 0 ? 0 : habilitados.length - 1) : (pos + delta + habilitados.length) % habilitados.length;
    setAtivo(habilitados[next]!);
  };

  const selecionar = (i: number) => {
    const it = items[i];
    if (!it || it === 'separator' || it.disabled) return;
    fechar(true);
    it.onSelect();
  };

  const onMenuKey = (e: ReactKeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        mover(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        mover(-1);
        break;
      case 'Home':
        e.preventDefault();
        setAtivo(habilitados[0] ?? -1);
        break;
      case 'End':
        e.preventDefault();
        setAtivo(habilitados[habilitados.length - 1] ?? -1);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        fechar(true);
        break;
      case 'Tab':
        fechar(false);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (ativo >= 0) selecionar(ativo);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const k = e.key.toLowerCase();
          const ordem = [...habilitados.filter((i) => i > ativo), ...habilitados.filter((i) => i <= ativo)];
          const achou = ordem.find((i) => {
            const it = items[i];
            return it !== 'separator' && typeof it?.label === 'string' && it.label.toLowerCase().startsWith(k);
          });
          if (achou !== undefined) setAtivo(achou);
        }
    }
  };

  if (!isValidElement<TriggerProps>(trigger)) return null;
  const tp = trigger.props;

  const gatilho = cloneElement(trigger as ReactElement<TriggerProps & Record<string, unknown>>, {
    ref: (el: HTMLElement | null) => {
      anchorRef.current = el;
    },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: (e: ReactMouseEvent) => {
      tp.onClick?.(e);
      if (open) fechar(false);
      // detail 0 = ativado por teclado (Enter/Espaço): já foca o 1º item
      else abrir(e.detail === 0 ? 'first' : 'none');
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      tp.onKeyDown?.(e);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        abrir('first');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        abrir('last');
      }
    },
  });

  return (
    <>
      {gatilho}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={aria['aria-label']}
            tabIndex={-1}
            onKeyDown={onMenuKey}
            style={{ ...style, minWidth }}
            className="z-[65] max-w-[320px] animate-fade-in overflow-hidden rounded border border-border-strong bg-surface py-1 shadow-md focus:outline-none"
          >
            {header && <div className="mb-1 border-b border-border px-3 pb-2 pt-1.5">{header}</div>}
            {items.map((it, i) =>
              it === 'separator' ? (
                <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-border" />
              ) : (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  data-index={i}
                  tabIndex={-1}
                  disabled={it.disabled}
                  aria-disabled={it.disabled || undefined}
                  onClick={() => selecionar(i)}
                  onMouseMove={() => !it.disabled && ativo !== i && setAtivo(i)}
                  className={cn(
                    'relative mx-1 flex h-7 w-[calc(100%-8px)] items-center gap-2 rounded-sm px-2 text-left text-base outline-none',
                    'disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0',
                    it.danger ? 'text-danger' : 'text-fg',
                    ativo === i && (it.danger ? 'bg-danger-soft' : 'bg-sunken'),
                    'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/60',
                  )}
                >
                  {it.icon !== undefined && (
                    <span aria-hidden className={cn('flex w-4 justify-center', it.danger ? 'text-danger' : 'text-fg-subtle')}>
                      {it.icon}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="ml-3 font-mono text-2xs text-fg-subtle">{it.hint}</span>}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
