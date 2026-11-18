import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
  description?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, description, className, ...rest }, ref) {
  const box = (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'h-3.5 w-3.5 shrink-0 cursor-pointer rounded-xs border border-border-strong bg-surface accent-[rgb(var(--c-primary))]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  );
  if (!label) return box;
  return (
    <label className="inline-flex cursor-pointer items-start gap-2 text-base text-fg">
      <span className="mt-[3px]">{box}</span>
      <span className="flex flex-col">
        <span>{label}</span>
        {description && <span className="text-xs text-fg-subtle">{description}</span>}
      </span>
    </label>
  );
});
