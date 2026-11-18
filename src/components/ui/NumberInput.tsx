import { forwardRef, useEffect, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { formatNumero, parseNumeroBR } from '@/lib/format';
import { Input, type InputProps } from './Input';

export interface NumberInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type' | 'defaultValue'> {
  value: number | null | undefined;
  /** chamado no blur/Enter com o número interpretado (null se vazio) */
  onChange: (value: number | null) => void;
  /** casas decimais exibidas fora de edição */
  decimals?: number;
  min?: number;
  max?: number;
}

/**
 * Entrada numérica pt-BR: aceita "1.234,56", "1234,56" ou "1234.56"; formata no blur.
 * Valor só é propagado no blur ou Enter (evita recálculo a cada tecla). Esc desfaz.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onChange, decimals = 2, min, max, onBlur, onKeyDown, onFocus, ...rest },
  ref,
) {
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '' : formatNumero(v, decimals, ''));
  const [text, setText] = useState(fmt(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, editing]);

  const commit = () => {
    let n = parseNumeroBR(text);
    if (n !== null) {
      if (min !== undefined && n < min) n = min;
      if (max !== undefined && n > max) n = max;
    }
    setEditing(false);
    if (n !== (value ?? null)) onChange(n);
    setText(fmt(n));
  };

  return (
    <Input
      ref={ref}
      inputMode="decimal"
      numeric
      autoComplete="off"
      {...rest}
      value={text}
      onFocus={(e: FocusEvent<HTMLInputElement>) => {
        setEditing(true);
        e.currentTarget.select();
        onFocus?.(e);
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => {
        commit();
        onBlur?.(e);
      }}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setText(fmt(value));
          setEditing(false);
          e.currentTarget.blur();
        }
        onKeyDown?.(e);
      }}
    />
  );
});
