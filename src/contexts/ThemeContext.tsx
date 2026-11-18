import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Tema } from '@/types/database';

interface ThemeApi {
  /** preferência escolhida */
  tema: Tema;
  /** tema efetivamente aplicado */
  temaEfetivo: 'light' | 'dark';
  setTema: (t: Tema) => void;
  alternar: () => void;
}

const STORAGE_KEY = 'pretium.tema';
const ThemeContext = createContext<ThemeApi | null>(null);

function lerPreferencia(): Tema {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage indisponível */
  }
  return 'system';
}

const prefereEscuro = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

/** Aplica `data-theme` em <html>. O script inline do index.html faz o mesmo antes da hidratação (sem flash). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTemaState] = useState<Tema>(lerPreferencia);
  const [sistemaEscuro, setSistemaEscuro] = useState<boolean>(prefereEscuro);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const fn = (e: MediaQueryListEvent) => setSistemaEscuro(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const temaEfetivo: 'light' | 'dark' = tema === 'system' ? (sistemaEscuro ? 'dark' : 'light') : tema;

  useEffect(() => {
    document.documentElement.dataset.theme = temaEfetivo;
  }, [temaEfetivo]);

  const setTema = useCallback((t: Tema) => {
    setTemaState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const api = useMemo<ThemeApi>(
    () => ({ tema, temaEfetivo, setTema, alternar: () => setTema(temaEfetivo === 'dark' ? 'light' : 'dark') }),
    [tema, temaEfetivo, setTema],
  );
  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme precisa estar dentro de <ThemeProvider>.');
  return ctx;
}
