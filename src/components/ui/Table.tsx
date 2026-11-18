import { forwardRef, type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** `compact` = linhas de 24px (planilha de orçamento); `default` = 28px */
  density?: 'compact' | 'default' | 'comfortable';
  /** zebra sutil */
  striped?: boolean;
  /** cabeçalho fixo ao rolar (o container precisa ter altura) */
  stickyHeader?: boolean;
  /** linhas verticais entre colunas (planilhas) */
  gridLines?: boolean;
  /** classes do container com rolagem */
  containerClassName?: string;
  /** dentro de `Card flush`: sem borda/raio próprios e 1ª/última coluna alinhadas ao padding do card (16px) */
  inset?: boolean;
}

/**
 * Tabela densa (12px). Valores numéricos: <Td numeric> (direita + mono tabular).
 * Envolve em container com overflow-x e borda.
 */
export const Table = forwardRef<HTMLTableElement, TableProps>(function Table(
  { density = 'default', striped, stickyHeader, gridLines, inset, className, containerClassName, ...rest },
  ref,
) {
  return (
    <div className={cn('relative w-full overflow-auto rounded border border-border bg-surface', inset && 'rounded-none border-0', containerClassName)}>
      <table
        ref={ref}
        data-density={density}
        className={cn(
          'w-full border-separate border-spacing-0 text-sm',
          '[&_td]:border-b [&_td]:border-grid [&_tbody_tr:last-child_td]:border-b-0',
          density === 'compact' && '[&_td]:h-8 [&_td]:py-1 [&_th]:h-9',
          density === 'default' && '[&_td]:h-row [&_td]:py-1.5 [&_th]:h-10',
          density === 'comfortable' && '[&_td]:h-12 [&_td]:py-2.5 [&_th]:h-11',
          striped && '[&_tbody_tr:nth-child(even)]:bg-surface-2/60',
          stickyHeader && '[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10',
          gridLines && '[&_td+td]:border-l [&_th+th]:border-l',
          inset && '[&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4',
          className,
        )}
        {...rest}
      />
    </div>
  );
});

export const THead = (p: HTMLAttributes<HTMLTableSectionElement>) => <thead {...p} />;
export const TBody = (p: HTMLAttributes<HTMLTableSectionElement>) => <tbody {...p} />;
export function TFoot({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot className={cn('[&_td]:border-t [&_td]:border-border-strong [&_td]:bg-surface-2 [&_td]:font-semibold', className)} {...rest} />;
}

export interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
  /** linha clicável (hover + cursor) */
  interactive?: boolean;
  /** linha de agrupamento (etapa da EAP): fundo e peso */
  group?: boolean | 1 | 2 | 3;
}

export function Tr({ selected, interactive, group, className, ...rest }: TrProps) {
  return (
    <tr
      aria-selected={selected || undefined}
      className={cn(
        'transition-colors duration-75',
        interactive && 'cursor-pointer hover:bg-primary-soft/40',
        selected && 'bg-primary-soft/70 hover:bg-primary-soft/80',
        (group === true || group === 1) && 'bg-sunken font-semibold [&_td]:border-border',
        group === 2 && 'bg-surface-2 font-medium',
        group === 3 && 'bg-surface-2/50',
        className,
      )}
      {...rest}
    />
  );
}

export type SortDir = 'asc' | 'desc' | null;

export interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
  /** habilita indicador de ordenação; `onSort` chamado ao clicar */
  sort?: SortDir;
  onSort?: () => void;
  width?: number | string;
}

export function Th({ numeric, sort, onSort, width, className, children, style, ...rest }: ThProps) {
  const sortable = onSort !== undefined;
  const Icon = sort === 'asc' ? ArrowUp : sort === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <th
      scope="col"
      aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : undefined}
      style={{ width, ...style }}
      className={cn(
        'whitespace-nowrap border-b border-border-strong bg-surface-2 px-3 text-left align-middle first:pl-4 last:pr-4',
        'font-sans text-2xs font-semibold uppercase tracking-[0.06em] text-fg-muted',
        numeric && 'text-right',
        className,
      )}
      {...rest}
    >
      {sortable ? (
        <button type="button" onClick={onSort} className={cn('inline-flex items-center gap-1 uppercase hover:text-fg focus-visible:outline-none focus-visible:underline', numeric && 'flex-row-reverse')}>
          {children}
          <Icon aria-hidden className={cn('h-3 w-3', !sort && 'opacity-40')} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** alinhado à direita, fonte mono tabular */
  numeric?: boolean;
  /** fonte mono (códigos SINAPI) sem alinhar à direita */
  mono?: boolean;
  muted?: boolean;
  /** trunca com reticências (defina largura na coluna) */
  truncate?: boolean;
}

export function Td({ numeric, mono, muted, truncate, className, ...rest }: TdProps) {
  return (
    <td
      className={cn(
        'px-3 align-middle text-fg first:pl-4 last:pr-4',
        numeric && 'num whitespace-nowrap text-right',
        mono && 'whitespace-nowrap font-mono text-xs',
        muted && 'text-fg-muted',
        truncate && 'max-w-0 truncate',
        className,
      )}
      {...rest}
    />
  );
}

/** Linha de estado vazio/carregando que ocupa todas as colunas. */
export function TableMessage({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="h-24 px-2 text-center text-sm text-fg-muted">
        {children}
      </td>
    </tr>
  );
}
