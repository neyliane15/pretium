import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, MoreHorizontal, Plus, Printer, Trash2 } from 'lucide-react';
import { useCriarMedicao, useExcluirMedicao, useMedicoes } from '@/api/orcamento/analises';
import { BarraPercentual, ErroCarregamento } from '@/components/orcamento/comum';
import { useOrcamentoContexto } from '@/components/orcamento/contexto';
import {
  Alert, Badge, Button, Card, CardHeader, ConfirmDialog, DateInput, DropdownMenu, EmptyState, Field, IconButton, LoadingBlock, Modal, Stat, TBody,
  THead, Table, Td, Th, Tr, useToast,
} from '@/components/ui';
import { round2, somaMoeda } from '@/lib/calc';
import { formatBRL, formatData, formatMoeda, formatNumero, formatPercent } from '@/lib/format';
import { LABEL_MEDICAO_STATUS } from '@/lib/labels';
import { BADGE_MEDICAO_STATUS } from '@/lib/labels-orcamento';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';
import { medicaoSchema } from '@/schemas/orcamento';
import type { Medicao } from '@/types/database';

const maisDias = (iso: string, d: number) => {
  const [y, m, dd] = iso.split('-').map(Number) as [number, number, number];
  const x = new Date(y, m - 1, dd + d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/** Boletins de medição: lista, acumulado e saldo do contrato. Dono: FRONTEND-2. */
export default function OrcamentoMedicoesPage() {
  const { orcamento, podeEditar } = useOrcamentoContexto();
  const navigate = useNavigate();
  const toast = useToast();
  const med = useMedicoes(orcamento.id);
  const criar = useCriarMedicao(orcamento.id);
  const excluir = useExcluirMedicao(orcamento.id);
  const [nova, setNova] = useState<{ inicio: string | null; fim: string | null; erro?: string } | null>(null);
  const [aExcluir, setAExcluir] = useState<Medicao | null>(null);
  const permitido = orcamento.status === 'aprovado' || orcamento.status === 'em_revisao';

  if (med.isLoading) return <LoadingBlock />;
  if (med.isError) return <ErroCarregamento erro={med.error} onRetry={() => void med.refetch()} />;
  const lista = med.data ?? [];
  const medido = somaMoeda(lista.map((m) => m.total));
  const saldo = round2(orcamento.total - medido);
  const pct = orcamento.total ? (medido / orcamento.total) * 100 : 0;

  const abrirNova = () => {
    const ult = lista.at(-1);
    const ini = ult ? maisDias(ult.periodo_fim, 1) : new Date().toISOString().slice(0, 10);
    setNova({ inicio: ini, fim: maisDias(ini, 29) });
  };
  const onCriar = async () => {
    const r = medicaoSchema.safeParse({ inicio: nova?.inicio ?? '', fim: nova?.fim ?? '' });
    if (!r.success) return setNova({ ...nova!, erro: r.error.issues[0]?.message });
    try {
      const id = await criar.mutateAsync(r.data);
      setNova(null);
      navigate(rotas.orcamentoMedicao(orcamento.id, id));
    } catch (e) {
      toast.error('Não foi possível criar a medição', mensagemErro(e));
    }
  };

  let acum = 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Valor do contrato" value={formatBRL(orcamento.total)} hint="Total com BDI" />
        <Stat label="Medido acumulado" value={formatBRL(medido)} hint={`${lista.length} boletim(ns)`} highlight />
        <Stat label="Saldo a medir" value={formatBRL(saldo)} />
        <div className="corner-marks rounded border border-border bg-surface p-3.5 shadow-xs">
          <span className="font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle">Avanço financeiro</span>
          <div className="num mt-1.5 text-2xl font-semibold">{formatPercent(pct)}</div>
          <BarraPercentual valor={pct} className="mt-2" />
        </div>
      </div>

      {!permitido && <Alert variant="info" title="Medições exigem orçamento aprovado ou em revisão">Altere o status do orçamento para iniciar os boletins de medição.</Alert>}

      <Card flush accent>
        <CardHeader eyebrow="Execução" title="Boletins de medição" actions={podeEditar && permitido && <Button size="sm" variant="primary" leftIcon={<Plus />} onClick={abrirNova}>Nova medição</Button>} />
        {lista.length === 0 ? (
          <EmptyState variant="inline" icon={<ClipboardCheck />} title="Nenhuma medição" description="Cada boletim registra as quantidades executadas no período; acumulados e saldos são calculados automaticamente." className="py-10" />
        ) : (
          <Table containerClassName="rounded-none border-0" className="[&_td]:px-3 [&_th]:px-3">
            <THead>
              <Tr><Th width={60}>Nº</Th><Th>Período</Th><Th numeric>Data</Th><Th>Status</Th><Th numeric>Valor (R$)</Th><Th numeric>Acumulado (R$)</Th><Th width={180}>% acumulado</Th><Th width={36} /></Tr>
            </THead>
            <TBody>
              {lista.map((m) => {
                acum = round2(acum + m.total);
                const p = orcamento.total ? (acum / orcamento.total) * 100 : 0;
                return (
                  <Tr key={m.id} interactive onClick={() => navigate(rotas.orcamentoMedicao(orcamento.id, m.id))}>
                    <Td mono className="font-semibold">{String(m.numero).padStart(2, '0')}</Td>
                    <Td className="num text-xs">{formatData(m.periodo_inicio)} → {formatData(m.periodo_fim)}</Td>
                    <Td numeric muted>{formatData(m.data_medicao)}</Td>
                    <Td><Badge variant={BADGE_MEDICAO_STATUS[m.status]} dot>{LABEL_MEDICAO_STATUS[m.status]}</Badge></Td>
                    <Td numeric className="font-medium">{formatMoeda(m.total)}</Td>
                    <Td numeric>{formatMoeda(acum)}</Td>
                    <Td><span className="flex items-center gap-2"><BarraPercentual valor={p} /><span className="num w-12 text-right text-xs">{formatNumero(p)}%</span></span></Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu align="end" aria-label={`Ações da medição ${m.numero}`} trigger={<IconButton size="sm" label="Ações" icon={<MoreHorizontal />} />}
                        items={[
                          { label: 'Imprimir boletim', icon: <Printer />, onSelect: () => window.open(rotas.imprimirOrcamento(orcamento.id, 'medicao', m.id), '_blank') },
                          'separator',
                          { label: 'Excluir', icon: <Trash2 />, danger: true, disabled: !podeEditar || m.status !== 'aberta', onSelect: () => setAExcluir(m) },
                        ]} />
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Modal open={nova !== null} onClose={() => setNova(null)} size="sm" title="Nova medição" description={`Boletim nº ${lista.length + 1}`}
        footer={<><Button onClick={() => setNova(null)}>Cancelar</Button><Button variant="primary" loading={criar.isPending} onClick={() => void onCriar()}>Criar boletim</Button></>}>
        {nova && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início do período" required>{(p) => <DateInput {...p} value={nova.inicio} onChange={(v) => setNova({ ...nova, inicio: v, erro: undefined })} />}</Field>
            <Field label="Fim do período" required error={nova.erro}>{(p) => <DateInput {...p} value={nova.fim} onChange={(v) => setNova({ ...nova, fim: v, erro: undefined })} />}</Field>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={aExcluir !== null} onClose={() => setAExcluir(null)} destructive loading={excluir.isPending} title={`Excluir a medição nº ${aExcluir?.numero}?`} confirmLabel="Excluir"
        onConfirm={() => aExcluir && excluir.mutate(aExcluir.id, { onSuccess: () => setAExcluir(null), onError: (e) => toast.error('Não foi possível excluir', mensagemErro(e)) })} />
    </div>
  );
}
