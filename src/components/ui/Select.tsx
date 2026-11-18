import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { controlBase, controlSizes } from './Input';

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: keyof typeof controlSizes;
  options?: readonly SelectOption[];
  /** opção vazia inicial (ex.: "Selecione…") */
  placeholder?: string;
  invalid?: boolean;
}

/** Select nativo estilizado (acessível e rápido em tabelas densas). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = 'md', options, placeholder, invalid, className, children, ...rest },
  ref,
) {
  return (
    <div className="relative w-full">
      <select
        ref={ref}
        aria-invalid={invalid || rest['aria-invalid'] || undefined}
        // <select> casa com :read-only no Chromium; restaura o fundo/anel de controle editável
        className={cn(controlBase, controlSizes[size], 'cursor-pointer appearance-none pr-7 read-only:bg-surface read-only:focus:ring-2', 'disabled:bg-sunken', className)}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
    </div>
  );
});
