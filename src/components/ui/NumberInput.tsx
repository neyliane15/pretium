import { forwardRef, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
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
 *
 * Regras que evitam perder edições (planilha com atualização otimista e recálculo em segundo plano):
 * - enquanto o campo tem foco, mudanças externas de `value` (refetch, recálculo) não sobrescrevem o
 *   texto digitado;
 * - cada valor é emitido uma única vez: o Enter grava e o blur seguinte (ex.: foco indo para a próxima
 *   linha antes de a atualização otimista chegar) não reenvia o valor antigo da prop.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onChange, decimals = 2, min, max, onBlur, onKeyDown, onFocus, ...rest },
  ref,
) {
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '' : formatNumero(v, decimals, ''));
  const [text, setText] = useState(fmt(value));
  const [editing, setEditing] = useState(false);
  /** texto atual (sem depender do fechamento do render, ex.: blur disparado no mesmo evento do Esc) */
  const texto = useRef(text);
  /** último valor conhecido: o da prop ou o último emitido por este campo */
  const emitido = useRef<number | null>(value ?? null);

  const mudarTexto = (t: string) => {
    texto.current = t;
    setText(t);
  };

  useEffect(() => {
    emitido.current = value ?? null;
  }, [value]);

  useEffect(() => {
    if (!editing) mudarTexto(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, editing]);

  const commit = () => {
    let n = parseNumeroBR(texto.current);
    if (n !== null) {
      if (min !== undefined && n < min) n = min;
      if (max !== undefined && n > max) n = max;
    }
    if (n !== emitido.current) {
      emitido.current = n;
      onChange(n);
    }
    mudarTexto(fmt(n));
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
      onChange={(e) => {
        setEditing(true);
        mudarTexto(e.target.value);
      }}
      onBlur={(e) => {
        commit();
        setEditing(false);
        onBlur?.(e);
      }}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          mudarTexto(fmt(emitido.current));
          e.currentTarget.blur();
        }
        onKeyDown?.(e);
      }}
    />
  );
});
