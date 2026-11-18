import { forwardRef } from 'react';
import { cn } from '@/lib/cn';
import { Input, type InputProps } from './Input';

export interface DateInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  /** data ISO 'YYYY-MM-DD' ou null */
  value: string | null;
  onChange: (v: string | null) => void;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Data (seletor nativo do navegador, exibido em dd/mm/aaaa no pt-BR). Valor sempre ISO.
 * `min`/`max` também em ISO.
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput({ value, onChange, className, ...rest }, ref) {
  return (
    <Input
      ref={ref}
      type="date"
      {...rest}
      value={value && ISO.test(value) ? value : ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v && ISO.test(v) ? v : null);
      }}
      className={cn(
        'num pr-1.5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100',
        '[[data-theme=dark]_&::-webkit-calendar-picker-indicator]:invert',
        className,
      )}
    />
  );
});
