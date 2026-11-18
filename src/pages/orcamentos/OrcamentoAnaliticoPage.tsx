import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, Calculator, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, CornerDownRight,
  FolderPlus, Lock, MoreHorizontal, Pencil, Search, Sigma, Tag, Trash2, Unlock,
} from 'lucide-react';
import {
  useAtualizarEtapa, useAtualizarItem, useCriarEtapa, useEtapas, useExcluirEtapa, useExcluirItens, useItens, useMoverEap,
  type ItemPatch,
} from '@/api/orcamento/orcamentos';
import { AdicionarItemBarra } from '@/components/orcamento/AdicionarItemBarra';
import { ComposicaoAnaliticaDrawer } from '@/components/orcamento/ComposicaoAnaliticaDrawer';
import { ErroCarregamento } from '@/components/orcamento/comum';
import { useOrcamentoContexto } from '@/components/orcamento/contexto';
import { CotacoesDrawer } from '@/components/orcamento/CotacoesDrawer';
import { descendentes, montarEap, nivelEtapa, novaOrdemIrmao, type LinhaEtapa, type LinhaItem } from '@/components/orcamento/eap';
import { MemoriaCalculoDrawer } from '@/components/orcamento/MemoriaCalculoDrawer';
import {
  Badge, Button, Checkbox, ConfirmDialog, DropdownMenu, EmptyState, Field, IconButton, Input, LoadingBlock, Modal, NumberInput, Select,
  TBody, TFoot, THead, Table, Td, Th, Tooltip, Tr, useToast,
} from '@/components/ui';
import { calcularItem } from '@/lib/calc';
import { cn } from '@/lib/cn';
import { formatMoeda, formatPercent, formatQuantidade } from '@/lib/format';
import { mensagemErro } from '@/lib/supabase';
import type { OrcamentoEtapa, OrcamentoItem } from '@/types/database';

type LEtapa = LinhaEtapa<OrcamentoEtapa>;
type LItem = LinhaItem<OrcamentoItem>;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Planilha analítica densa com EAP editável. Dono: FRONTEND-2. */
export default function OrcamentoAnaliticoPage() {
  const ctx = useOrcamentoContexto();
  const { orcamento, editavel, bdis, bdiPadrao, agendarRecalculo } = ctx;
  const id = orcamento.id;
  const toast = useToast();
  const etapasQ = useEtapas(id);
  const itensQ = useItens(id);
  const atualizarItem = useAtualizarItem(id);
  const excluirItens = useExcluirItens(id);
  const criarEtapa = useCriarEtapa(id);
  const atualizarEtapa = useAtualizarEtapa(id);
  const excluirEtapa = useExcluirEtapa(id);
  const mover = useMoverEap(id);

  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState('');
  const [destino, setDestino] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [memoria, setMemoria] = useState<LItem | null>(null);
  const [analitica, setAnalitica] = useState<OrcamentoItem | null>(null);
  const [cotacoes, setCotacoes] = useState(false);
  const [novaEtapa, setNovaEtapa] = useState<{ parentId: string | null; nome: string } | null>(null);
  const [renomear, setRenomear] = useState<{ id: string; nome: string } | null>(null);
  const [moverPara, setMoverPara] = useState<{ itens: string[]; etapa: string } | null>(null);
  const [excluirE, setExcluirE] = useState<LEtapa | null>(null);
  const [excluirI, setExcluirI] = useState<string[] | null>(null);
  const tabela = useRef<HTMLTableElement>(null);

  const etapas = useMemo(() => etapasQ.data ?? [], [etapasQ.data]);
  const itens = useMemo(() => itensQ.data ?? [], [itensQ.data]);
  const eap = useMemo(() => montarEap(etapas, itens, filtro ? new Set() : recolhidas), [etapas, itens, recolhidas, filtro]);
  const opcoesEtapas = useMemo(() => eap.linhas.filter((l): l is LEtapa => l.tipo === 'etapa').map((l) => ({ id: l.id, codigo: l.codigo, nome: l.etapa.nome, nivel: l.nivel })), [eap.linhas]);
  const todasEtapas = useMemo(() => montarEap(etapas, []).linhas.map((l) => ({ id: l.id, codigo: l.codigo, nome: (l as LEtapa).etapa.nome, nivel: l.nivel })), [etapas]);

  useEffect(() => {
    if (!destino && todasEtapas[0]) setDestino(todasEtapas[0].id);
    if (destino && !todasEtapas.some((e) => e.id === destino) && todasEtapas[0]) setDestino(todasEtapas[0].id);
  }, [todasEtapas, destino]);

  const linhas = useMemo(() => {
    if (!filtro.trim()) return eap.linhas;
    const t = semAcento(filtro.trim());
    const ok = (l: LItem) => semAcento(`${l.codigo} ${l.item.referencia_codigo ?? ''} ${l.item.descricao}`).includes(t);
    return eap.linhas.filter((l) => l.tipo === 'etapa' || ok(l));
  }, [eap.linhas, filtro]);
  const itensVisiveis = linhas.filter((l): l is LItem => l.tipo === 'item');
  const idxItem = new Map(itensVisiveis.map((l, i) => [l.id, i]));

  if (etapasQ.isLoading || itensQ.isLoading) return <LoadingBlock label="Carregando planilha…" />;
  if (etapasQ.isError || itensQ.isError) return <ErroCarregamento erro={etapasQ.error ?? itensQ.error} onRetry={() => { void etapasQ.refetch(); void itensQ.refetch(); }} />;

  const bdiDe = (it: OrcamentoItem) => (it.bdi_id ? bdis.find((b) => b.id === it.bdi_id)?.bdi : bdiPadrao?.bdi) ?? it.bdi_percentual;

  const patch = (it: OrcamentoItem, p: ItemPatch, bdiNovo?: number) => {
    const base = { quantidade: p.quantidade ?? it.quantidade, custo_unitario: p.custo_unitario ?? it.custo_unitario, bdi_percentual: bdiNovo ?? it.bdi_percentual };
    atualizarItem.mutate(
      { id: it.id, patch: p, otimista: { ...calcularItem(base), bdi_percentual: base.bdi_percentual } },
      { onSuccess: () => agendarRecalculo(), onError: (e) => toast.error('Não foi possível salvar', mensagemErro(e)) },
    );
  };

  const focarProxima = (col: string, idx: number, delta = 1) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const d = e.key === 'ArrowUp' ? -1 : delta;
    if (e.key !== 'Enter') e.preventDefault();
    window.setTimeout(() => tabela.current?.querySelector<HTMLInputElement>(`[data-col="${col}"][data-row="${idx + d}"]`)?.focus(), 0);
  };

  const alternar = (eid: string) => setRecolhidas((s) => { const n = new Set(s); if (n.has(eid)) n.delete(eid); else n.add(eid); return n; });
  const recolherTudo = () => setRecolhidas(new Set(etapas.filter((e) => e.parent_id === null).map((e) => e.id)));

  const moverIrmao = (tipo: 'etapa' | 'item', alvo: OrcamentoEtapa | OrcamentoItem, delta: -1 | 1) => {
    const irmaos: { id: string; ordem: number }[] = tipo === 'etapa' ? etapas.filter((e) => e.parent_id === (alvo as OrcamentoEtapa).parent_id) : itens.filter((i) => i.etapa_id === (alvo as OrcamentoItem).etapa_id);
    const nova = novaOrdemIrmao(irmaos, alvo.id, delta);
    if (nova === null) return;
    const pai = tipo === 'etapa' ? (alvo as OrcamentoEtapa).parent_id : (alvo as OrcamentoItem).etapa_id;
    mover.mutate({ tipo, id: alvo.id, novoPaiId: pai, novaOrdem: nova }, { onError: (e) => toast.error('Não foi possível mover', mensagemErro(e)) });
  };

  const salvarEtapa = async () => {
    if (!novaEtapa?.nome.trim()) return;
    try {
      const ordem = etapas.filter((e) => e.parent_id === novaEtapa.parentId).length + 1;
      const e = await criarEtapa.mutateAsync({ nome: novaEtapa.nome.trim(), parentId: novaEtapa.parentId, ordem });
      setDestino(e.id);
      setNovaEtapa(null);
    } catch (e) {
      toast.error('Não foi possível criar a etapa', mensagemErro(e));
    }
  };

  const confirmarMover = async () => {
    if (!moverPara) return;
    try {
      let ordem = itens.filter((i) => i.etapa_id === moverPara.etapa).length;
      for (const iid of moverPara.itens) {
        ordem += 1;
        await mover.mutateAsync({ tipo: 'item', id: iid, novoPaiId: moverPara.etapa, novaOrdem: ordem });
      }
      toast.success(`${moverPara.itens.length} item(ns) movido(s)`);
      setMoverPara(null);
      setSel(new Set());
    } catch (e) {
      toast.error('Não foi possível mover', mensagemErro(e));
    }
  };

  const tudoSel = itensVisiveis.length > 0 && itensVisiveis.every((l) => sel.has(l.id));

  return (
    <>
      {editavel && (
        <AdicionarItemBarra
          orcamentoId={id}
          dataBaseId={orcamento.data_base_id}
          etapas={todasEtapas}
          etapaId={destino}
          onEtapa={setDestino}
          onAdicionado={(it) => {
            agendarRecalculo();
            setRecolhidas((s) => { const n = new Set(s); n.delete(it.etapa_id); return n; });
          }}
        />
      )}

      <div className="no-print mb-2 flex flex-wrap items-center gap-1.5">
        {editavel && <Button size="sm" leftIcon={<FolderPlus />} onClick={() => setNovaEtapa({ parentId: null, nome: '' })}>Etapa</Button>}
        <Button size="sm" variant="ghost" leftIcon={<ChevronsDownUp />} onClick={recolherTudo}>Recolher</Button>
        <Button size="sm" variant="ghost" leftIcon={<ChevronsUpDown />} onClick={() => setRecolhidas(new Set())}>Expandir</Button>
        <Button size="sm" variant="ghost" leftIcon={<Tag />} onClick={() => setCotacoes(true)}>Cotações</Button>
        {sel.size > 0 && editavel && (
          <span className="ml-2 flex items-center gap-1.5 rounded border border-primary/30 bg-primary-soft/60 px-2 py-0.5 text-xs">
            <span className="num">{sel.size}</span> selecionado(s)
            <Button size="sm" variant="ghost" leftIcon={<CornerDownRight />} onClick={() => setMoverPara({ itens: [...sel], etapa: destino })}>Mover</Button>
            <Button size="sm" variant="ghost" className="text-danger" leftIcon={<Trash2 />} onClick={() => setExcluirI([...sel])}>Excluir</Button>
          </span>
        )}
        <div className="ml-auto w-64">
          <Input size="sm" prefix={<Search />} placeholder="Filtrar itens da planilha…" aria-label="Filtrar itens" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </div>
      </div>

      {etapas.length === 0 ? (
        <EmptyState icon={<FolderPlus />} title="Planilha vazia" description="Crie a primeira etapa da EAP para começar a orçar."
          action={editavel && <Button variant="primary" onClick={() => setNovaEtapa({ parentId: null, nome: '' })}>Criar etapa</Button>} />
      ) : (
        <Table ref={tabela} density="compact" gridLines stickyHeader containerClassName="max-h-[calc(100vh-330px)] min-h-[320px]" aria-label="Planilha orçamentária">
          <THead>
            <Tr>
              <Th width={26} className="px-1.5">
                {editavel && <Checkbox aria-label="Selecionar todos" checked={tudoSel} onChange={() => setSel(tudoSel ? new Set() : new Set(itensVisiveis.map((l) => l.id)))} />}
              </Th>
              <Th width={64}>Item</Th>
              <Th width={58}>Fonte</Th>
              <Th width={64}>Código</Th>
              <Th>Descrição</Th>
              <Th width={40}>Und</Th>
              <Th numeric width={96}>Quant.</Th>
              <Th numeric width={92}>Custo unit.</Th>
              <Th numeric width={64}>BDI %</Th>
              <Th numeric width={92}>Preço unit.</Th>
              <Th numeric width={110}>Total (R$)</Th>
              <Th numeric width={52}>%</Th>
              <Th width={30} />
            </Tr>
          </THead>
          <TBody>
            {linhas.map((l) =>
              l.tipo === 'etapa' ? (
                <Tr key={l.id} group={Math.min(l.nivel, 3) as 1 | 2 | 3} className="group/etapa">
                  <Td className="px-1.5" />
                  <Td mono className="font-semibold">{l.codigo}</Td>
                  <Td colSpan={8} style={{ paddingLeft: 8 + (l.nivel - 1) * 12 }}>
                    <span className="flex items-center gap-1">
                      <button type="button" aria-expanded={!recolhidas.has(l.id)} aria-label={recolhidas.has(l.id) ? 'Expandir etapa' : 'Recolher etapa'}
                        className="flex h-4 w-4 items-center justify-center rounded-xs text-fg-subtle hover:bg-surface hover:text-fg" onClick={() => alternar(l.id)}>
                        {recolhidas.has(l.id) && !filtro ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                      {renomear?.id === l.id ? (
                        <Input size="sm" autoFocus aria-label="Nome da etapa" className="h-5 max-w-md" value={renomear.nome}
                          onChange={(e) => setRenomear({ id: l.id, nome: e.target.value })}
                          onBlur={() => { if (renomear.nome.trim() && renomear.nome !== l.etapa.nome) atualizarEtapa.mutate({ id: l.id, nome: renomear.nome.trim() }); setRenomear(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenomear(null); }} />
                      ) : (
                        <span className={cn('uppercase tracking-[0.02em]', l.nivel > 1 && 'normal-case tracking-normal')} onDoubleClick={() => editavel && setRenomear({ id: l.id, nome: l.etapa.nome })}>{l.etapa.nome}</span>
                      )}
                      <span className="ml-1 font-mono text-2xs font-normal text-fg-subtle">{l.qtdItens} {l.qtdItens === 1 ? 'item' : 'itens'}</span>
                      {editavel && (
                        <button type="button" onClick={() => setDestino(l.id)} className={cn('ml-1 rounded-xs px-1 font-mono text-2xs font-normal opacity-0 transition-opacity group-hover/etapa:opacity-100 focus:opacity-100', destino === l.id ? 'bg-primary-soft text-primary opacity-100' : 'text-fg-subtle hover:text-primary')}>
                          {destino === l.id ? '● destino' : 'adicionar aqui'}
                        </button>
                      )}
                    </span>
                  </Td>
                  <Td numeric className="font-semibold">{formatMoeda(l.total)}</Td>
                  <Td numeric muted className="text-xs">{formatNumero2(l.percentual)}</Td>
                  <Td className="px-0.5">
                    {editavel && (
                      <DropdownMenu align="end" aria-label={`Ações da etapa ${l.codigo}`} trigger={<IconButton size="sm" label="Ações da etapa" icon={<MoreHorizontal />} className="h-5" />}
                        items={[
                          { label: 'Adicionar itens aqui', icon: <CornerDownRight />, onSelect: () => setDestino(l.id) },
                          { label: 'Nova subetapa', icon: <FolderPlus />, onSelect: () => setNovaEtapa({ parentId: l.id, nome: '' }), disabled: nivelEtapa(etapas, l.id) >= 3 },
                          { label: 'Renomear', icon: <Pencil />, onSelect: () => setRenomear({ id: l.id, nome: l.etapa.nome }) },
                          'separator',
                          { label: 'Mover para cima', icon: <ArrowUp />, onSelect: () => moverIrmao('etapa', l.etapa, -1) },
                          { label: 'Mover para baixo', icon: <ArrowDown />, onSelect: () => moverIrmao('etapa', l.etapa, 1) },
                          'separator',
                          { label: 'Excluir etapa', icon: <Trash2 />, danger: true, onSelect: () => setExcluirE(l) },
                        ]} />
                    )}
                  </Td>
                </Tr>
              ) : (
                <LinhaItemPlanilha
                  key={l.id}
                  l={l}
                  idx={idxItem.get(l.id) ?? 0}
                  editavel={editavel}
                  selecionado={sel.has(l.id)}
                  onSelecionar={() => setSel((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })}
                  bdis={bdis}
                  bdiEfetivo={bdiDe(l.item)}
                  onPatch={(p, bdiNovo) => patch(l.item, p, bdiNovo)}
                  onTecla={focarProxima}
                  onMemoria={() => setMemoria(l)}
                  onAnalitica={() => setAnalitica(l.item)}
                  onMover={(d) => moverIrmao('item', l.item, d)}
                  onMoverPara={() => setMoverPara({ itens: [l.id], etapa: l.item.etapa_id })}
                  onExcluir={() => setExcluirI([l.id])}
                />
              ),
            )}
          </TBody>
          <TFoot>
            <Tr>
              <Td colSpan={10} className="text-right font-mono text-2xs uppercase tracking-[0.08em] text-fg-muted">Total sem BDI</Td>
              <Td numeric>{formatMoeda(eap.total_sem_bdi)}</Td>
              <Td colSpan={2} />
            </Tr>
            <Tr>
              <Td colSpan={10} className="text-right font-mono text-2xs uppercase tracking-[0.08em] text-fg-muted">BDI ({formatPercent(eap.bdi_medio)} efetivo)</Td>
              <Td numeric>{formatMoeda(eap.total_bdi)}</Td>
              <Td colSpan={2} />
            </Tr>
            <Tr>
              <Td colSpan={10} className="text-right font-display text-md">Total com BDI</Td>
              <Td numeric className="text-md">{formatMoeda(eap.total)}</Td>
              <Td numeric className="text-xs">100%</Td>
              <Td />
            </Tr>
          </TFoot>
        </Table>
      )}
      <p className="no-print mt-1.5 flex items-center gap-3 text-2xs text-fg-subtle">
        <span><kbd className="font-mono">Enter</kbd>/<kbd className="font-mono">↓</kbd> confirma e desce · <kbd className="font-mono">Tab</kbd> avança · <kbd className="font-mono">Esc</kbd> desfaz</span>
        <span>Valores por item arredondados a 2 casas (§8.3); totais idênticos ao servidor após recálculo.</span>
      </p>

      <MemoriaCalculoDrawer open={memoria !== null} item={memoria ? itens.find((i) => i.id === memoria.id) ?? memoria.item : null} codigo={memoria?.codigo ?? ''} onClose={() => setMemoria(null)} orcamentoId={id} editavel={editavel} />
      <ComposicaoAnaliticaDrawer
        open={analitica !== null}
        onClose={() => setAnalitica(null)}
        composicao={analitica?.composicao_id ? { id: analitica.composicao_id, codigo: analitica.referencia_codigo ?? '', descricao: analitica.descricao, unidade: analitica.unidade } : null}
        dataBaseId={orcamento.data_base_id}
        orcamentoId={id}
        podeCotar={editavel}
      />
      <CotacoesDrawer open={cotacoes} onClose={() => setCotacoes(false)} orcamentoId={id} dataBaseId={orcamento.data_base_id} editavel={editavel} />

      <Modal open={novaEtapa !== null} onClose={() => setNovaEtapa(null)} size="sm" title={novaEtapa?.parentId ? 'Nova subetapa' : 'Nova etapa'}
        footer={<><Button onClick={() => setNovaEtapa(null)}>Cancelar</Button><Button variant="primary" loading={criarEtapa.isPending} onClick={() => void salvarEtapa()}>Criar</Button></>}>
        <Field label="Nome" required hint={novaEtapa?.parentId ? `Dentro de ${todasEtapas.find((e) => e.id === novaEtapa.parentId)?.codigo} ${todasEtapas.find((e) => e.id === novaEtapa.parentId)?.nome}` : 'Etapa de 1º nível da EAP'}>
          {(p) => <Input {...p} data-autofocus value={novaEtapa?.nome ?? ''} placeholder="Ex.: Fundações, Alvenaria, Revestimentos…" onChange={(e) => novaEtapa && setNovaEtapa({ ...novaEtapa, nome: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void salvarEtapa()} />}
        </Field>
      </Modal>

      <Modal open={moverPara !== null} onClose={() => setMoverPara(null)} size="sm" title="Mover itens" description={`${moverPara?.itens.length ?? 0} item(ns) para outra etapa (vão para o final).`}
        footer={<><Button onClick={() => setMoverPara(null)}>Cancelar</Button><Button variant="primary" loading={mover.isPending} onClick={() => void confirmarMover()}>Mover</Button></>}>
        <Field label="Etapa de destino">
          {(p) => <Select {...p} value={moverPara?.etapa ?? ''} onChange={(e) => moverPara && setMoverPara({ ...moverPara, etapa: e.target.value })} options={opcoesEtapas.map((e) => ({ value: e.id, label: `${' '.repeat(e.nivel - 1)}${e.codigo} ${e.nome}` }))} />}
        </Field>
      </Modal>

      <ConfirmDialog open={excluirE !== null} onClose={() => setExcluirE(null)} destructive loading={excluirEtapa.isPending}
        title={`Excluir a etapa ${excluirE?.codigo}?`}
        description={excluirE && <>Serão excluídas <strong>{descendentes(etapas, itens, excluirE.id).etapas.length - 1}</strong> subetapa(s) e <strong>{descendentes(etapas, itens, excluirE.id).itens.length}</strong> item(ns), totalizando <span className="num">{formatMoeda(excluirE.total)}</span>.</>}
        confirmLabel="Excluir etapa"
        onConfirm={() => excluirE && excluirEtapa.mutate(excluirE.id, { onSuccess: () => { setExcluirE(null); agendarRecalculo(); }, onError: (e) => toast.error('Não foi possível excluir', mensagemErro(e)) })} />
      <ConfirmDialog open={excluirI !== null} onClose={() => setExcluirI(null)} destructive loading={excluirItens.isPending}
        title={`Excluir ${excluirI?.length ?? 0} item(ns)?`} description="As memórias de cálculo e medições destes itens também serão removidas." confirmLabel="Excluir"
        onConfirm={() => excluirI && excluirItens.mutate(excluirI, { onSuccess: () => { setExcluirI(null); setSel(new Set()); agendarRecalculo(); }, onError: (e) => toast.error('Não foi possível excluir', mensagemErro(e)) })} />
    </>
  );
}

function LinhaItemPlanilha({
  l, idx, editavel, selecionado, onSelecionar, bdis, bdiEfetivo, onPatch, onTecla, onMemoria, onAnalitica, onMover, onMoverPara, onExcluir,
}: {
  l: LItem;
  idx: number;
  editavel: boolean;
  selecionado: boolean;
  onSelecionar: () => void;
  bdis: ReturnType<typeof useOrcamentoContexto>['bdis'];
  bdiEfetivo: number;
  onPatch: (p: ItemPatch, bdiNovo?: number) => void;
  onTecla: (col: string, idx: number) => (e: KeyboardEvent<HTMLInputElement>) => void;
  onMemoria: () => void;
  onAnalitica: () => void;
  onMover: (d: -1 | 1) => void;
  onMoverPara: () => void;
  onExcluir: () => void;
}) {
  const it = l.item;
  const [editDesc, setEditDesc] = useState<string | null>(null);
  const custoEditavel = editavel && (it.referencia_tipo === 'livre' || it.custo_manual);
  const fonteVar = it.fonte === 'PRÓPRIA' ? 'brand' : it.fonte === 'COTAÇÃO' ? 'accent' : it.referencia_tipo === 'livre' ? 'neutral' : 'outline';
  const cell = '!h-5 rounded-sm border-transparent bg-transparent px-1 shadow-none hover:border-border-strong focus:bg-surface';

  return (
    <Tr selected={selecionado}>
      <Td className="px-1.5">{editavel && <Checkbox aria-label={`Selecionar item ${l.codigo}`} checked={selecionado} onChange={onSelecionar} />}</Td>
      <Td mono muted>{l.codigo}</Td>
      <Td><Badge variant={fonteVar}>{it.referencia_tipo === 'livre' ? 'LIVRE' : it.fonte}</Badge></Td>
      <Td mono>
        {it.composicao_id ? (
          <button type="button" className="hover:text-primary hover:underline" title="Ver composição analítica" onClick={onAnalitica}>{it.referencia_codigo}</button>
        ) : (
          it.referencia_codigo ?? '—'
        )}
      </Td>
      <Td truncate title={it.descricao} style={{ paddingLeft: 8 + (l.nivel - 1) * 12 }}>
        {editDesc !== null ? (
          <Input size="sm" autoFocus aria-label="Descrição do item" className="h-5" value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
            onBlur={() => { if (editDesc.trim() && editDesc !== it.descricao) onPatch({ descricao: editDesc.trim() }); setEditDesc(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditDesc(null); }} />
        ) : (
          <span className="flex items-center gap-1" onDoubleClick={() => editavel && setEditDesc(it.descricao)}>
            {it.sem_preco && (
              <Tooltip content="Referência sem preço na data-base — custo tratado como zero">
                <AlertTriangle aria-label="Sem preço" className="h-3.5 w-3.5 shrink-0 text-warning" />
              </Tooltip>
            )}
            <span className="truncate">{it.descricao}</span>
          </span>
        )}
      </Td>
      <Td muted className="text-xs">{it.unidade}</Td>
      <Td numeric className="px-1">
        {it.usa_memoria ? (
          <button type="button" onClick={onMemoria} title="Quantidade pela memória de cálculo" className="inline-flex w-full items-center justify-end gap-1 hover:text-primary">
            <Sigma className="h-3 w-3 text-brand" aria-label="Memória de cálculo" />
            {formatQuantidade(it.quantidade)}
          </button>
        ) : editavel ? (
          <NumberInput size="sm" aria-label={`Quantidade do item ${l.codigo}`} data-col="qtd" data-row={idx} className={cell} decimals={4} min={0} value={it.quantidade}
            onChange={(v) => onPatch({ quantidade: v ?? 0 })} onKeyDown={onTecla('qtd', idx)} />
        ) : (
          formatQuantidade(it.quantidade)
        )}
      </Td>
      <Td numeric className="px-1">
        {custoEditavel ? (
          <NumberInput size="sm" aria-label={`Custo unitário do item ${l.codigo}`} data-col="custo" data-row={idx} className={cn(cell, it.custo_manual && 'text-warning')} min={0} value={it.custo_unitario}
            onChange={(v) => onPatch({ custo_unitario: v ?? 0 })} onKeyDown={onTecla('custo', idx)} />
        ) : (
          formatMoeda(it.custo_unitario)
        )}
      </Td>
      <Td numeric className="px-1">
        {editavel && bdis.length > 1 ? (
          <span className={cn('relative flex h-5 items-center justify-end rounded-sm px-1 hover:bg-sunken focus-within:ring-1 focus-within:ring-ring', it.bdi_id && 'text-info')} title={it.bdi_id ? bdis.find((b) => b.id === it.bdi_id)?.nome : 'BDI padrão'}>
            {formatNumero2(it.bdi_percentual || bdiEfetivo)}{it.bdi_id && <sup className="ml-px text-2xs">D</sup>}
            <select aria-label={`BDI do item ${l.codigo}`} value={it.bdi_id ?? ''} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={(e) => {
              const b = bdis.find((x) => x.id === e.target.value) ?? bdis.find((x) => x.is_padrao);
              onPatch({ bdi_id: e.target.value || null }, b?.bdi);
            }}>
            <option value="" title="BDI padrão">{formatNumero2(bdis.find((b) => b.is_padrao)?.bdi ?? 0)}</option>
            {bdis.filter((b) => !b.is_padrao).map((b) => <option key={b.id} value={b.id} title={b.nome}>{formatNumero2(b.bdi)} · {b.nome}</option>)}
          </select>
          </span>
        ) : (
          <span title={it.bdi_id ? bdis.find((b) => b.id === it.bdi_id)?.nome : 'BDI padrão'}>{formatNumero2(it.bdi_percentual || bdiEfetivo)}</span>
        )}
      </Td>
      <Td numeric>{formatMoeda(l.preco_unitario)}</Td>
      <Td numeric className="font-medium">{formatMoeda(l.total)}</Td>
      <Td numeric muted className="text-xs">{formatPercent(l.percentual, 2).replace('%', '')}</Td>
      <Td className="px-0.5">
        <DropdownMenu align="end" aria-label={`Ações do item ${l.codigo}`} trigger={<IconButton size="sm" label="Ações do item" icon={<MoreHorizontal />} className="h-5" />}
          items={[
            { label: 'Memória de cálculo', icon: <Calculator />, onSelect: onMemoria, hint: it.usa_memoria ? 'ativa' : undefined },
            { label: 'Composição analítica', icon: <Sigma />, onSelect: onAnalitica, disabled: !it.composicao_id },
            ...(editavel
              ? ([
                  { label: it.custo_manual ? 'Voltar ao custo da referência' : 'Fixar custo manual', icon: it.custo_manual ? <Unlock /> : <Lock />, onSelect: () => onPatch({ custo_manual: !it.custo_manual }), disabled: it.referencia_tipo === 'livre' },
                  'separator',
                  { label: 'Mover para cima', icon: <ArrowUp />, onSelect: () => onMover(-1) },
                  { label: 'Mover para baixo', icon: <ArrowDown />, onSelect: () => onMover(1) },
                  { label: 'Mover para outra etapa…', icon: <CornerDownRight />, onSelect: onMoverPara },
                  'separator',
                  { label: 'Excluir item', icon: <Trash2 />, danger: true, onSelect: onExcluir },
                ] as const)
              : []),
          ]}
        />
      </Td>
    </Tr>
  );
}

const formatNumero2 = (v: number) => formatPercent(v).replace('%', '');
