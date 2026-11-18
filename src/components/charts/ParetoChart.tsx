import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBRL, formatPercent } from '@/lib/format';
import type { ClasseAbc } from '@/types/database';
import { ChartTooltipBox, Legenda } from './ChartTooltip';
import { eixo, useTemaGrafico } from './tema';

export interface PontoPareto {
  posicao: number;
  rotulo: string;
  descricao: string;
  total: number;
  percentual: number;
  percentual_acumulado: number;
  classe: ClasseAbc;
}

/**
 * Pareto da curva ABC em UM eixo (%): barra = participação do item, linha = acumulado.
 * Faixas 80% / 95% como referência; barras coloridas pela classe (A laranja, B amarelo, C concreto).
 */
export function ParetoChart({ dados, altura = 300, maxBarras = 60 }: { dados: readonly PontoPareto[]; altura?: number; maxBarras?: number }) {
  const t = useTemaGrafico();
  const cor: Record<ClasseAbc, string> = { A: t.series[0], B: t.series[2], C: t.series[5] };
  const pts = dados.slice(0, maxBarras);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4">
        <Legenda
          itens={[
            { cor: cor.A, rotulo: 'Classe A (até 80%)' },
            { cor: cor.B, rotulo: 'Classe B (80–95%)' },
            { cor: cor.C, rotulo: 'Classe C (95–100%)' },
            { cor: t.fg, rotulo: '% acumulado', tracejado: false },
          ]}
        />
        {dados.length > maxBarras && <span className="text-xs text-fg-subtle">Exibindo os {maxBarras} primeiros de {dados.length}</span>}
      </div>
      <div style={{ height: altura }} role="img" aria-label="Gráfico de Pareto da curva ABC">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={pts} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis dataKey="posicao" {...eixo(t)} interval="preserveStartEnd" minTickGap={12} />
            <YAxis {...eixo(t)} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 95, 100]} tickFormatter={(v: number) => `${v}%`} width={40} />
            <ReferenceLine y={80} stroke={t.subtle} strokeDasharray="3 3" />
            <ReferenceLine y={95} stroke={t.subtle} strokeDasharray="3 3" />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.6 }}
              content={({ active, payload }) => {
                const p = active && payload?.[0] ? (payload[0].payload as PontoPareto) : null;
                if (!p) return null;
                return (
                  <ChartTooltipBox
                    titulo={`#${p.posicao} · ${p.rotulo} · Classe ${p.classe}`}
                    linhas={[
                      { rotulo: p.descricao.length > 48 ? p.descricao.slice(0, 47) + '…' : p.descricao, valor: '' },
                      { cor: cor[p.classe], rotulo: 'Total', valor: formatBRL(p.total) },
                      { rotulo: 'Participação', valor: formatPercent(p.percentual) },
                      { rotulo: 'Acumulado', valor: formatPercent(p.percentual_acumulado) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="percentual" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {pts.map((p) => (
                <Cell key={p.posicao} fill={cor[p.classe]} />
              ))}
            </Bar>
            <Line dataKey="percentual_acumulado" type="monotone" stroke={t.fg} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: t.surface, strokeWidth: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
