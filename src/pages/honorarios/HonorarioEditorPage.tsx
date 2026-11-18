import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ListPlus, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { useHonorario, useSalvarHonorario, type DisciplinaInput } from '@/api/orcamento/analises';
import { useOrcamentos } from '@/api/orcamento/orcamentos';
import { ErroCarregamento, Rotulo } from '@/components/orcamento/comum';
import {
  Badge, Button, Card, CardBody, CardHeader, DropdownMenu, Field, IconButton, Input, LoadingBlock, NumberInput, PageHeader, Select, TBody, TFoot,
  THead, Table, TableMessage, Td, Textarea, Th, Tr, useToast,
} from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { totalHonorarios, valorDisciplina } from '@/lib/calc';
import { formatBRL, formatMoeda, formatNumero } from '@/lib/format';
import { LABEL_DISCIPLINA, LABEL_HONORARIO_METODO, LABEL_HONORARIO_STATUS, opcoes } from '@/lib/labels';
import { BADGE_HONORARIO_STATUS } from '@/lib/labels-orcamento';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';
import type { DisciplinaProjeto, HonorarioMetodo, HonorarioStatus } from '@/types/database';

type Disc = DisciplinaInput & { chave: string };

const nova = (d: DisciplinaProjeto, metodo: HonorarioMetodo = 'area', extra: Partial<Disc> = {}): Disc => ({
  chave: crypto.randomUUID(), disciplina: d, metodo, descricao: null, area_m2: null, valor_m2: null, valor_obra: null, percentual: null, horas: null, valor_hora: null, valor_fixo: null, prazo_dias: null, ordem: 0, ...extra,
});

const PACOTES: { nome: string; itens: () => Disc[] }[] = [
  { nome: 'Residencial completo', itens: () => [nova('arquitetonico', 'area', { valor_m2: 80, prazo_dias: 45 }), nova('estrutural', 'area', { valor_m2: 30, prazo_dias: 30 }), nova('fundacoes', 'area', { valor_m2: 8, prazo_dias: 20 }), nova('eletrico', 'area', { valor_m2: 14, prazo_dias: 20 }), nova('hidrossanitario', 'area', { valor_m2: 14, prazo_dias: 20 }), nova('aprovacao_legal', 'fixo', { valor_fixo: 3500, prazo_dias: 60 })] },
  { nome: 'Reforma comercial', itens: () => [nova('arquitetonico', 'area', { valor_m2: 95 }), nova('interiores', 'area', { valor_m2: 60 }), nova('eletrico', 'area', { valor_m2: 18 }), nova('climatizacao', 'area', { valor_m2: 12 }), nova('incendio', 'fixo', { valor_fixo: 2800 })] },
  { nome: 'Orçamento e coordenação', itens: () => [nova('orcamento', 'percentual_obra', { percentual: 0.8 }), nova('coordenacao', 'horas', { horas: 40, valor_hora: 180 })] },
];

/** Editor de proposta de honorários de projeto (§8.7). Dono: FRONTEND-2. */
export default function HonorarioEditorPage() {
  const { honorarioId = '' } = useParams();
  const toast = useToast();
  const { podeEditar } = useOrganizacao();
  const q = useHonorario(honorarioId);
  const salvar = useSalvarHonorario(honorarioId);
  const orcs = useOrcamentos(q.data?.honorario.obra_id);
  const [cab, setCab] = useState({ nome: '', status: 'rascunho' as HonorarioStatus, area_m2: null as number | null, orcamento_id: '', impostos: 0 as number | null, desconto: 0 as number | null, validade: 30 as number | null, condicoes: '', observacoes: '' });
  const [discs, setDiscs] = useState<Disc[]>([]);
  const [removidas, setRemovidas] = useState<string[]>([]);
  const [sujo, setSujo] = useState(false);

  useEffect(() => {
    if (!q.data || sujo) return;
    const h = q.data.honorario;
    setCab({ nome: h.nome, status: h.status, area_m2: h.area_m2, orcamento_id: h.orcamento_id ?? '', impostos: h.impostos_percentual, desconto: h.desconto_percentual, validade: h.validade_dias, condicoes: h.condicoes_pagamento ?? '', observacoes: h.observacoes ?? '' });
    setDiscs(q.data.disciplinas.map((d) => ({ chave: d.id, id: d.id, disciplina: d.disciplina, metodo: d.metodo, descricao: d.descricao, area_m2: d.area_m2, valor_m2: d.valor_m2, valor_obra: d.valor_obra, percentual: d.percentual, horas: d.horas, valor_hora: d.valor_hora, valor_fixo: d.valor_fixo, prazo_dias: d.prazo_dias, ordem: d.ordem })));
  }, [q.data, sujo]);

  const totalObra = (orcs.data ?? []).find((o) => o.id === cab.orcamento_id)?.total ?? null;
  const valores = discs.map((d) => valorDisciplina(d, cab.area_m2, totalObra));
  const tot = useMemo(() => {
    try { return totalHonorarios(valores, cab.desconto ?? 0, cab.impostos ?? 0); } catch { return null; }
  }, [valores, cab.desconto, cab.impostos]);

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data) return <ErroCarregamento erro={q.error} />;
  const h = q.data.honorario;
  const ed = podeEditar;
  const mud = () => setSujo(true);
  const setD = (chave: string, patch: Partial<Disc>) => { setDiscs((xs) => xs.map((x) => (x.chave === chave ? { ...x, ...patch } : x))); mud(); };
  const prazoMax = Math.max(0, ...discs.map((d) => d.prazo_dias ?? 0));

  const onSalvar = async () => {
    if (!tot) return toast.error('Impostos devem ser menores que 100%');
    try {
      await salvar.mutateAsync({
        cabecalho: { nome: cab.nome.trim() || h.nome, status: cab.status, area_m2: cab.area_m2, orcamento_id: cab.orcamento_id || null, impostos_percentual: cab.impostos ?? 0, desconto_percentual: cab.desconto ?? 0, validade_dias: cab.validade ?? 30, condicoes_pagamento: cab.condicoes.trim() || null, observacoes: cab.observacoes.trim() || null },
        disciplinas: discs.map(({ chave: _c, ...d }) => d),
        removidas,
      });
      setSujo(false);
      setRemovidas([]);
      toast.success('Proposta salva', `Total ${formatBRL(tot.total)}`);
    } catch (e) {
      toast.error('Não foi possível salvar', mensagemErro(e));
    }
  };

  const num = (d: Disc, k: keyof Disc, rot: string, casas = 2, suf?: string) => (
    <NumberInput size="sm" aria-label={rot} className="!h-6" decimals={casas} min={0} value={d[k] as number | null} readOnly={!ed} suffix={suf} onChange={(v) => setD(d.chave, { [k]: v })} />
  );

  return (
    <>
      <PageHeader
        title={h.nome}
        breadcrumbs={[{ label: 'Honorários', to: rotas.honorarios }, ...(h.obra ? [{ label: h.obra.nome, to: rotas.obra(h.obra.id) }] : []), { label: 'Proposta' }]}
        badges={<Badge variant={BADGE_HONORARIO_STATUS[cab.status]} dot>{LABEL_HONORARIO_STATUS[cab.status]}</Badge>}
        actions={<>
          <Button leftIcon={<Printer />} onClick={() => window.print()}>Imprimir</Button>
          {ed && <Button variant="primary" leftIcon={<Save />} disabled={!sujo} loading={salvar.isPending} onClick={() => void onSalvar()}>Salvar e recalcular</Button>}
        </>}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Card flush accent>
            <CardHeader eyebrow="Escopo" title="Disciplinas de projeto"
              actions={ed && <>
                <DropdownMenu align="end" aria-label="Pacotes" trigger={<Button size="sm" leftIcon={<ListPlus />}>Pacote</Button>}
                  items={PACOTES.map((p) => ({ label: p.nome, onSelect: () => { setDiscs((xs) => [...xs, ...p.itens()]); mud(); } }))} />
                <Button size="sm" leftIcon={<Plus />} onClick={() => { setDiscs((xs) => [...xs, nova('outro')]); mud(); }}>Disciplina</Button>
              </>} />
            <Table density="compact" gridLines inset>
              <THead>
                <Tr><Th width={170}>Disciplina</Th><Th width={150}>Método</Th><Th>Base de cálculo</Th><Th numeric width={70}>Prazo (d)</Th><Th numeric width={110}>Valor (R$)</Th><Th width={76} /></Tr>
              </THead>
              <TBody>
                {discs.length === 0 && <TableMessage colSpan={6}>Adicione disciplinas ou um pacote.</TableMessage>}
                {discs.map((d, i) => (
                  <Tr key={d.chave}>
                    <Td className="px-1">
                      <Select size="sm" aria-label="Disciplina" className="!h-6" disabled={!ed} value={d.disciplina} onChange={(e) => setD(d.chave, { disciplina: e.target.value as DisciplinaProjeto })} options={opcoes(LABEL_DISCIPLINA)} />
                      <Input size="sm" aria-label="Descrição" className="mt-0.5 !h-5 border-transparent bg-transparent text-2xs shadow-none" placeholder="descrição (opcional)" readOnly={!ed} value={d.descricao ?? ''} onChange={(e) => setD(d.chave, { descricao: e.target.value || null })} />
                    </Td>
                    <Td className="px-1"><Select size="sm" aria-label="Método" className="!h-6" disabled={!ed} value={d.metodo} onChange={(e) => setD(d.chave, { metodo: e.target.value as HonorarioMetodo })} options={opcoes(LABEL_HONORARIO_METODO)} /></Td>
                    <Td className="px-1">
                      <div className="grid grid-cols-2 items-center gap-1.5">
                        {d.metodo === 'area' && <>{num(d, 'area_m2', 'Área', 2, 'm²')}{num(d, 'valor_m2', 'Valor por m² (R$)')}</>}
                        {d.metodo === 'percentual_obra' && <>{num(d, 'valor_obra', 'Valor da obra')}{num(d, 'percentual', 'Percentual', 2, '%')}</>}
                        {d.metodo === 'horas' && <>{num(d, 'horas', 'Horas', 1, 'h')}{num(d, 'valor_hora', 'Valor da hora (R$)')}</>}
                        {d.metodo === 'fixo' && num(d, 'valor_fixo', 'Valor fixo (R$)')}
                      </div>
                      <div className="mt-0.5 grid grid-cols-2 gap-1.5 text-2xs text-fg-subtle">
                        {d.metodo === 'area' && <><span>área {d.area_m2 === null ? `(proposta: ${formatNumero(cab.area_m2)})` : ''}</span><span>R$/m²</span></>}
                        {d.metodo === 'percentual_obra' && <><span>valor da obra</span><span>% sobre a obra</span></>}
                        {d.metodo === 'horas' && <><span>horas técnicas</span><span>R$/hora</span></>}
                        {d.metodo === 'fixo' && <span>valor fixo (R$)</span>}
                      </div>
                      {d.metodo === 'percentual_obra' && d.valor_obra === null && <div className="mt-0.5 text-2xs text-fg-subtle">{totalObra !== null ? `base: orçamento ${formatBRL(totalObra)}` : 'selecione o orçamento de referência'}</div>}
                    </Td>
                    <Td numeric className="px-1">{num(d, 'prazo_dias', 'Prazo', 0)}</Td>
                    <Td numeric className="font-medium">{formatMoeda(valores[i])}</Td>
                    <Td className="px-0.5">
                      {ed && <span className="flex">
                        <IconButton size="sm" className="h-5" label="Subir" icon={<ArrowUp />} onClick={() => { setDiscs((xs) => { const n = [...xs]; if (i > 0) [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; return n; }); mud(); }} />
                        <IconButton size="sm" className="h-5" label="Descer" icon={<ArrowDown />} onClick={() => { setDiscs((xs) => { const n = [...xs]; if (i < n.length - 1) [n[i + 1], n[i]] = [n[i]!, n[i + 1]!]; return n; }); mud(); }} />
                        <IconButton size="sm" className="h-5" label="Remover" icon={<Trash2 />} onClick={() => { setDiscs((xs) => xs.filter((x) => x.chave !== d.chave)); if (d.id) setRemovidas((r) => [...r, d.id!]); mud(); }} />
                      </span>}
                    </Td>
                  </Tr>
                ))}
              </TBody>
              {tot && discs.length > 0 && (
                <TFoot>
                  <Tr><Td colSpan={3} className="text-right">Subtotal</Td><Td numeric>{prazoMax || ''}</Td><Td numeric>{formatMoeda(tot.subtotal)}</Td><Td /></Tr>
                </TFoot>
              )}
            </Table>
          </Card>

          <Card flush>
            <CardHeader eyebrow="Proposta" title="Condições" />
            <CardBody className="grid grid-cols-6 gap-3">
              <Field label="Nome da proposta" className="col-span-4">{(p) => <Input {...p} readOnly={!ed} value={cab.nome} onChange={(e) => { setCab({ ...cab, nome: e.target.value }); mud(); }} />}</Field>
              <Field label="Status" className="col-span-2">{(p) => <Select {...p} disabled={!ed} value={cab.status} onChange={(e) => { setCab({ ...cab, status: e.target.value as HonorarioStatus }); mud(); }} options={opcoes(LABEL_HONORARIO_STATUS)} />}</Field>
              <Field label="Área de projeto" className="col-span-2">{(p) => <NumberInput {...p} readOnly={!ed} value={cab.area_m2} onChange={(v) => { setCab({ ...cab, area_m2: v }); mud(); }} suffix="m²" />}</Field>
              <Field label="Orçamento de referência" className="col-span-4" hint="Base do método “% do custo da obra”">
                {(p) => <Select {...p} disabled={!ed} value={cab.orcamento_id} onChange={(e) => { setCab({ ...cab, orcamento_id: e.target.value }); mud(); }} placeholder="— nenhum —" options={(orcs.data ?? []).map((o) => ({ value: o.id, label: `${o.nome} v${o.versao} · ${formatBRL(o.total)}` }))} />}
              </Field>
              <Field label="Validade" className="col-span-2">{(p) => <NumberInput {...p} readOnly={!ed} decimals={0} value={cab.validade} onChange={(v) => { setCab({ ...cab, validade: v }); mud(); }} suffix="d" />}</Field>
              <Field label="Condições de pagamento" className="col-span-6">{(p) => <Textarea {...p} rows={2} readOnly={!ed} value={cab.condicoes} placeholder="Ex.: 30% na assinatura, 40% no anteprojeto, 30% na entrega do executivo." onChange={(e) => { setCab({ ...cab, condicoes: e.target.value }); mud(); }} />}</Field>
              <Field label="Observações / exclusões" className="col-span-6">{(p) => <Textarea {...p} rows={3} readOnly={!ed} value={cab.observacoes} onChange={(e) => { setCab({ ...cab, observacoes: e.target.value }); mud(); }} />}</Field>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4 self-start">
          <Card cornerMarks="brand">
            <Rotulo>Total da proposta</Rotulo>
            <div className="num mt-1 text-3xl font-semibold">{tot ? formatBRL(tot.total) : '—'}</div>
            {cab.area_m2 && tot ? <div className="text-xs text-fg-muted"><span className="num">{formatBRL(tot.total / cab.area_m2)}</span> por m² de projeto</div> : null}
            <dl className="mt-3 space-y-1 border-t border-grid pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-fg-muted">Subtotal das disciplinas</dt><dd className="num">{formatMoeda(tot?.subtotal)}</dd></div>
              <div className="flex items-center justify-between gap-2"><dt className="text-fg-muted">Desconto</dt>
                <dd className="flex items-center gap-2"><span className="w-24"><NumberInput size="sm" aria-label="Desconto (%)" readOnly={!ed} value={cab.desconto} onChange={(v) => { setCab({ ...cab, desconto: v }); mud(); }} suffix="%" /></span><span className="num w-24 text-right text-danger">{tot && tot.desconto ? `−${formatMoeda(tot.desconto)}` : '0,00'}</span></dd></div>
              <div className="flex items-center justify-between gap-2"><dt className="text-fg-muted">Impostos (por dentro)</dt>
                <dd className="flex items-center gap-2"><span className="w-24"><NumberInput size="sm" aria-label="Impostos (%)" readOnly={!ed} value={cab.impostos} max={99} onChange={(v) => { setCab({ ...cab, impostos: v }); mud(); }} suffix="%" /></span><span className="num w-24 text-right">{formatMoeda(tot?.impostos)}</span></dd></div>
              <div className="flex justify-between border-t border-grid pt-1.5 font-semibold"><dt>Total</dt><dd className="num">{formatMoeda(tot?.total)}</dd></div>
            </dl>
            <p className="mt-2 text-2xs text-fg-subtle">total = (subtotal × (1 − desconto)) ÷ (1 − impostos), arredondado a 2 casas — igual a fn_honorario_recalcular.</p>
          </Card>
          <Card>
            <Rotulo>Cronograma de projeto</Rotulo>
            <ul className="mt-2 space-y-1.5">
              {discs.filter((d) => d.prazo_dias).map((d) => (
                <li key={d.chave} className="grid grid-cols-[110px_1fr_36px] items-center gap-2 text-xs">
                  <span className="truncate text-fg-muted">{LABEL_DISCIPLINA[d.disciplina]}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-sunken"><span className="block h-full bg-brand" style={{ width: `${((d.prazo_dias ?? 0) / (prazoMax || 1)) * 100}%` }} /></span>
                  <span className="num text-right">{d.prazo_dias}d</span>
                </li>
              ))}
              {!discs.some((d) => d.prazo_dias) && <li className="text-xs text-fg-subtle">Informe prazos por disciplina.</li>}
            </ul>
          </Card>
          {h.obra && <Link to={rotas.obra(h.obra.id)} className="block text-xs text-primary hover:underline">Ver ficha da obra {h.obra.nome}</Link>}
        </div>
      </div>
    </>
  );
}
