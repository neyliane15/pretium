import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { formatMesAno } from '@/lib/format';

export interface AuthLayoutProps {
  titulo: string;
  subtitulo?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  /** rótulo técnico acima do título (ex.: "ACESSO") */
  eyebrow?: string;
  /** largura do cartão (padrão 380) */
  largura?: number;
}

const hoje = new Date();

/** Carimbo de prancha técnica (bloco de legenda) do painel lateral. */
function Carimbo() {
  const linhas: [string, string][] = [
    ['Projeto', 'Orçamento de obras'],
    ['Referência', 'SINAPI · Caixa'],
    ['Localidade', 'Rio de Janeiro · RJ'],
    ['Emissão', formatMesAno(hoje.getFullYear(), hoje.getMonth() + 1)],
  ];
  return (
    <dl className="grid grid-cols-2 border border-sidebar-border font-mono text-2xs uppercase tracking-[0.08em]">
      {linhas.map(([k, v], i) => (
        <div key={k} className={`px-3 py-2 ${i % 2 === 0 ? 'border-r' : ''} ${i < 2 ? 'border-b' : ''} border-sidebar-border`}>
          <dt className="text-sidebar-muted/80">{k}</dt>
          <dd className="mt-0.5 normal-case tracking-normal text-sidebar-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Moldura das telas de autenticação: painel petróleo com malha + cartão com cantoneiras. Dono: FRONTEND-1. */
export function AuthLayout({ titulo, subtitulo, children, rodape, eyebrow, largura = 380 }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="relative hidden w-[44%] max-w-[620px] flex-col justify-between overflow-hidden border-r border-sidebar-border bg-sidebar p-10 text-sidebar-fg lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(rgb(var(--c-sidebar-border)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--c-sidebar-border)) 1px, transparent 1px), linear-gradient(rgb(var(--c-sidebar-border) / .45) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--c-sidebar-border) / .45) 1px, transparent 1px)',
            backgroundSize: '96px 96px, 96px 96px, 24px 24px, 24px 24px',
          }}
        />
        {/* cota técnica decorativa */}
        <svg aria-hidden className="absolute right-10 top-24 h-44 w-44 text-sidebar-border" viewBox="0 0 200 200" fill="none">
          <rect x="30" y="30" width="140" height="140" stroke="currentColor" />
          <rect x="60" y="60" width="80" height="80" stroke="rgb(var(--c-brand))" strokeOpacity=".9" />
          <path d="M30 185H170M30 180V190M170 180V190" stroke="currentColor" />
          <path d="M15 30V170M10 30H20M10 170H20" stroke="currentColor" />
          <path d="M60 60L140 140M140 60L60 140" stroke="currentColor" strokeDasharray="3 4" />
        </svg>
        <div className="relative">
          <Logo height={30} className="text-sidebar-fg" />
        </div>
        <div className="relative max-w-[380px]">
          <div className="mb-3 h-[2px] w-10 bg-brand" />
          <h2 className="font-display text-3xl font-semibold leading-9 text-sidebar-fg">Orçamentos precisos, do insumo ao BDI.</h2>
          <p className="mt-3 text-base leading-6 text-sidebar-muted">
            Composições SINAPI-RJ, memória de cálculo, cronograma físico-financeiro, curva ABC e medições — num só lugar, para o seu escritório.
          </p>
        </div>
        <div className="relative">
          <Carimbo />
        </div>
      </aside>

      <main className="blueprint-grid flex flex-1 items-center justify-center p-6">
        <div className="w-full" style={{ maxWidth: largura }}>
          <div className="mb-6 flex justify-center text-fg lg:hidden">
            <Logo height={30} />
          </div>
          <div className="corner-marks corner-marks-brand relative rounded border border-border-strong bg-surface p-6 shadow-md">
                        {eyebrow && <div className="mb-1 font-mono text-2xs uppercase tracking-[0.12em] text-fg-subtle">{eyebrow}</div>}
            <h1 className="font-display text-xl font-semibold">{titulo}</h1>
            {subtitulo && <p className="mt-1 text-sm text-fg-muted">{subtitulo}</p>}
            <div className="mt-5">{children}</div>
          </div>
          {rodape && <div className="mt-4 text-center text-sm text-fg-muted">{rodape}</div>}
          <p className="mt-8 text-center font-mono text-2xs uppercase tracking-[0.12em] text-fg-subtle">Pretium · Orçamento de obras · SINAPI-RJ</p>
        </div>
      </main>
    </div>
  );
}
