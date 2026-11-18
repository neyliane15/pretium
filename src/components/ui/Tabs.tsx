import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

export interface TabItem<V extends string = string> {
  value: V;
  label: ReactNode;
  icon?: ReactNode;
  /** contador à direita do rótulo */
  count?: number;
  disabled?: boolean;
}

export interface TabsProps<V extends string = string> {
  items: readonly TabItem<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
  /** `line` = sublinhado laranja (padrão); `segmented` = botões agrupados */
  variant?: 'line' | 'segmented';
  size?: 'sm' | 'md';
  'aria-label'?: string;
}

const lineTab =
  'relative inline-flex h-9 items-center gap-1.5 px-3 text-base text-fg-muted transition-colors hover:text-fg ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ' +
  'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-transparent ' +
  'aria-selected:font-medium aria-selected:text-fg aria-selected:after:bg-brand ' +
  'disabled:pointer-events-none disabled:opacity-40 [&_svg]:h-3.5 [&_svg]:w-3.5';

const segTab =
  'inline-flex items-center gap-1.5 rounded-sm px-2.5 text-sm text-fg-muted transition-colors hover:text-fg ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'aria-selected:bg-surface aria-selected:text-fg aria-selected:shadow-xs aria-selected:font-medium ' +
  'disabled:pointer-events-none disabled:opacity-40 [&_svg]:h-3.5 [&_svg]:w-3.5';

/** Abas controladas (o conteúdo é renderizado pelo chamador conforme `value`). Setas ←/→ navegam. */
export function Tabs<V extends string>({ items, value, onChange, className, variant = 'line', size = 'md', ...aria }: TabsProps<V>) {
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const enabled = items.filter((i) => !i.disabled);
    const idx = enabled.findIndex((i) => i.value === value);
    const next = enabled[(idx + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length];
    if (next) {
      onChange(next.value);
      listRef.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
    }
  };
  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={aria['aria-label']}
      onKeyDown={onKey}
      className={cn(
        variant === 'line' ? 'flex items-end gap-0.5 border-b border-border' : 'inline-flex gap-0.5 rounded border border-border bg-sunken p-0.5',
        variant === 'segmented' && (size === 'sm' ? '[&>button]:h-6' : '[&>button]:h-7'),
        className,
      )}
    >
      {items.map((it) => {
        const selected = it.value === value;
        return (
          <button
            key={it.value}
            id={`${id}-${it.value}`}
            data-value={it.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={it.disabled}
            onClick={() => onChange(it.value)}
            className={variant === 'line' ? lineTab : segTab}
          >
            {it.icon}
            {it.label}
            {it.count !== undefined && <span className="num rounded-sm bg-sunken px-1 text-2xs text-fg-subtle">{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface TabLinkItem {
  to: string;
  label: ReactNode;
  icon?: ReactNode;
  /** casa a rota exatamente (use na aba "índice") */
  end?: boolean;
}

/** Abas de navegação ligadas a rotas (ex.: sub-páginas do orçamento). */
export function TabLinks({ items, className }: { items: readonly TabLinkItem[]; className?: string }) {
  return (
    <nav className={cn('flex items-end gap-0.5 overflow-x-auto border-b border-border', className)}>
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) => cn(lineTab, 'shrink-0', isActive && 'font-medium text-fg after:bg-brand')}
        >
          {it.icon}
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}
