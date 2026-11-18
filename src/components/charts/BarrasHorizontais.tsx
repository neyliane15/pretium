import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltipBox } from './ChartTooltip';
import { eixo, useTemaGrafico } from './tema';

export interface BarraH {
  chave: string;
  rotulo: string;
  valor: number;
  /** índice da série (0–5) — cor fixa pela entidade */
  cor?: number;
}

/** Barras horizontais com rótulo de valor no fim (obras por status, horas por função…). */
export function BarrasHorizontais({
  dados, formatar, altura, larguraRotulo = 110, nomeValor = 'Valor',
}: { dados: readonly BarraH[]; formatar: (v: number) => string; altura?: number; larguraRotulo?: number; nomeValor?: string }) {
  const t = useTemaGrafico();
  const h = altura ?? Math.max(120, dados.length * 26 + 24);
  return (
    <div style={{ height: h }} role="img" aria-label={nomeValor}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados as BarraH[]} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={4}>
          <CartesianGrid stroke={t.grid} horizontal={false} />
          <XAxis type="number" {...eixo(t)} tickFormatter={formatar} hide />
          <YAxis type="category" dataKey="rotulo" {...eixo(t)} tick={{ ...eixo(t).tick, fill: t.muted, fontFamily: 'Inter, sans-serif', fontSize: 11 }} width={larguraRotulo} axisLine={false} />
          <Tooltip
            cursor={{ fill: t.grid, opacity: 0.6 }}
            content={({ active, payload }) => {
              const p = active && payload?.[0] ? (payload[0].payload as BarraH) : null;
              return p ? <ChartTooltipBox titulo={p.rotulo} linhas={[{ cor: t.series[p.cor ?? 0], rotulo: nomeValor, valor: formatar(p.valor) }]} /> : null;
            }}
          />
          <Bar dataKey="valor" radius={[0, 2, 2, 0]} isAnimationActive={false} maxBarSize={16}>
            {dados.map((d) => (
              <Cell key={d.chave} fill={t.series[d.cor ?? 0]} />
            ))}
            <LabelList dataKey="valor" position="right" formatter={(v: number) => formatar(v)} style={{ fill: t.muted, fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
