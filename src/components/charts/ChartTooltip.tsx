import type { ReactNode } from 'react';

export interface LinhaTooltip {
  cor?: string;
  rotulo: ReactNode;
  valor: ReactNode;
}

/** Caixa de tooltip dos gráficos no padrão Pretium (borda fina, rótulo mono). */
export function ChartTooltipBox({ titulo, linhas }: { titulo?: ReactNode; linhas: LinhaTooltip[] }) {
  return (
    <div className="min-w-[160px] rounded border border-border-strong bg-surface px-2.5 py-2 text-xs shadow-md">
      {titulo && <div className="mb-1 font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle">{titulo}</div>}
      <div className="space-y-0.5">
        {linhas.map((l, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-fg-muted">
              {l.cor && <span aria-hidden className="h-2 w-2 rounded-xs" style={{ background: l.cor }} />}
              {l.rotulo}
            </span>
            <span className="num font-medium text-fg">{l.valor}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Legenda compacta (fora do SVG, acessível). */
export function Legenda({ itens }: { itens: { cor: string; rotulo: ReactNode; tracejado?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
      {itens.map((i, k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span aria-hidden className={i.tracejado ? 'h-0 w-3 border-t-2 border-dashed' : 'h-2 w-3 rounded-xs'} style={i.tracejado ? { borderColor: i.cor } : { background: i.cor }} />
          {i.rotulo}
        </li>
      ))}
    </ul>
  );
}
