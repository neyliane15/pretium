import { useCallback, useEffect, useRef } from 'react';

/** Retorna uma função que executa `fn` após `ms` sem novas chamadas (debounce). */
export function useDebouncedCallback(fn: () => void, ms: number): { agendar: () => void; cancelar: () => void; pendente: () => boolean } {
  const ref = useRef(fn);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const agendar = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      ref.current();
    }, ms);
  }, [ms]);
  const cancelar = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const pendente = useCallback(() => timer.current !== null, []);
  return { agendar, cancelar, pendente };
}
