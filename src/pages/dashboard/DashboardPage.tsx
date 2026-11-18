import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Calculator, CheckCircle2, Plus, Ruler } from 'lucide-react';
import { useObras } from '@/api/core/obras';
import { useDashboard } from '@/api/orcamento/analises';
import { useOrcamentos } from '@/api/orcamento/orcamentos';
import { BarrasHorizontais } from '@/components/charts';
import { BarraPercentual, DataBaseTag, ErroCarregamento, Rotulo, StatusObra, StatusOrcamento } from '@/components/orcamento/comum';
import {
  Button, Card, CardHeader, EmptyState, PageHeader, Skeleton, Stat, TBody, THead, Table, TableMessage, Td, Th, Tr,
} from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { formatBRL, formatMesAno, formatNumero, formatPercent, formatRelativo } from '@/lib/format';
import { LABEL_OBRA_STATUS, LABEL_ORCAMENTO_STATUS } from '@/lib/labels';
import { rotas } from '@/routes';
import type { ObraStatus, OrcamentoStatus } from '@/types/database';

const ORDEM_OBRA: ObraStatus[] = ['planejamento', 'orcamento', 'em_execucao', 'paralisada', 'concluida', 'cancelada'];
const COR_OBRA: Record<ObraStatus, number> = { planejamento: 5, orcamento: 4, em_execucao: 0, paralisada: 2, concluida: 1, cancelada: 3 };
const ORDEM_ORC: OrcamentoStatus[] = ['rascunho', 'em_revisao', 'aprovado', 'arquivado'];
const BG_ORC: Record<OrcamentoStatus, string> = { rascunho: 'bg-chart-6', em_revisao: 'bg-chart-5', aprovado: 'bg-chart-1', arquivado: 'bg-chart-4' };

/** Painel da organização (fn_dashboard_resumo). Dono: FRONTEND-2. */
export default function DashboardPage() {
  const { organizacao, podeEditar } = useOrganizacao();
  const navigate = useNavigate();
  const dash = useDashboard();
  const orcs = useOrcamentos();
  const obras = useObras();
  const d = dash.data;

  const obrasTotal = d ? Object.values(d.obras_por_status).reduce((s, n) => s + (n ?? 0), 0) : 0;
  const porStatusOrc = ORDEM_ORC.map((s) => {
    const lista = (orcs.data ?? []).filter((o) => o.status === s);
    return { status: s, n: lista.length, valor: lista.reduce((a, o) => a + o.total, 0) };
  });
  const pctMedido = d && d.valor_aprovado_total > 0 ? (d.medido_total / d.valor_aprovado_total) * 100 : null;

  return (
    <>
      <PageHeader
        title="Painel"
        description={organizacao ? `Visão geral de ${organizacao.nome}` : 'Visão geral da organização'}
        actions={
          podeEditar && (
            <>
              <Button leftIcon={<Building2 />} onClick={() => navigate(rotas.obras + '?nova=1')}>Nova obra</Button>
              <Button variant="primary" leftIcon={<Plus />} onClick={() => navigate(rotas.orcamentos + '?novo=1')}>Novo orçamento</Button>
            </>
          )
        }
      />

      {dash.isError && <ErroCarregamento erro={dash.error} onRetry={() => void dash.refetch()} />}


      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {dash.isLoading || !d ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[92px]" />)
        ) : (
          <>
            <Stat label="Valor orçado" value={formatBRL(d.valor_orcado_total)} hint={`${d.orcamentos_total} orçamento(s)`} icon={<Calculator />} highlight />
            <Stat label="Valor aprovado" value={formatBRL(d.valor_aprovado_total)} hint={d.valor_orcado_total > 0 ? `${formatPercent((d.valor_aprovado_total / d.valor_orcado_total) * 100, 1)} do orçado` : 'Nenhum aprovado'} icon={<CheckCircle2 />} />
            <Stat label="Medido acumulado" value={formatBRL(d.medido_total)} hint={
                pctMedido !== null
                  ? `${formatPercent(pctMedido, 1)} do aprovado`
                  : d.medido_total > 0 && d.valor_orcado_total > 0
                    ? `${formatPercent((d.medido_total / d.valor_orcado_total) * 100, 1)} do orçado`
                    : 'Sem medições'
              } icon={<Ruler />} />
            <Stat
              label="Obras"
              value={<span>{obrasTotal}</span>}
              hint={`${d.obras_por_status.em_execucao ?? 0} em execução`}
              icon={<Building2 />}
            />
          </>
        )}
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
        <Card flush accent>
          <CardHeader
            eyebrow="Atividade"
            title="Últimos orçamentos"
            actions={<Link to={rotas.orcamentos} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Ver todos <ArrowRight className="h-3 w-3" /></Link>}
          />
          <Table density="default" className="[&_td]:px-3 [&_th]:px-3" containerClassName="rounded-none border-0">
            <THead>
              <Tr>
                <Th>Orçamento</Th>
                <Th>Obra</Th>
                <Th>Status</Th>
                <Th numeric>Total (R$)</Th>
                <Th numeric width={90}>Atualizado</Th>
              </Tr>
            </THead>
            <TBody>
              {dash.isLoading && <TableMessage colSpan={5}>Carregando…</TableMessage>}
              {d && d.ultimos_orcamentos.length === 0 && (
                <TableMessage colSpan={5}>Nenhum orçamento ainda. {podeEditar && <Link className="text-primary hover:underline" to={rotas.orcamentos + '?novo=1'}>Criar o primeiro</Link>}</TableMessage>
              )}
              {d?.ultimos_orcamentos.map((o) => (
                <Tr key={o.id} interactive onClick={() => navigate(rotas.orcamento(o.id))}>
                  <Td className="font-medium"><Link to={rotas.orcamento(o.id)} className="hover:underline" onClick={(e) => e.stopPropagation()}>{o.nome}</Link></Td>
                  <Td muted truncate className="max-w-[240px]" title={o.obra_nome}>{o.obra_nome}</Td>
                  <Td><StatusOrcamento status={o.status} /></Td>
                  <Td numeric>{formatBRL(o.total, '—').replace('R$ ', '')}</Td>
                  <Td numeric muted className="text-xs">{formatRelativo(o.updated_at)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card flush>
          <CardHeader eyebrow="Carteira" title="Obras recentes" actions={<Link to={rotas.obras} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Ver todas <ArrowRight className="h-3 w-3" /></Link>} />
          <Table className="[&_td]:px-3 [&_th]:px-3" containerClassName="rounded-none border-0">
            <THead>
              <Tr><Th width={100}>Código</Th><Th>Obra</Th><Th>Local</Th><Th>Status</Th><Th numeric>Área (m²)</Th><Th numeric>Atualizada</Th></Tr>
            </THead>
            <TBody>
              {obras.isLoading && <TableMessage colSpan={6}>Carregando…</TableMessage>}
              {obras.data?.length === 0 && <TableMessage colSpan={6}>Nenhuma obra cadastrada.</TableMessage>}
              {(obras.data ?? []).slice(0, 6).map((o) => (
                <Tr key={o.id} interactive onClick={() => navigate(rotas.obra(o.id))}>
                  <Td mono muted>{o.codigo ?? '—'}</Td>
                  <Td className="font-medium">{o.nome}</Td>
                  <Td muted>{o.municipio ?? '—'}</Td>
                  <Td><StatusObra status={o.status} /></Td>
                  <Td numeric>{formatNumero(o.area_construida_m2)}</Td>
                  <Td numeric muted className="text-xs">{formatRelativo(o.updated_at)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex items-center justify-between">
              <Rotulo>Data-base vigente</Rotulo>
              <Link to={rotas.sinapi} className="text-xs text-primary hover:underline">Consultar</Link>
            </div>
            {dash.isLoading ? (
              <Skeleton className="mt-2 h-6 w-48" />
            ) : d?.data_base_mais_recente ? (
              <div className="mt-2">
                <div className="font-display text-xl font-semibold">{formatMesAno(d.data_base_mais_recente.ano, d.data_base_mais_recente.mes, true)}</div>
                <DataBaseTag db={d.data_base_mais_recente} className="mt-1" />
              </div>
            ) : (
              <p className="mt-2 text-sm text-fg-muted">Nenhuma data-base publicada.</p>
            )}
          </Card>

          <Card flush>
            <CardHeader eyebrow="Carteira" title="Obras por status" />
            <div className="px-3 py-3">
              {d && obrasTotal > 0 ? (
                <BarrasHorizontais
                  nomeValor="Obras"
                  formatar={(v) => String(v)}
                  dados={ORDEM_OBRA.filter((s) => (d.obras_por_status[s] ?? 0) > 0).map((s) => ({ chave: s, rotulo: LABEL_OBRA_STATUS[s], valor: d.obras_por_status[s] ?? 0, cor: COR_OBRA[s] }))}
                />
              ) : (
                <EmptyState variant="inline" icon={<Building2 />} title="Sem obras" description="Cadastre a primeira obra para começar a orçar." className="py-6" />
              )}
            </div>
          </Card>

          <Card flush>
            <CardHeader eyebrow="Pipeline" title="Orçamentos por status" />
            <ul className="divide-y divide-grid">
              {porStatusOrc.map((s) => {
                const max = Math.max(1, ...porStatusOrc.map((x) => x.valor));
                return (
                  <li key={s.status} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 px-4 py-2">
                    <span className="text-sm text-fg-muted">{LABEL_ORCAMENTO_STATUS[s.status]}</span>
                    <BarraPercentual valor={(s.valor / max) * 100} cor={BG_ORC[s.status]} />
                    <span className="num text-right text-xs">
                      <span className="text-fg">{formatBRL(s.valor)}</span> <span className="text-fg-subtle">· {s.n}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
