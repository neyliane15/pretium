import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { controlBase, controlSizes } from './Input';
import { Spinner } from './Spinner';
import { useFloating } from './floating';

export interface ComboboxProps<T> {
  value: T | null;
  onChange: (item: T | null) => void;
  /** chamado com debounce a cada alteração do texto (o chamador busca e atualiza `items`) */
  onSearch: (termo: string) => void;
  items: readonly T[];
  loading?: boolean;
  getKey: (item: T) => string;
  /** conteúdo de cada opção; `ativo` = destacada pelo teclado/mouse */
  renderItem: (item: T, ativo: boolean) => ReactNode;
  /** texto exibido no campo quando há valor selecionado */
  getLabel: (item: T) => string;
  placeholder?: string;
  emptyText?: string;
  /** padrão 250 ms */
  debounceMs?: number;
  autoFocus?: boolean;
  size?: 'sm' | 'md';
  // — aditivos (compatíveis com <Field>) —
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  disabled?: boolean;
  className?: string;
  /** cabeçalho fixo da lista (ex.: legenda das colunas) */
  listHeader?: ReactNode;
  /** altura máxima da lista em px (padrão 320) */
  maxListHeight?: number;
  /** após selecionar, limpa o texto (modo "adicionar vários") */
  clearOnSelect?: boolean;
}

/**
 * Busca assíncrona com teclado (padrão WAI-ARIA combobox + listbox).
 * ↑ ↓ movem, Enter seleciona, Esc fecha (2º Esc restaura o texto), Home/End na lista.
 */
export function Combobox<T>({
  value,
  onChange,
  onSearch,
  items,
  loading,
  getKey,
  renderItem,
  getLabel,
  placeholder = 'Buscar…',
  emptyText = 'Nenhum resultado',
  debounceMs = 250,
  autoFocus,
  size = 'md',
  id,
  disabled,
  className,
  listHeader,
  maxListHeight = 320,
  clearOnSelect,
  ...aria
}: ComboboxProps<T>) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const listId = `${autoId}-list`;
  const [texto, setTexto] = useState(() => (value ? getLabel(value) : ''));
  const [open, setOpen] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [editando, setEditando] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number>();
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const { style } = useFloating(wrapRef, listRef, open, { side: 'bottom', align: 'start', offset: 3, matchWidth: true });

  const labelAtual = value ? getLabel(value) : '';
  useEffect(() => {
    if (!editando) setTexto(labelAtual);
  }, [labelAtual, editando]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // mantém o índice ativo dentro dos limites quando a lista muda
  useEffect(() => {
    setAtivo((a) => (items.length === 0 ? 0 : Math.min(a, items.length - 1)));
  }, [items]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${ativo}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [ativo, open]);

  const buscar = (termo: string) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onSearchRef.current(termo), debounceMs);
  };

  const selecionar = (item: T) => {
    onChange(item);
    setOpen(false);
    setEditando(false);
    setTexto(clearOnSelect ? '' : getLabel(item));
    if (clearOnSelect) inputRef.current?.focus();
  };

  const restaurar = () => {
    setEditando(false);
    setTexto(labelAtual);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          if (items.length === 0) buscar(texto);
        } else if (items.length) setAtivo((a) => (a + 1) % items.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (open && items.length) setAtivo((a) => (a - 1 + items.length) % items.length);
        break;
      case 'Home':
        if (open && items.length) {
          e.preventDefault();
          setAtivo(0);
        }
        break;
      case 'End':
        if (open && items.length) {
          e.preventDefault();
          setAtivo(items.length - 1);
        }
        break;
      case 'Enter': {
        const item = items[ativo];
        if (open && item) {
          e.preventDefault();
          selecionar(item);
        }
        break;
      }
      case 'Escape':
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        } else if (texto !== labelAtual) {
          e.preventDefault();
          e.stopPropagation();
          restaurar();
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  const ativoId = open && items[ativo] ? `${autoId}-opt-${ativo}` : undefined;
  const mostrarLista = open && (loading || items.length > 0 || texto.trim().length > 0);

  return (
    <div ref={wrapRef} className={cn('relative w-full', className)}>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-fg-subtle">
        <Search className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      </span>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={mostrarLista}
        aria-controls={listId}
        aria-activedescendant={ativoId}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid'] || undefined}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        value={texto}
        onChange={(e) => {
          const t = e.target.value;
          setTexto(t);
          setEditando(true);
          setOpen(true);
          setAtivo(0);
          if (t === '' && value) onChange(null);
          buscar(t);
        }}
        onFocus={() => setEditando(true)}
        onBlur={() => {
          setOpen(false);
          if (!clearOnSelect) restaurar();
          else setEditando(false);
        }}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (!open) {
            setOpen(true);
            if (items.length === 0) buscar(texto);
          }
        }}
        className={cn(controlBase, controlSizes[size], size === 'sm' ? 'pl-6' : 'pl-7', 'pr-7')}
      />
      <span className="absolute inset-y-0 right-1.5 flex items-center">
        {loading ? (
          <Spinner size="xs" className="text-fg-subtle" label="Buscando" />
        ) : (
          texto &&
          !disabled && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Limpar"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setTexto('');
                setEditando(true);
                if (value) onChange(null);
                inputRef.current?.focus();
                buscar('');
              }}
              className="flex h-4 w-4 items-center justify-center rounded-xs text-fg-subtle hover:bg-sunken hover:text-fg"
            >
              <X className="h-3 w-3" />
            </button>
          )
        )}
      </span>

      {mostrarLista &&
        createPortal(
          <div
            ref={listRef}
            style={style}
            // evita blur do input ao clicar na lista
            onMouseDown={(e) => e.preventDefault()}
            className="z-[65] max-w-[min(720px,calc(100vw-16px))] animate-fade-in overflow-hidden rounded border border-border-strong bg-surface shadow-md"
          >
            {listHeader && <div className="border-b border-border bg-surface-2 px-2.5 py-1">{listHeader}</div>}
            <div id={listId} role="listbox" aria-label={aria['aria-label'] ?? 'Resultados'} className="overflow-y-auto py-1" style={{ maxHeight: maxListHeight }}>
              {items.map((item, i) => (
                <div
                  key={getKey(item)}
                  id={`${autoId}-opt-${i}`}
                  role="option"
                  data-index={i}
                  aria-selected={i === ativo}
                  onMouseMove={() => i !== ativo && setAtivo(i)}
                  onClick={() => selecionar(item)}
                  className={cn(
                    'relative mx-1 cursor-pointer rounded-sm px-2 py-1 text-sm text-fg',
                    i === ativo && 'bg-primary-soft before:absolute before:inset-y-1 before:left-0 before:w-[2px] before:bg-brand',
                  )}
                >
                  {renderItem(item, i === ativo)}
                </div>
              ))}
              {!loading && items.length === 0 && <div className="px-3 py-3 text-center text-sm text-fg-muted">{emptyText}</div>}
              {loading && items.length === 0 && (
                <div className="flex items-center justify-center gap-2 px-3 py-3 text-sm text-fg-muted">
                  <Spinner size="xs" className="text-brand" /> Buscando…
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
