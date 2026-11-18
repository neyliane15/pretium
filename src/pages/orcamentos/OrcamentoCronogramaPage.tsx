import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Eraser, MoveHorizontal, Save } from 'lucide-react';
import { useCronograma, useSalvarCronograma } from '@/api/orcamento/analises';
import { useEtapas } from '@/api/orcamento/orcamentos';
import { CurvaSChart } from '@/components/charts';
import { BotoesExportar } from '@/components/orcamento/BotoesExportar';
import { ErroCarregamento, Rotulo } from '@/components/orcamento/comum';
import { useOrcamentoContexto } from '@/components/orcamento/contexto';
import { distribuirLinear, paraDistribuicoes, totaisCronograma, type Distribuicao } from '@/components/orcamento/cronograma';
import {
  Alert, Button, Card, CardHeader, DateInput, EmptyState, Field, IconButton, LoadingBlock, Modal, NumberInput, Select, TBody, TFoot, THead, Table,
  Tabs, Td, Th, Tooltip, Tr, useToast,
} from '@/components/ui';
import { useMetaOrcamento } from '@/hooks/orcamento/useMetaOrcamento';
import { gerarPeriodos, type Periodicidade } from '@/lib/calc';
import { cn } from '@/lib/cn';
import { formatData, formatMesAbrev, formatMoeda, formatNumero, parseIsoDate } from '@/lib/format';
import { LABEL_PERIODICIDADE, opcoes } from '@/lib/labels';
import { tabelaCronograma } from '@/lib/export/relatorios';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';

const hoje = () => new Date().toISOString().slice(0, 10);

/** Cronograma físico-financeiro: grade etapa × período, curva S. Dono: FRONTEND-2. */
export default function OrcamentoCronogramaPage() {
  const { orcamento, editavel } = useOrcamentoContexto();
  const toast = useToast();
  const meta = useMetaOrcamento();
  const etapasQ = useEtapas(orcamento.id);
  const crono = useCronograma(orcamento.id);
  const salvar = useSalvarCronograma(orcamento.id);
  const [inicio, setInicio] = useState<string>(hoje());
  const [period, setPeriod] = useState<Periodicidade>('mensal');
  const [n, setN] = useState<number>(6);
  const [dist, setDist] = useState<Distribuicao>(new Map());
  const [sujo, setSujo] = useState(false);
  const [ver, setVer] = useState<'pct' | 'valor'>('pct');
  const [linear, setLinear] = useState<{ etapa: string; ini: number; fim: number } | null>(null);

  const etapas = useMemo(() => (etapasQ.data ?? []).filter((e) => !e.parent_id).sort((a, b) => a.ordem - b.ordem), [etapasQ.data]);

  useEffect(() => {
    if (!crono.data || sujo) return;
    const c = crono.data.cronograma;
    if (c) {
      setInicio(c.data_inicio);
      setPeriod(c.periodicidade);
      setN(c.num_periodos);
    }
    const m: Distribuicao = new Map();
    for (const d of crono.data.distribuicoes) {
      const arr = m.get(d.etapa_id) ?? [];
      arr[d.periodo - 1] = d.percentual;
      m.set(d.etapa_id, arr);
    }
    setDist(m);
  }, [crono.data, sujo]);

  const periodos = useMemo(() => gerarPeriodos(inicio, period, n), [inicio, period, n]);
  const tot = useMemo(() => totaisCronograma(etapas.map((e) => ({ id: e.id, total: e.total })), dist, n), [etapas, dist, n]);

  if (etapasQ.isLoading || crono.isLoading) return <LoadingBlock />;
  if (etapasQ.isError || crono.isError) return <ErroCarregamento erro={etapasQ.error ?? crono.error} />;
  if (etapas.length === 0) return <EmptyState icon={<CalendarRange />} title="Sem etapas" description="Crie a EAP na planilha para montar o cronograma." />;

  const setPct = (etapa: string, k: number, v: number | null) => {
    setDist((m) => {
      const novo = new Map(m);
      const arr = [...(novo.get(etapa) ?? [])];
      arr[k] = v ?? 0;
      novo.set(etapa, arr);
      return novo;
    });
    setSujo(true);
  };
  const incompletas = etapas.filter((e) => Math.abs((tot.somaPct.get(e.id) ?? 0) - 100) > 0.001);
  const excedidas = etapas.filter((e) => (tot.somaPct.get(e.id) ?? 0) > 100.0001);

  const onSalvar = async () => {
    if (excedidas.length) return toast.error('Há etapas acima de 100%', excedidas.map((e) => e.codigo).join(', '));
    try {
      await salvar.mutateAsync({ dataInicio: inicio, periodicidade: period, numPeriodos: n, distribuicoes: paraDistribuicoes(dist, n) });
      setSujo(false);
      toast.success('Cronograma salvo');
    } catch (e) {
      toast.error('Não foi possível salvar', mensagemErro(e));
    }
  };

  const rotuloP = (p: { inicio: string }) => (period === 'mensal' ? formatMesAbrev(parseIsoDate(p.inicio).getFullYear(), parseIsoDate(p.inicio).getMonth() + 1) : formatData(p.inicio).slice(0, 5));
  const tabela = () =>
    tabelaCronograma(meta, {
      periodos: periodos.map((p) => ({ periodo: p.periodo, inicio: p.inicio, fim: p.fim })),
      etapas: etapas.map((e) => ({ etapa_id: e.id, codigo: e.codigo, nome: e.nome, total: e.total, celulas: new Map(periodos.map((p, k) => [p.periodo, { percentual: dist.get(e.id)?.[k] ?? 0, valor: tot.valores.get(e.id)![k]! }])) })),
      totaisPeriodo: tot.porPeriodo,
      total: tot.total,
    });

  return (
    <div className="space-y-4">
      <Card flush accent>
        <CardHeader
          eyebrow="Cronograma físico-financeiro"
          title="Distribuição por período"
          description="% físico de cada etapa de 1º nível em cada período; valores = total da etapa × %."
          actions={
            <>
              <Tabs size="sm" variant="segmented" aria-label="Exibir" value={ver} onChange={setVer} items={[{ value: 'pct', label: '% físico' }, { value: 'valor', label: 'R$' }]} />
              <BotoesExportar tabela={tabela} imprimir={rotas.imprimirOrcamento(orcamento.id, 'cronograma')} />
              {editavel && <Button size="sm" variant="primary" leftIcon={<Save />} disabled={!sujo} loading={salvar.isPending} onClick={() => void onSalvar()}>Salvar</Button>}
            </>
          }
        />
        <div className="flex flex-wrap items-end gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
          <Field label="Início" className="w-40">{(p) => <DateInput {...p} size="sm" readOnly={!editavel} value={inicio} onChange={(v) => { if (v) { setInicio(v); setSujo(true); } }} />}</Field>
          <Field label="Periodicidade" className="w-36">{(p) => <Select {...p} size="sm" disabled={!editavel} value={period} onChange={(e) => { setPeriod(e.target.value as Periodicidade); setSujo(true); }} options={opcoes(LABEL_PERIODICIDADE)} />}</Field>
          <Field label="Nº de períodos" className="w-28">{(p) => <NumberInput {...p} size="sm" readOnly={!editavel} decimals={0} min={1} max={120} value={n} onChange={(v) => { setN(Math.max(1, Math.min(120, v ?? 1))); setSujo(true); }} />}</Field>
          <div className="ml-auto text-right">
            <Rotulo>Término</Rotulo>
            <div className="num text-sm">{formatData(periodos.at(-1)?.fim)}</div>
          </div>
        </div>
        {(incompletas.length > 0 || excedidas.length > 0) && (
          <div className="px-4 pt-3">
            <Alert variant={excedidas.length ? 'danger' : 'warning'}>
              {excedidas.length ? `Etapa(s) acima de 100%: ${excedidas.map((e) => e.codigo).join(', ')}.` : `${incompletas.length} etapa(s) não somam 100%: ${incompletas.map((e) => e.codigo).join(', ')}.`}
            </Alert>
          </div>
        )}
        <div className="p-3">
          <Table density="compact" gridLines stickyHeader containerClassName="max-h-[60vh]">
            <THead>
              <Tr>
                <Th width={44} className="sticky left-0 z-20">Item</Th>
                <Th className="sticky left-[44px] z-20 min-w-[200px]">Etapa</Th>
                <Th numeric width={110}>Total (R$)</Th>
                {periodos.map((p) => (
                  <Th key={p.periodo} numeric width={86} title={`${formatData(p.inicio)} a ${formatData(p.fim)}`}>
                    <div className="leading-3">P{p.periodo}</div>
                    <div className="font-mono text-2xs font-normal normal-case tracking-normal text-fg-subtle">{rotuloP(p)}</div>
                  </Th>
                ))}
                <Th numeric width={64}>Σ %</Th>
              </Tr>
            </THead>
            <TBody>
              {etapas.map((e) => {
                const soma = tot.somaPct.get(e.id) ?? 0;
                const pcts = dist.get(e.id) ?? [];
                return (
                  <Tr key={e.id}>
                    <Td mono className="sticky left-0 bg-surface">{e.codigo}</Td>
                    <Td className="sticky left-[44px] bg-surface">
                      <span className="flex items-center justify-between gap-1">
                        <span className="truncate" title={e.nome}>{e.nome}</span>
                        {editavel && <Tooltip content="Distribuir linearmente"><IconButton size="sm" className="h-5 shrink-0" label="Distribuir linearmente" icon={<MoveHorizontal />} onClick={() => setLinear({ etapa: e.id, ini: 1, fim: n })} /></Tooltip>}
                      </span>
                    </Td>
                    <Td numeric>{formatMoeda(e.total)}</Td>
                    {periodos.map((p, k) => {
                      const pct = pcts[k] ?? 0;
                      return (
                        <Td key={p.periodo} numeric className={cn('relative px-0.5', pct > 0 && 'bg-primary-soft/50')}>
                          {pct > 0 && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-brand" style={{ opacity: Math.min(1, 0.25 + pct / 100) }} />}
                          {ver === 'pct' && editavel ? (
                            <NumberInput size="sm" aria-label={`% da etapa ${e.codigo} no período ${p.periodo}`} className="!h-5 border-transparent bg-transparent px-1 shadow-none hover:border-border-strong focus:bg-surface" decimals={2} min={0} max={100} value={pct || null} placeholder="" onChange={(v) => setPct(e.id, k, v)} />
                          ) : ver === 'pct' ? (
                            pct ? formatNumero(pct) : ''
                          ) : (
                            pct ? formatMoeda(tot.valores.get(e.id)![k]) : ''
                          )}
                        </Td>
                      );
                    })}
                    <Td numeric className={cn('text-xs font-medium', Math.abs(soma - 100) < 0.001 ? 'text-success' : soma > 100 ? 'text-danger' : 'text-warning')}>{formatNumero(soma)}</Td>
                  </Tr>
                );
              })}
            </TBody>
            <TFoot>
              <Tr>
                <Td colSpan={2} className="sticky left-0">Total do período</Td>
                <Td numeric>{formatMoeda(tot.total)}</Td>
                {tot.porPeriodo.map((t, k) => <Td key={k} numeric className="text-xs">{ver === 'pct' ? formatNumero(t.percentual) : formatMoeda(t.valor)}</Td>)}
                <Td />
              </Tr>
              <Tr>
                <Td colSpan={2} className="sticky left-0">Acumulado</Td>
                <Td />
                {tot.porPeriodo.map((t, k) => <Td key={k} numeric className="text-xs text-primary">{ver === 'pct' ? formatNumero(t.percentualAcumulado) : formatMoeda(t.acumulado)}</Td>)}
                <Td />
              </Tr>
            </TFoot>
          </Table>
        </div>
      </Card>

      <Card flush>
        <CardHeader eyebrow="Desembolso" title="Curva S" description="Barras: % do orçamento executado no período · linha: acumulado." />
        <div className="p-4">
          <CurvaSChart dados={periodos.map((p, k) => ({ rotulo: `P${p.periodo}`, detalhe: `P${p.periodo} · ${formatData(p.inicio)} a ${formatData(p.fim)}`, ...tot.porPeriodo[k]! }))} />
        </div>
      </Card>

      <Modal open={linear !== null} onClose={() => setLinear(null)} size="sm" title="Distribuir linearmente"
        description={etapas.find((e) => e.id === linear?.etapa)?.nome}
        footer={<><Button onClick={() => setLinear(null)}>Cancelar</Button>
          <Button leftIcon={<Eraser />} onClick={() => { if (linear) { setDist((m) => new Map(m).set(linear.etapa, [])); setSujo(true); setLinear(null); } }}>Limpar</Button>
          <Button variant="primary" onClick={() => { if (linear) { setDist((m) => new Map(m).set(linear.etapa, distribuirLinear(n, linear.ini, linear.fim))); setSujo(true); setLinear(null); } }}>Aplicar</Button></>}>
        {linear && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Do período">{(p) => <Select {...p} value={String(linear.ini)} onChange={(e) => setLinear({ ...linear, ini: Number(e.target.value) })} options={periodos.map((x) => ({ value: String(x.periodo), label: `P${x.periodo} · ${formatData(x.inicio)}` }))} />}</Field>
            <Field label="Até o período">{(p) => <Select {...p} value={String(linear.fim)} onChange={(e) => setLinear({ ...linear, fim: Number(e.target.value) })} options={periodos.map((x) => ({ value: String(x.periodo), label: `P${x.periodo} · ${formatData(x.fim)}` }))} />}</Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
