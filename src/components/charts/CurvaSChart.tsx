import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBRL, formatPercent } from '@/lib/format';
import { ChartTooltipBox, Legenda } from './ChartTooltip';
import { eixo, useTemaGrafico } from './tema';

export interface PontoCurvaS {
  rotulo: string;
  /** período por extenso (tooltip) */
  detalhe?: string;
  valor: number;
  acumulado: number;
  percentual: number;
  percentualAcumulado: number;
}

/**
 * Cronograma: desembolso por período (barras) + curva S acumulada (linha), ambos em % do total —
 * um único eixo; valores em R$ no tooltip.
 */
export function CurvaSChart({ dados, altura = 280 }: { dados: readonly PontoCurvaS[]; altura?: number }) {
  const t = useTemaGrafico();
  return (
    <div>
      <div className="mb-2">
        <Legenda itens={[{ cor: t.series[1], rotulo: '% do período' }, { cor: t.series[0], rotulo: 'Curva S (% acumulado)' }]} />
      </div>
      <div style={{ height: altura }} role="img" aria-label="Curva S do cronograma físico-financeiro">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dados as PontoCurvaS[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis dataKey="rotulo" {...eixo(t)} minTickGap={8} />
            <YAxis {...eixo(t)} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} width={40} />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.6 }}
              content={({ active, payload }) => {
                const p = active && payload?.[0] ? (payload[0].payload as PontoCurvaS) : null;
                if (!p) return null;
                return (
                  <ChartTooltipBox
                    titulo={p.detalhe ?? p.rotulo}
                    linhas={[
                      { cor: t.series[1], rotulo: 'No período', valor: `${formatBRL(p.valor)} · ${formatPercent(p.percentual)}` },
                      { cor: t.series[0], rotulo: 'Acumulado', valor: `${formatBRL(p.acumulado)} · ${formatPercent(p.percentualAcumulado)}` },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="percentual" fill={t.series[1]} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            <Line dataKey="percentualAcumulado" type="monotone" stroke={t.series[0]} strokeWidth={2} dot={{ r: 3, fill: t.series[0], stroke: t.surface, strokeWidth: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
