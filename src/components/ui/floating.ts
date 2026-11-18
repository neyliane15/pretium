import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

/**
 * Utilitários internos do design system (não exportados no barrel):
 * posicionamento de popovers em portal e trap de foco.
 */

export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Align = 'start' | 'center' | 'end';

export interface FloatingOptions {
  side?: Side;
  align?: Align;
  /** distância em px entre âncora e flutuante */
  offset?: number;
  /** iguala a largura mínima do flutuante à da âncora */
  matchWidth?: boolean;
}

export interface FloatingResult {
  style: CSSProperties;
  /** lado efetivamente usado (pode inverter se não couber) */
  side: Side;
  update: () => void;
}

const MARGEM = 8;

/**
 * Posiciona um elemento `position: fixed` relativo à âncora. Inverte o lado se não houver espaço
 * e mantém dentro da viewport. Recalcula em scroll/resize enquanto `open`.
 */
export function useFloating(
  anchorRef: RefObject<HTMLElement>,
  floatingRef: RefObject<HTMLElement>,
  open: boolean,
  { side = 'bottom', align = 'start', offset = 4, matchWidth = false }: FloatingOptions = {},
): FloatingResult {
  const [state, setState] = useState<{ style: CSSProperties; side: Side }>({
    style: { position: 'fixed', top: 0, left: 0, visibility: 'hidden' },
    side,
  });

  const update = useCallback(() => {
    const a = anchorRef.current;
    const f = floatingRef.current;
    if (!a || !f) return;
    const r = a.getBoundingClientRect();
    const fw = f.offsetWidth;
    const fh = f.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let s: Side = side;
    if (s === 'bottom' && r.bottom + offset + fh > vh - MARGEM && r.top - offset - fh > MARGEM) s = 'top';
    else if (s === 'top' && r.top - offset - fh < MARGEM && r.bottom + offset + fh < vh - MARGEM) s = 'bottom';
    else if (s === 'right' && r.right + offset + fw > vw - MARGEM && r.left - offset - fw > MARGEM) s = 'left';
    else if (s === 'left' && r.left - offset - fw < MARGEM && r.right + offset + fw < vw - MARGEM) s = 'right';

    let top = 0;
    let left = 0;
    if (s === 'bottom' || s === 'top') {
      top = s === 'bottom' ? r.bottom + offset : r.top - offset - fh;
      left = align === 'start' ? r.left : align === 'end' ? r.right - fw : r.left + r.width / 2 - fw / 2;
    } else {
      left = s === 'right' ? r.right + offset : r.left - offset - fw;
      top = align === 'start' ? r.top : align === 'end' ? r.bottom - fh : r.top + r.height / 2 - fh / 2;
    }
    left = Math.max(MARGEM, Math.min(left, vw - fw - MARGEM));
    top = Math.max(MARGEM, Math.min(top, vh - fh - MARGEM));

    setState({
      side: s,
      style: {
        position: 'fixed',
        top: Math.round(top),
        left: Math.round(left),
        minWidth: matchWidth ? Math.round(r.width) : undefined,
        visibility: 'visible',
      },
    });
  }, [anchorRef, floatingRef, side, align, offset, matchWidth]);

  useLayoutEffect(() => {
    if (!open) return;
    update();
  }, [open, update]);

  useEffect(() => {
    if (!open) return;
    const h = () => update();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(h) : null;
    if (ro && floatingRef.current) ro.observe(floatingRef.current);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
      ro?.disconnect();
    };
  }, [open, update, floatingRef]);

  return { style: state.style, side: state.side, update };
}

/** pilha de diálogos abertos (Drawer com Modal por cima: Esc fecha só o de cima) */
const pilha: object[] = [];

export const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Trap de foco para diálogos (Modal, Drawer): foca `[data-autofocus]` ou o 1º focável,
 * prende Tab/Shift+Tab, Esc chama `onEscape`, trava a rolagem do body e devolve o foco ao fechar.
 */
export function useFocusTrap(ref: RefObject<HTMLElement>, open: boolean, onEscape?: () => void) {
  // ref evita re-executar o efeito (e roubar o foco) quando o chamador passa uma função inline
  const escRef = useRef(onEscape);
  escRef.current = onEscape;
  useEffect(() => {
    if (!open) return;
    const anterior = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first =
      el?.querySelector<HTMLElement>('[data-autofocus]') ??
      el?.querySelector('[data-dialog-body]')?.querySelector<HTMLElement>(FOCUSABLE) ??
      el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && escRef.current) {
        // só o diálogo mais recente (topo da pilha) reage
        if (pilha[pilha.length - 1] !== token) return;
        e.stopPropagation();
        escRef.current();
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
    const token = {};
    pilha.push(token);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = pilha.indexOf(token);
      if (i >= 0) pilha.splice(i, 1);
      document.body.style.overflow = overflow;
      anterior?.focus?.();
    };
  }, [open, ref]);
}

/** Fecha ao clicar fora de qualquer um dos elementos informados. */
export function useClickOutside(refs: readonly RefObject<HTMLElement>[], open: boolean, onOutside: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (refs.some((r) => r.current?.contains(t))) return;
      onOutside();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, onOutside, refs]);
}
