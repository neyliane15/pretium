import { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useExcluirBdi, useItens, useSalvarBdi } from '@/api/orcamento/orcamentos';
import { LABEL_QUARTIL, presetTcu, type Quartil } from '@/components/orcamento/bdiPresets';
import { Rotulo } from '@/components/orcamento/comum';
import { useOrcamentoContexto } from '@/components/orcamento/contexto';
import {
  Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, ConfirmDialog, Field, Input, Modal, NumberInput, Select, useToast,
} from '@/components/ui';
import { calcularBdi, FAIXAS_TCU, situacaoBdiTcu, tributosBdi, type BdiParametros, type FaixaTcu, type TipoObraTcu } from '@/lib/calc';
import { cn } from '@/lib/cn';
import { formatNumero, formatPercent } from '@/lib/format';
import { mensagemErro } from '@/lib/supabase';
import type { OrcamentoBdi } from '@/types/database';

const CAMPOS: { k: keyof BdiParametros; rotulo: string; sigla: string; faixa?: (t: TipoObraTcu) => FaixaTcu }[] = [
  { k: 'ac', sigla: 'AC', rotulo: 'Administração central', faixa: (t) => FAIXAS_TCU[t].ac },
  { k: 's', sigla: 'S', rotulo: 'Seguros' },
  { k: 'g', sigla: 'G', rotulo: 'Garantias' },
  { k: 'r', sigla: 'R', rotulo: 'Riscos', faixa: (t) => FAIXAS_TCU[t].r },
  { k: 'df', sigla: 'DF', rotulo: 'Despesas financeiras', faixa: (t) => FAIXAS_TCU[t].df },
  { k: 'l', sigla: 'L', rotulo: 'Lucro', faixa: (t) => FAIXAS_TCU[t].l },
];
const TRIB: { k: keyof BdiParametros; sigla: string; rotulo: string }[] = [
  { k: 'pis', sigla: 'PIS', rotulo: 'PIS' },
  { k: 'cofins', sigla: 'COFINS', rotulo: 'COFINS' },
  { k: 'iss', sigla: 'ISS', rotulo: 'ISS efetivo' },
  { k: 'cprb', sigla: 'CPRB', rotulo: 'CPRB (desonerado)' },
];

const params = (b: OrcamentoBdi): BdiParametros => ({ ac: b.ac, s: b.s, r: b.r, g: b.g, df: b.df, l: b.l, pis: b.pis, cofins: b.cofins, iss: b.iss, cprb: b.cprb });

/** Régua min–médio–máx do TCU com o valor atual. */
function Regua({ faixa, valor }: { faixa: FaixaTcu; valor: number }) {
  const lo = Math.min(faixa.min * 0.6, valor), hi = Math.max(faixa.max * 1.3, valor) || 1;
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const fora = valor < faixa.min || valor > faixa.max;
  return (
    <div className="relative mt-1 h-3" aria-hidden>
      <div className="absolute inset-x-0 top-1.5 h-px bg-border-strong" />
      <div className="absolute top-1 h-1 rounded-full bg-success/30" style={{ left: pos(faixa.min), width: `calc(${pos(faixa.max)} - ${pos(faixa.min)})` }} />
      <div className="absolute top-0.5 h-2 w-px bg-fg-subtle" style={{ left: pos(faixa.medio) }} />
      <div className={cn('absolute top-0 h-3 w-1.5 -translate-x-1/2 rounded-xs border border-surface', fora ? 'bg-warning' : 'bg-brand')} style={{ left: pos(valor) }} />
    </div>
  );
}

/** BDI — fórmula TCU (Acórdão 2622/2013), presets por quartil e BDIs diferenciados. Dono: FRONTEND-2. */
export default function OrcamentoBdiPage() {
  const { orcamento, bdis, editavel } = useOrcamentoContexto();
  const toast = useToast();
  const itens = useItens(orcamento.id);
  const salvar = useSalvarBdi(orcamento.id);
  const excluir = useExcluirBdi(orcamento.id);
  const [selId, setSelId] = useState<string>('');
  const [tipo, setTipo] = useState<TipoObraTcu>('edificacoes');
  const [form, setForm] = useState<BdiParametros | null>(null);
  const [nome, setNome] = useState('');
  const [issAux, setIssAux] = useState<{ aliquota: number | null; base: number | null }>({ aliquota: 5, base: 50 });
  const [novo, setNovo] = useState<string | null>(null);
  const [aExcluir, setAExcluir] = useState<OrcamentoBdi | null>(null);
  const desonerado = orcamento.data_base?.regime === 'desonerado';

  const sel = bdis.find((b) => b.id === selId) ?? bdis.find((b) => b.is_padrao) ?? bdis[0];
  useEffect(() => {
    if (sel) {
      setForm(params(sel));
      setNome(sel.nome);
      if (!selId) setSelId(sel.id);
    }
  }, [sel, selId]);

  const uso = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of itens.data ?? []) {
      const k = i.bdi_id ?? bdis.find((b) => b.is_padrao)?.id ?? '';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [itens.data, bdis]);

  if (!sel || !form) return <Alert variant="warning">Este orçamento não tem BDI cadastrado.</Alert>;

  let bdi: number | null = null;
  let erro: string | null = null;
  try {
    bdi = calcularBdi(form);
  } catch (e) {
    erro = (e as Error).message;
  }
  const situacao = bdi !== null ? situacaoBdiTcu(bdi, tipo) : null;
  const I = tributosBdi(form);
  const alterado = JSON.stringify(form) !== JSON.stringify(params(sel)) || nome !== sel.nome;
  const set = (k: keyof BdiParametros, v: number | null) => setForm({ ...form, [k]: v ?? 0 });

  const onSalvar = async () => {
    try {
      await salvar.mutateAsync({ id: sel.id, nome, ...form });
      toast.success('BDI salvo', 'Itens recalculados com o novo percentual.');
    } catch (e) {
      toast.error('Não foi possível salvar', mensagemErro(e));
    }
  };
  const onCriar = async () => {
    if (!novo?.trim()) return;
    try {
      await salvar.mutateAsync({ nome: novo.trim(), ...presetTcu('fornecimento_materiais', 'medio') });
      setNovo(null);
      toast.success('BDI diferenciado criado', 'Associe-o aos itens na coluna BDI da planilha.');
    } catch (e) {
      toast.error('Não foi possível criar', mensagemErro(e));
    }
  };

  const f = (x: number) => (1 + x / 100).toFixed(4).replace('.', ',');

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
      {/* Lista de BDIs */}
      <Card flush className="self-start">
        <CardHeader eyebrow="Composições de BDI" title="BDIs do orçamento" actions={editavel && <Button size="sm" leftIcon={<Plus />} onClick={() => setNovo('BDI Fornecimento de materiais')}>Novo</Button>} />
        <ul className="p-1.5">
          {bdis.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => setSelId(b.id)} className={cn('flex w-full items-center justify-between gap-2 rounded px-2.5 py-2 text-left hover:bg-sunken', b.id === sel.id && 'bg-primary-soft/70 hover:bg-primary-soft')}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{b.nome}</span>
                  <span className="text-2xs text-fg-subtle">{b.is_padrao ? 'Padrão · ' : 'Diferenciado · '}{uso.get(b.id) ?? 0} item(ns)</span>
                </span>
                <span className="num text-md font-semibold">{formatNumero(b.bdi)}%</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-border px-3 py-2 text-xs text-fg-subtle">BDI diferenciado (ex.: fornecimento de equipamentos) só quando previsto em contrato/edital — Súmula TCU 253.</p>
      </Card>

      {/* Formulário */}
      <Card flush accent>
        <CardHeader
          eyebrow={sel.is_padrao ? 'BDI padrão' : 'BDI diferenciado'}
          title={<Input size="sm" aria-label="Nome do BDI" value={nome} readOnly={!editavel} onChange={(e) => setNome(e.target.value)} className="h-7 max-w-sm font-display text-md font-semibold" />}
          actions={
            <>
              <div className="w-56"><Select size="sm" aria-label="Tipo de obra (TCU)" value={tipo} onChange={(e) => setTipo(e.target.value as TipoObraTcu)} options={(Object.keys(FAIXAS_TCU) as TipoObraTcu[]).map((t) => ({ value: t, label: FAIXAS_TCU[t].rotulo }))} /></div>
            </>
          }
        />
        <CardBody className="space-y-5">
          {editavel && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Rotulo className="mr-1">Preset TCU</Rotulo>
              {(['min', 'medio', 'max'] as Quartil[]).map((q) => (
                <Button key={q} size="sm" onClick={() => setForm(presetTcu(tipo, q, { iss: form.iss, cprb: form.cprb }))}>
                  {LABEL_QUARTIL[q]} <span className="num text-fg-subtle">{formatNumero(FAIXAS_TCU[tipo].bdi[q])}%</span>
                </Button>
              ))}
            </div>
          )}

          <div>
            <Rotulo>Despesas indiretas e lucro (%)</Rotulo>
            <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-3">
              {CAMPOS.map((c) => {
                const faixa = c.faixa?.(tipo) ?? (c.k === 's' || c.k === 'g' ? { min: FAIXAS_TCU[tipo].sg.min / 2, medio: FAIXAS_TCU[tipo].sg.medio / 2, max: FAIXAS_TCU[tipo].sg.max / 2 } : undefined);
                return (
                  <Field key={c.k} label={<><span className="font-mono text-fg">{c.sigla}</span> · {c.rotulo}</>} hint={faixa && `TCU ${formatNumero(faixa.min)} – ${formatNumero(faixa.max)}`}>
                    {(p) => (
                      <div>
                        <NumberInput {...p} size="sm" decimals={2} min={0} value={form[c.k]} readOnly={!editavel} onChange={(v) => set(c.k, v)} suffix="%" />
                        {faixa && <Regua faixa={faixa} valor={form[c.k]} />}
                      </div>
                    )}
                  </Field>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-fg-subtle">S + G = <span className="num">{formatNumero(form.s + form.g)}%</span> (TCU agrupa seguros e garantias: {formatNumero(FAIXAS_TCU[tipo].sg.min)}–{formatNumero(FAIXAS_TCU[tipo].sg.max)}%).</p>
          </div>

          <div>
            <Rotulo>Tributos sobre o preço (I)</Rotulo>
            <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-4">
              {TRIB.map((c) => (
                <Field key={c.k} label={c.rotulo} hint={c.k === 'cprb' && !desonerado ? 'Somente no regime desonerado' : c.k === 'cprb' ? 'Alíquota vigente (Lei 14.973/2024)' : undefined}>
                  {(p) => <NumberInput {...p} size="sm" decimals={2} min={0} value={form[c.k]} readOnly={!editavel || (c.k === 'cprb' && !desonerado && form.cprb === 0)} onChange={(v) => set(c.k, v)} suffix="%" />}
                </Field>
              ))}
            </div>
            {editavel && (
              <div className="mt-3 flex flex-wrap items-end gap-2 rounded border border-dashed border-border-strong bg-surface-2 px-3 py-2">
                <span className="mb-1 text-xs text-fg-muted">ISS efetivo = alíquota municipal ×</span>
                <div className="w-24"><NumberInput size="sm" aria-label="Alíquota ISS municipal" value={issAux.aliquota} onChange={(v) => setIssAux({ ...issAux, aliquota: v })} suffix="%" /></div>
                <span className="mb-1 text-xs text-fg-muted">× base (mão de obra)</span>
                <div className="w-24"><NumberInput size="sm" aria-label="Base de cálculo do ISS" value={issAux.base} onChange={(v) => setIssAux({ ...issAux, base: v })} suffix="%" max={100} /></div>
                <Button size="sm" variant="ghost" onClick={() => set('iss', Math.round((issAux.aliquota ?? 0) * (issAux.base ?? 0)) / 100)}>
                  Aplicar = <span className="num">{formatNumero(((issAux.aliquota ?? 0) * (issAux.base ?? 0)) / 100)}%</span>
                </Button>
              </div>
            )}
          </div>
          {erro && <Alert variant="danger">{erro}</Alert>}
        </CardBody>
        {editavel && (
          <CardFooter>
            {!sel.is_padrao && <Button variant="ghost" className="mr-auto text-danger" leftIcon={<Trash2 />} onClick={() => setAExcluir(sel)}>Excluir</Button>}
            <Button disabled={!alterado} onClick={() => { setForm(params(sel)); setNome(sel.nome); }}>Descartar</Button>
            <Button variant="primary" leftIcon={<Save />} disabled={!alterado || Boolean(erro)} loading={salvar.isPending} onClick={() => void onSalvar()}>Salvar e recalcular</Button>
          </CardFooter>
        )}
      </Card>

      {/* Resultado */}
      <div className="flex flex-col gap-4 self-start">
        <Card cornerMarks="brand" className="text-center">
          <Rotulo>BDI calculado</Rotulo>
          <div className="num mt-1 text-3xl font-semibold">{bdi !== null ? `${formatNumero(bdi)}%` : '—'}</div>
          {situacao && (
            <Badge className="mt-2" variant={situacao === 'dentro' ? 'success' : 'warning'} dot>
              {situacao === 'dentro' ? 'Dentro da faixa TCU' : situacao === 'abaixo' ? 'Abaixo do 1º quartil TCU' : 'Acima do 3º quartil TCU'}
            </Badge>
          )}
          <div className="mt-3 text-xs text-fg-muted">
            Faixa {FAIXAS_TCU[tipo].rotulo.toLowerCase()}: <span className="num">{formatNumero(FAIXAS_TCU[tipo].bdi.min)}</span> · <span className="num">{formatNumero(FAIXAS_TCU[tipo].bdi.medio)}</span> · <span className="num">{formatNumero(FAIXAS_TCU[tipo].bdi.max)}%</span>
          </div>
          {bdi !== null && <div className="mx-4 mt-1"><Regua faixa={FAIXAS_TCU[tipo].bdi} valor={bdi} /></div>}
        </Card>
        <Card>
          <Rotulo>Fórmula (Acórdão 2622/2013-TCU-Plenário)</Rotulo>
          <p className="mt-2 font-mono text-xs leading-5 text-fg">BDI = [(1+AC+S+R+G)·(1+DF)·(1+L) / (1−I)] − 1</p>
          <div className="mt-2 space-y-0.5 border-t border-grid pt-2 font-mono text-xs text-fg-muted">
            <div className="flex justify-between"><span>(1+AC+S+R+G)</span><span className="text-fg">{f(form.ac + form.s + form.r + form.g)}</span></div>
            <div className="flex justify-between"><span>(1+DF)</span><span className="text-fg">{f(form.df)}</span></div>
            <div className="flex justify-between"><span>(1+L)</span><span className="text-fg">{f(form.l)}</span></div>
            <div className="flex justify-between"><span>I = PIS+COFINS+ISS+CPRB</span><span className="text-fg">{formatPercent(I)}</span></div>
            <div className="flex justify-between border-t border-grid pt-1 font-semibold text-fg"><span>BDI</span><span>{bdi !== null ? formatPercent(bdi) : '—'}</span></div>
          </div>
          <p className="mt-2 text-2xs text-fg-subtle">Arredondamento comercial a 2 casas, igual ao banco (coluna gerada `bdi`). Confira as faixas com o texto do acórdão antes de uso contratual.</p>
        </Card>
      </div>

      <Modal open={novo !== null} onClose={() => setNovo(null)} size="sm" title="Novo BDI diferenciado" footer={<><Button onClick={() => setNovo(null)}>Cancelar</Button><Button variant="primary" loading={salvar.isPending} onClick={() => void onCriar()}>Criar</Button></>}>
        <Field label="Nome" hint="Começa com o preset médio de fornecimento de materiais e equipamentos.">{(p) => <Input {...p} data-autofocus value={novo ?? ''} onChange={(e) => setNovo(e.target.value)} />}</Field>
      </Modal>
      <ConfirmDialog open={aExcluir !== null} onClose={() => setAExcluir(null)} destructive loading={excluir.isPending} title={`Excluir ${aExcluir?.nome}?`}
        description="Os itens que usam este BDI passam a usar o BDI padrão." confirmLabel="Excluir"
        onConfirm={() => aExcluir && excluir.mutate(aExcluir.id, { onSuccess: () => { setAExcluir(null); setSelId(''); }, onError: (e) => toast.error('Não foi possível excluir', mensagemErro(e)) })} />
    </div>
  );
}
