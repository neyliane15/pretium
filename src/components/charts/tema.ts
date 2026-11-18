/**
 * Cores dos gráficos lidas dos tokens CSS (claro/escuro) — o SVG do recharts não resolve var().
 * Dono: FRONTEND-2.
 */
import { useEffect, useState } from 'react';

export interface TemaGrafico {
  series: [string, string, string, string, string, string];
  fg: string;
  muted: string;
  subtle: string;
  grid: string;
  border: string;
  surface: string;
  brand: string;
  danger: string;
  success: string;
}

const ler = (nome: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--c-${nome}`).trim();
  return v ? `rgb(${v.split(/\s+/).join(', ')})` : fallback;
};

export function lerTema(): TemaGrafico {
  return {
    series: [
      ler('chart-1', '#F26B1D'), ler('chart-2', '#102E38'), ler('chart-3', '#F5B800'),
      ler('chart-4', '#5B6166'), ler('chart-5', '#1B6A86'), ler('chart-6', '#C7C4BC'),
    ],
    fg: ler('fg', '#1C2023'),
    muted: ler('fg-muted', '#5B6166'),
    subtle: ler('fg-subtle', '#6B7075'),
    grid: ler('grid', '#EAE8E3'),
    border: ler('border-strong', '#C7C4BC'),
    surface: ler('surface', '#FFFFFF'),
    brand: ler('brand', '#F26B1D'),
    danger: ler('danger', '#C8312B'),
    success: ler('success', '#1E7A45'),
  };
}

/** Tema atual, atualizado quando `data-theme` muda no <html>. */
export function useTemaGrafico(): TemaGrafico {
  const [tema, setTema] = useState(lerTema);
  useEffect(() => {
    const obs = new MutationObserver(() => setTema(lerTema()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onMq = () => setTema(lerTema());
    mq?.addEventListener?.('change', onMq);
    return () => {
      obs.disconnect();
      mq?.removeEventListener?.('change', onMq);
    };
  }, []);
  return tema;
}

/** Props comuns de eixos (fonte mono 10px, sem linha de eixo). */
export const eixo = (t: TemaGrafico) => ({
  tick: { fill: t.subtle, fontSize: 10, fontFamily: '"JetBrains Mono", ui-monospace, monospace' },
  axisLine: { stroke: t.border },
  tickLine: false as const,
});

/** Valores compactos para eixos: 1.250.000 → "1,25 mi". */
export function compacto(v: number): string {
  const a = Math.abs(v);
  const f = (x: number, s: string) => `${x.toLocaleString('pt-BR', { maximumFractionDigits: x >= 100 ? 0 : 2 })}${s}`;
  if (a >= 1e9) return f(v / 1e9, ' bi');
  if (a >= 1e6) return f(v / 1e6, ' mi');
  if (a >= 1e3) return f(v / 1e3, ' mil');
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
