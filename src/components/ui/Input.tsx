import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Classes compartilhadas por todos os controles de formulário. */
export const controlBase =
  'w-full rounded border border-border-strong bg-surface text-fg placeholder:text-fg-subtle shadow-xs ' +
  'transition-[border-color,box-shadow] duration-100 ' +
  'hover:border-fg-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/25 ' +
  'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-fg-subtle ' +
  'read-only:bg-sunken read-only:focus:ring-0 ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/25';

export const controlSizes = {
  sm: 'h-control-sm px-2 text-xs',
  md: 'h-control px-2.5 text-base',
  lg: 'h-control-lg px-3 text-md',
} as const;

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: keyof typeof controlSizes;
  /** ícone ou texto à esquerda (ex.: <Search/> ou "R$") */
  prefix?: ReactNode;
  /** ícone ou texto à direita (ex.: "m²") */
  suffix?: ReactNode;
  /** alinha à direita e usa fonte mono tabular (valores numéricos) */
  numeric?: boolean;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', prefix, suffix, numeric, invalid, className, ...rest },
  ref,
) {
  const input = (
    <input
      ref={ref}
      aria-invalid={invalid || rest['aria-invalid'] || undefined}
      className={cn(controlBase, controlSizes[size], numeric && 'num text-right', prefix && 'pl-7', suffix && (typeof suffix === 'string' && suffix.length > 2 ? 'pr-11' : 'pr-8'), className)}
      {...rest}
    />
  );
  if (!prefix && !suffix) return input;
  return (
    <div className="relative w-full">
      {prefix && (
        <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-fg-subtle [&_svg]:h-3.5 [&_svg]:w-3.5">{prefix}</span>
      )}
      {input}
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-fg-subtle [&_svg]:h-3.5 [&_svg]:w-3.5">{suffix}</span>
      )}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ invalid, className, rows = 3, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || rest['aria-invalid'] || undefined}
      className={cn(controlBase, 'min-h-[60px] px-2.5 py-1.5 text-base leading-5', className)}
      {...rest}
    />
  );
});
