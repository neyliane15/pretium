import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** ocupa 100% da largura */
  block?: boolean;
}

const base =
  'relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded font-medium ' +
  'transition-[background-color,border-color,color,box-shadow] duration-100 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg ' +
  'disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0';

export const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg shadow-xs hover:bg-primary-hover border border-black/10',
  secondary: 'border border-border-strong bg-surface text-fg shadow-xs hover:bg-surface-2 hover:border-fg-subtle',
  ghost: 'text-fg-muted hover:bg-sunken hover:text-fg',
  danger: 'bg-danger text-white shadow-xs hover:brightness-95 border border-black/10',
  accent: 'bg-accent text-accent-fg shadow-xs hover:brightness-95 border border-black/10',
  link: 'h-auto px-0 text-primary underline-offset-2 hover:underline',
};

export const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-control-sm px-2 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5',
  md: 'h-control px-3 text-base [&_svg]:h-4 [&_svg]:w-4',
  lg: 'h-control-lg px-4 text-md [&_svg]:h-4 [&_svg]:w-4',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, leftIcon, rightIcon, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, buttonVariants[variant], variant !== 'link' && buttonSizes[size], block && 'w-full', className)}
      {...rest}
    >
      {loading ? <Spinner size="xs" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'children'> {
  /** obrigatório: rótulo acessível (também vira tooltip nativo) */
  label: string;
  icon: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 'md', variant = 'ghost', className, ...rest },
  ref,
) {
  const sq = size === 'sm' ? 'w-control-sm px-0' : size === 'lg' ? 'w-control-lg px-0' : 'w-control px-0';
  return (
    <Button ref={ref} aria-label={label} title={label} size={size} variant={variant} className={cn(sq, className)} {...rest}>
      {icon}
    </Button>
  );
});
