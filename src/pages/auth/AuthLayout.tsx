import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { isSupabaseConfigured } from '@/lib/supabase';

/** Moldura das telas de autenticação: malha de prancha + cartão com cantoneiras. Dono: FRONTEND-1. */
export function AuthLayout({ titulo, subtitulo, children, rodape }: { titulo: string; subtitulo?: string; children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className="blueprint-grid flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex justify-center text-fg">
          <Logo height={30} />
        </div>
        <div className="corner-marks corner-marks-brand rounded border border-border bg-surface p-6 shadow-md">
          <h1 className="font-display text-xl font-semibold">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-sm text-fg-muted">{subtitulo}</p>}
          {!isSupabaseConfigured && (
            <p className="mt-3 rounded-sm border border-warning/30 bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
              Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local.
            </p>
          )}
          <div className="mt-5">{children}</div>
        </div>
        {rodape && <div className="mt-4 text-center text-sm text-fg-muted">{rodape}</div>}
        <p className="mt-8 text-center font-mono text-2xs uppercase tracking-[0.1em] text-fg-subtle">Orçamento de obras · SINAPI-RJ</p>
      </div>
    </div>
  );
}
