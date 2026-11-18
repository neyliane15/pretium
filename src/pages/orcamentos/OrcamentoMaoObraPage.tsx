import { useMemo, useState } from 'react';
import { HardHat, MoreHorizontal, Pencil, Plus, Trash2, Users } from 'lucide-react';
import {
  useEncargosDoOrcamento, useEquipes, useExcluirEquipe, useExcluirMembro, useMaoObraHoras, useMaoObraResumo, useSalvarEquipe, useSalvarMembro,
} from '@/api/orcamento/analises';
import { useBuscarReferencias } from '@/api/orcamento/referencias';
import { BarrasHorizontais } from '@/components/charts';
import { ErroCarregamento, Rotulo } from '@/components/orcamento/comum';
import { useOrcamentoContexto } from '@/components/orcamento/contexto';
import {
  Alert, Button, Card, CardHeader, Checkbox, Combobox, ConfirmDialog, DropdownMenu, EmptyState, Field, IconButton, Input, LoadingBlock, Modal,
  NumberInput, Stat, TBody, TFoot, THead, Table, TableMessage, Tabs, Td, Th, Tr, useToast,
} from '@/components/ui';
import { custoMembro, round2, somaMoeda } from '@/lib/calc';
import { formatBRL, formatMoeda, formatNumero, formatPercent } from '@/lib/format';
import { mensagemErro } from '@/lib/supabase';
import type { OrcamentoEquipeMembro, ReferenciaBusca } from '@/types/database';

type MembroForm = {
  id?: string; equipe_id: string; funcao: string; insumo: { id: string; codigo: string; descricao: string; preco: number | null } | null;
  salario_hora: number | null; aplicar_encargos: boolean; quantidade: number | null; horas_dia: number | null; dias: number | null;
};

/** Mão de obra: equipes, custo-hora com encargos, histograma e horas implícitas das composições. Dono: FRONTEND-2. */
export default function OrcamentoMaoObraPage() {
  const { orcamento, editavel } = useOrcamentoContexto();
  const toast = useToast();
  const equipes = useEquipes(orcamento.id);
  const resumo = useMaoObraResumo(orcamento.id);
  const horas = useMaoObraHoras(orcamento.id);
  const enc = useEncargosDoOrcamento(orcamento.encargos_sociais_id);
  const salvarEquipe = useSalvarEquipe(orcamento.id);
  const excluirEquipe = useExcluirEquipe(orcamento.id);
  const salvarMembro = useSalvarMembro(orcamento.id);
  const excluirMembro = useExcluirMembro(orcamento.id);
  const [equipeForm, setEquipeForm] = useState<{ id?: string; nome: string; descricao: string } | null>(null);
  const [membro, setMembro] = useState<MembroForm | null>(null);
  const [aExcluir, setAExcluir] = useState<{ tipo: 'equipe' | 'membro'; id: string; nome: string } | null>(null);
  const [termo, setTermo] = useState('');
  const busca = useBuscarReferencias(termo, orcamento.data_base_id, 'insumo', 30);
  const [hist, setHist] = useState<'funcao' | 'equipe'>('funcao');

  const encH = enc.data?.total_horista ?? 0;
  const custoHoraServidor = useMemo(() => new Map((resumo.data ?? []).map((r) => [r.membro_id, r.custo_hora])), [resumo.data]);

  const calc = (m: OrcamentoEquipeMembro) =>
    custoMembro({ quantidade: m.quantidade, horas_dia: m.horas_dia, dias: m.dias, salario_hora: m.salario_hora, aplicar_encargos: m.aplicar_encargos, preco_insumo_hora: m.insumo_id ? (custoHoraServidor.get(m.id) ?? null) : null }, encH);

  const todos = (equipes.data ?? []).flatMap((e) => e.membros.map((m) => ({ e, m, c: calc(m) })));
  const totalHoras = round2(todos.reduce((s, x) => s + x.c.horas_totais, 0));
  const totalCusto = somaMoeda(todos.map((x) => x.c.custo_total));
  const pico = (equipes.data ?? []).reduce((s, e) => s + e.membros.reduce((a, m) => a + m.quantidade, 0), 0);

  const histDados = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of todos) {
      const k = hist === 'funcao' ? x.m.funcao : x.e.nome;
      m.set(k, round2((m.get(k) ?? 0) + x.c.horas_totais));
    }
    return [...m].sort((a, b) => b[1] - a[1]).map(([rotulo, valor], i) => ({ chave: rotulo, rotulo, valor, cor: hist === 'funcao' ? Math.min(i, 5) : 1 }));
  }, [todos, hist]);

  if (equipes.isLoading) return <LoadingBlock />;
  if (equipes.isError) return <ErroCarregamento erro={equipes.error} onRetry={() => void equipes.refetch()} />;

  const onSalvarEquipe = async () => {
    if (!equipeForm?.nome.trim()) return;
    try {
      await salvarEquipe.mutateAsync({ id: equipeForm.id, nome: equipeForm.nome.trim(), descricao: equipeForm.descricao.trim() || null, ordem: equipeForm.id ? undefined : (equipes.data?.length ?? 0) + 1 });
      setEquipeForm(null);
    } catch (e) {
      toast.error('Não foi possível salvar a equipe', mensagemErro(e));
    }
  };
  const onSalvarMembro = async () => {
    if (!membro || !membro.funcao.trim()) return toast.error('Informe a função');
    if (!membro.insumo && membro.salario_hora === null) return toast.error('Vincule um insumo SINAPI de mão de obra ou informe o salário-hora');
    try {
      await salvarMembro.mutateAsync({
        id: membro.id, equipe_id: membro.equipe_id, funcao: membro.funcao.trim(), insumo_id: membro.insumo?.id ?? null, salario_hora: membro.insumo ? null : membro.salario_hora,
        aplicar_encargos: membro.aplicar_encargos, quantidade: membro.quantidade ?? 1, horas_dia: membro.horas_dia ?? 8, dias: membro.dias ?? 0,
      });
      setMembro(null);
    } catch (e) {
      toast.error('Não foi possível salvar', mensagemErro(e));
    }
  };

  const previa = membro
    ? custoMembro({ quantidade: membro.quantidade ?? 0, horas_dia: membro.horas_dia ?? 0, dias: membro.dias ?? 0, salario_hora: membro.salario_hora, aplicar_encargos: membro.aplicar_encargos, preco_insumo_hora: membro.insumo?.preco ?? null }, encH)
    : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Custo de mão de obra (equipes)" value={formatBRL(totalCusto)} hint={orcamento.total_sem_bdi ? `${formatPercent((totalCusto / orcamento.total_sem_bdi) * 100)} do custo direto` : undefined} icon={<HardHat />} highlight />
        <Stat label="Horas-homem planejadas" value={formatNumero(totalHoras, 0)} hint={`${formatNumero(totalHoras / 8, 1)} homens-dia`} />
        <Stat label="Efetivo máximo" value={formatNumero(pico, 0)} hint={`${equipes.data?.length ?? 0} equipe(s)`} icon={<Users />} />
        <Stat label="Encargos sociais (horista)" value={enc.data ? formatPercent(encH) : '—'} hint={enc.data?.nome ?? 'Defina a tabela em Dados e versões'} />
      </div>
      {!orcamento.encargos_sociais_id && <Alert variant="warning">Sem tabela de encargos no orçamento: membros informados por salário-hora ficam sem encargos.</Alert>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {(equipes.data ?? []).length === 0 && (
            <EmptyState icon={<Users />} title="Nenhuma equipe" description="Monte as equipes (pedreiros, serventes, armadores…) para dimensionar efetivo, horas e custo."
              action={editavel && <Button variant="primary" leftIcon={<Plus />} onClick={() => setEquipeForm({ nome: '', descricao: '' })}>Nova equipe</Button>} />
          )}
          {(equipes.data ?? []).map((e) => {
            const ms = e.membros.map((m) => ({ m, c: calc(m) }));
            return (
              <Card key={e.id} flush>
                <CardHeader
                  eyebrow="Equipe"
                  title={e.nome}
                  description={e.descricao ?? undefined}
                  actions={editavel && (
                    <>
                      <Button size="sm" leftIcon={<Plus />} onClick={() => setMembro({ equipe_id: e.id, funcao: '', insumo: null, salario_hora: null, aplicar_encargos: true, quantidade: 1, horas_dia: 8, dias: 22 })}>Membro</Button>
                      <DropdownMenu align="end" aria-label={`Ações da equipe ${e.nome}`} trigger={<IconButton size="sm" label="Ações" icon={<MoreHorizontal />} />}
                        items={[{ label: 'Renomear', icon: <Pencil />, onSelect: () => setEquipeForm({ id: e.id, nome: e.nome, descricao: e.descricao ?? '' }) }, 'separator', { label: 'Excluir equipe', icon: <Trash2 />, danger: true, onSelect: () => setAExcluir({ tipo: 'equipe', id: e.id, nome: e.nome }) }]} />
                    </>
                  )}
                />
                <Table density="compact" gridLines containerClassName="rounded-none border-0">
                  <THead>
                    <Tr>
                      <Th>Função</Th><Th width={160}>Base de custo</Th><Th numeric width={44}>Qtd</Th><Th numeric width={52}>h/dia</Th><Th numeric width={56}>Dias</Th>
                      <Th numeric width={80}>Horas</Th><Th numeric width={80}>R$/h</Th><Th numeric width={100}>Total (R$)</Th><Th width={30} />
                    </Tr>
                  </THead>
                  <TBody>
                    {ms.length === 0 && <TableMessage colSpan={9}>Sem membros.</TableMessage>}
                    {ms.map(({ m, c }) => (
                      <Tr key={m.id}>
                        <Td className="font-medium">{m.funcao}</Td>
                        <Td muted className="text-xs">{m.insumo_id ? <span className="font-mono">SINAPI · c/ encargos</span> : <>Salário {formatMoeda(m.salario_hora)}/h{m.aplicar_encargos ? ` + ${formatNumero(encH)}%` : ''}</>}</Td>
                        <Td numeric>{formatNumero(m.quantidade, 0)}</Td>
                        <Td numeric>{formatNumero(m.horas_dia, 1)}</Td>
                        <Td numeric>{formatNumero(m.dias, 0)}</Td>
                        <Td numeric>{formatNumero(c.horas_totais, 0)}</Td>
                        <Td numeric>{formatMoeda(c.custo_hora)}</Td>
                        <Td numeric className="font-medium">{formatMoeda(c.custo_total)}</Td>
                        <Td className="px-0.5">
                          {editavel && (
                            <DropdownMenu align="end" aria-label={`Ações de ${m.funcao}`} trigger={<IconButton size="sm" className="h-5" label="Ações" icon={<MoreHorizontal />} />}
                              items={[
                                { label: 'Editar', icon: <Pencil />, onSelect: () => setMembro({ id: m.id, equipe_id: e.id, funcao: m.funcao, insumo: m.insumo_id ? { id: m.insumo_id, codigo: '', descricao: 'Insumo vinculado', preco: custoHoraServidor.get(m.id) ?? null } : null, salario_hora: m.salario_hora, aplicar_encargos: m.aplicar_encargos, quantidade: m.quantidade, horas_dia: m.horas_dia, dias: m.dias }) },
                                { label: 'Excluir', icon: <Trash2 />, danger: true, onSelect: () => setAExcluir({ tipo: 'membro', id: m.id, nome: m.funcao }) },
                              ]} />
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                  {ms.length > 0 && (
                    <TFoot>
                      <Tr>
                        <Td colSpan={2}>Subtotal</Td>
                        <Td numeric>{formatNumero(ms.reduce((s, x) => s + x.m.quantidade, 0), 0)}</Td>
                        <Td colSpan={2} />
                        <Td numeric>{formatNumero(ms.reduce((s, x) => s + x.c.horas_totais, 0), 0)}</Td>
                        <Td />
                        <Td numeric>{formatMoeda(somaMoeda(ms.map((x) => x.c.custo_total)))}</Td>
                        <Td />
                      </Tr>
                    </TFoot>
                  )}
                </Table>
              </Card>
            );
          })}
          {editavel && (equipes.data ?? []).length > 0 && <Button leftIcon={<Plus />} onClick={() => setEquipeForm({ nome: '', descricao: '' })}>Nova equipe</Button>}
        </div>

        <div className="space-y-4">
          <Card flush>
            <CardHeader eyebrow="Histograma" title="Horas-homem" actions={<Tabs size="sm" variant="segmented" aria-label="Agrupar" value={hist} onChange={setHist} items={[{ value: 'funcao', label: 'Função' }, { value: 'equipe', label: 'Equipe' }]} />} />
            <div className="p-3">
              {histDados.length ? <BarrasHorizontais dados={histDados} formatar={(v) => `${formatNumero(v, 0)} h`} nomeValor="Horas-homem" /> : <p className="py-6 text-center text-sm text-fg-muted">Sem dados.</p>}
            </div>
          </Card>
          <Card flush>
            <CardHeader eyebrow="Composições do orçamento" title="Mão de obra implícita" description="Horas de MO resultantes da explosão das composições × quantidades." />
            <Table density="compact" containerClassName="rounded-none border-0">
              <THead><Tr><Th width={56}>Cód.</Th><Th>Insumo</Th><Th numeric width={70}>Horas</Th><Th numeric width={90}>Custo</Th></Tr></THead>
              <TBody>
                {horas.isLoading && <TableMessage colSpan={4}>Carregando…</TableMessage>}
                {horas.data?.length === 0 && <TableMessage colSpan={4}>Sem mão de obra nas composições.</TableMessage>}
                {(horas.data ?? []).map((h) => (
                  <Tr key={h.insumo_id}>
                    <Td mono>{h.codigo}</Td>
                    <Td truncate title={h.descricao}>{h.descricao}</Td>
                    <Td numeric>{formatNumero(h.horas, 0)}</Td>
                    <Td numeric>{formatMoeda(h.custo)}</Td>
                  </Tr>
                ))}
              </TBody>
              {(horas.data ?? []).length > 0 && (
                <TFoot>
                  <Tr>
                    <Td colSpan={2}>Total · <span className="font-normal text-fg-muted">{formatNumero((horas.data ?? []).reduce((s, h) => s + h.horas, 0) / 8, 0)} homens-dia</span></Td>
                    <Td numeric>{formatNumero((horas.data ?? []).reduce((s, h) => s + h.horas, 0), 0)}</Td>
                    <Td numeric>{formatMoeda(somaMoeda((horas.data ?? []).map((h) => h.custo)))}</Td>
                  </Tr>
                </TFoot>
              )}
            </Table>
          </Card>
        </div>
      </div>

      <Modal open={equipeForm !== null} onClose={() => setEquipeForm(null)} size="sm" title={equipeForm?.id ? 'Editar equipe' : 'Nova equipe'}
        footer={<><Button onClick={() => setEquipeForm(null)}>Cancelar</Button><Button variant="primary" loading={salvarEquipe.isPending} onClick={() => void onSalvarEquipe()}>Salvar</Button></>}>
        <div className="space-y-3">
          <Field label="Nome" required>{(p) => <Input {...p} data-autofocus value={equipeForm?.nome ?? ''} placeholder="Equipe de alvenaria" onChange={(e) => equipeForm && setEquipeForm({ ...equipeForm, nome: e.target.value })} />}</Field>
          <Field label="Descrição">{(p) => <Input {...p} value={equipeForm?.descricao ?? ''} onChange={(e) => equipeForm && setEquipeForm({ ...equipeForm, descricao: e.target.value })} />}</Field>
        </div>
      </Modal>

      <Modal open={membro !== null} onClose={() => setMembro(null)} size="md" title={membro?.id ? 'Editar membro' : 'Novo membro da equipe'}
        footer={<><Button onClick={() => setMembro(null)}>Cancelar</Button><Button variant="primary" loading={salvarMembro.isPending} onClick={() => void onSalvarMembro()}>Salvar</Button></>}>
        {membro && (
          <div className="grid grid-cols-6 gap-3">
            <Field label="Função" required className="col-span-6">{(p) => <Input {...p} data-autofocus value={membro.funcao} placeholder="Pedreiro, servente, armador…" onChange={(e) => setMembro({ ...membro, funcao: e.target.value })} />}</Field>
            <Field label="Insumo SINAPI de mão de obra (preço/h já com encargos)" className="col-span-6" hint="Opcional. Sem insumo, informe o salário-hora abaixo.">
              {(p) => (
                <Combobox<ReferenciaBusca>
                  {...p}
                  size="sm"
                  value={membro.insumo ? ({ id: membro.insumo.id, codigo: membro.insumo.codigo, descricao: membro.insumo.descricao, preco: membro.insumo.preco } as ReferenciaBusca) : null}
                  onChange={(r) => setMembro({ ...membro, insumo: r ? { id: r.id, codigo: r.codigo, descricao: r.descricao, preco: r.preco } : null, funcao: membro.funcao || (r ? r.descricao.split(' ').slice(0, 2).join(' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : '') })}
                  onSearch={setTermo}
                  items={(busca.data ?? []).filter((r) => r.insumo_tipo === 'mao_de_obra' || r.unidade === 'H')}
                  loading={busca.isFetching}
                  getKey={(r) => r.id}
                  getLabel={(r) => `${r.codigo ? r.codigo + ' – ' : ''}${r.descricao}`}
                  placeholder="Buscar: pedreiro, servente, 4750…"
                  renderItem={(r) => <div className="grid grid-cols-[56px_1fr_72px] gap-2 text-sm"><span className="font-mono text-xs text-fg-muted">{r.codigo}</span><span className="truncate">{r.descricao}</span><span className="num text-right text-xs">{formatMoeda(r.preco)}/h</span></div>}
                />
              )}
            </Field>
            {!membro.insumo && (
              <>
                <Field label="Salário-hora (R$)" className="col-span-2">{(p) => <NumberInput {...p} value={membro.salario_hora} onChange={(v) => setMembro({ ...membro, salario_hora: v })} min={0} decimals={2} />}</Field>
                <div className="col-span-4 flex items-end pb-1.5"><Checkbox label={`Aplicar encargos sociais (${formatPercent(encH)})`} checked={membro.aplicar_encargos} onChange={(e) => setMembro({ ...membro, aplicar_encargos: e.target.checked })} /></div>
              </>
            )}
            <Field label="Quantidade" className="col-span-2">{(p) => <NumberInput {...p} value={membro.quantidade} onChange={(v) => setMembro({ ...membro, quantidade: v })} min={0} decimals={0} />}</Field>
            <Field label="Horas por dia" className="col-span-2">{(p) => <NumberInput {...p} value={membro.horas_dia} onChange={(v) => setMembro({ ...membro, horas_dia: v })} min={0} max={24} decimals={1} />}</Field>
            <Field label="Dias trabalhados" className="col-span-2">{(p) => <NumberInput {...p} value={membro.dias} onChange={(v) => setMembro({ ...membro, dias: v })} min={0} decimals={0} />}</Field>
            {previa && (
              <div className="col-span-6 grid grid-cols-3 gap-2 rounded border border-border bg-surface-2 p-2.5">
                <div><Rotulo>Horas</Rotulo><div className="num">{formatNumero(previa.horas_totais, 0)}</div></div>
                <div><Rotulo>Custo/h</Rotulo><div className="num">{formatMoeda(previa.custo_hora)}</div></div>
                <div><Rotulo>Total</Rotulo><div className="num font-semibold">{formatBRL(previa.custo_total)}</div></div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog open={aExcluir !== null} onClose={() => setAExcluir(null)} destructive title={`Excluir ${aExcluir?.nome}?`} confirmLabel="Excluir"
        description={aExcluir?.tipo === 'equipe' ? 'Todos os membros da equipe serão removidos.' : undefined}
        loading={excluirEquipe.isPending || excluirMembro.isPending}
        onConfirm={() => {
          if (!aExcluir) return;
          const m = aExcluir.tipo === 'equipe' ? excluirEquipe : excluirMembro;
          m.mutate(aExcluir.id, { onSuccess: () => setAExcluir(null), onError: (e) => toast.error('Não foi possível excluir', mensagemErro(e)) });
        }} />
    </div>
  );
}
