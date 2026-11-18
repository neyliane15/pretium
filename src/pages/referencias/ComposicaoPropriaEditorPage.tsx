import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Layers, Save, Trash2 } from 'lucide-react';
import { useBuscarReferencias, useComposicao, useComposicaoAnalitica, useComposicaoItens, useSalvarComposicaoPropria } from '@/api/orcamento/referencias';
import { ErroCarregamento, Rotulo } from '@/components/orcamento/comum';
import { SeletorDataBase } from '@/components/referencias/SeletorDataBase';
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Combobox, EmptyState, Field, IconButton, Input, LoadingBlock, NumberInput, PageHeader, TBody,
  TFoot, THead, Table, Tabs, Td, Textarea, Th, Tr, useToast,
} from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { custoComposicao, temParcelaSemPreco } from '@/lib/calc';
import { formatMoeda } from '@/lib/format';
import { mensagemErro } from '@/lib/supabase';
import { SIGLA_INSUMO_TIPO } from '@/lib/labels-orcamento';
import { rotas } from '@/routes';
import type { ComposicaoItemTipo, InsumoTipo, ReferenciaBusca } from '@/types/database';

interface LinhaEd {
  chave: string;
  tipo_item: ComposicaoItemTipo;
  referencia_id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  insumo_tipo: InsumoTipo | null;
  fonte: string;
  coeficiente: number | null;
  preco: number | null;
}

/** Editor de composição própria: cabeçalho, itens (insumos/subcomposições), coeficientes e custo ao vivo. Dono: FRONTEND-2. */
export default function ComposicaoPropriaEditorPage() {
  const { composicaoId } = useParams();
  const novo = !composicaoId;
  const navigate = useNavigate();
  const toast = useToast();
  const { podeEditar } = useOrganizacao();
  const comp = useComposicao(composicaoId);
  const itens = useComposicaoItens(composicaoId);
  const [db, setDb] = useState('');
  const analitica = useComposicaoAnalitica(composicaoId, db);
  const salvar = useSalvarComposicaoPropria();
  const [cab, setCab] = useState({ codigo: '', descricao: '', unidade: 'M2', grupo: '', observacao: '' });
  const [linhas, setLinhas] = useState<LinhaEd[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [termo, setTermo] = useState('');
  const [tipo, setTipo] = useState<'todos' | 'insumo' | 'composicao'>('todos');
  const busca = useBuscarReferencias(termo, db, tipo === 'todos' ? null : tipo, 40);

  useEffect(() => {
    if (novo || carregado || !comp.data || !itens.data) return;
    setCab({ codigo: comp.data.codigo, descricao: comp.data.descricao, unidade: comp.data.unidade, grupo: comp.data.grupo ?? '', observacao: comp.data.observacao ?? '' });
    setLinhas(itens.data.map((i) => {
      const r = i.insumo ?? i.subcomposicao;
      return {
        chave: i.id, tipo_item: i.tipo_item, referencia_id: (i.insumo_id ?? i.subcomposicao_id)!, codigo: r?.codigo ?? '', descricao: r?.descricao ?? '', unidade: r?.unidade ?? '',
        insumo_tipo: i.insumo?.tipo ?? null, fonte: r?.fonte ?? 'sinapi', coeficiente: i.coeficiente, preco: null,
      };
    }));
    setCarregado(true);
  }, [novo, carregado, comp.data, itens.data]);

  // preços na data-base a partir do analítico salvo (linhas novas trazem o preço da busca)
  const precoSalvo = useMemo(() => new Map((analitica.data ?? []).map((a) => [a.referencia_id, a.preco_unitario])), [analitica.data]);
  const comPreco = linhas.map((l) => ({ ...l, precoEf: l.preco ?? precoSalvo.get(l.referencia_id) ?? null }));
  const parcelas = comPreco.map((l) => ({ coeficiente: l.coeficiente ?? 0, preco: l.precoEf }));
  const custo = custoComposicao(parcelas);

  if (!novo && (comp.isLoading || itens.isLoading)) return <LoadingBlock />;
  if (!novo && (comp.isError || itens.isError)) return <ErroCarregamento erro={comp.error ?? itens.error} />;
  if (comp.data && comp.data.fonte !== 'propria') return <Alert variant="warning">Composições SINAPI não podem ser editadas.</Alert>;

  const adicionar = (r: ReferenciaBusca | null) => {
    if (!r) return;
    if (r.id === composicaoId) return toast.error('Uma composição não pode conter a si mesma');
    if (linhas.some((l) => l.referencia_id === r.id)) return toast.error('Item já está na composição', r.codigo);
    setLinhas((xs) => [...xs, { chave: crypto.randomUUID(), tipo_item: r.tipo, referencia_id: r.id, codigo: r.codigo, descricao: r.descricao, unidade: r.unidade, insumo_tipo: r.insumo_tipo, fonte: r.fonte, coeficiente: null, preco: r.preco }]);
  };
  const mover = (i: number, d: -1 | 1) => setLinhas((xs) => { const n = [...xs]; const j = i + d; if (j < 0 || j >= n.length) return xs; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });

  const onSalvar = async () => {
    if (!cab.codigo.trim() || cab.descricao.trim().length < 3 || !cab.unidade.trim()) return toast.error('Preencha código, descrição e unidade');
    if (linhas.some((l) => !l.coeficiente || l.coeficiente <= 0)) return toast.error('Todos os coeficientes devem ser maiores que zero');
    try {
      const id = await salvar.mutateAsync({
        id: composicaoId, codigo: cab.codigo, descricao: cab.descricao, unidade: cab.unidade, grupo: cab.grupo.trim() || null, observacao: cab.observacao.trim() || null,
        itens: linhas.map((l) => ({ tipo_item: l.tipo_item, referencia_id: l.referencia_id, coeficiente: l.coeficiente! })),
      });
      toast.success('Composição salva', `${cab.codigo} – custo ${formatMoeda(custo)}`);
      if (novo) navigate(rotas.composicaoPropria(id), { replace: true });
    } catch (e) {
      toast.error('Não foi possível salvar', mensagemErro(e));
    }
  };

  return (
    <>
      <PageHeader
        title={novo ? 'Nova composição própria' : <><span className="mr-2 font-mono text-lg text-fg-subtle">{cab.codigo}</span>Editar composição</>}
        breadcrumbs={[{ label: 'Composições próprias', to: rotas.composicoesProprias }, { label: novo ? 'Nova' : cab.codigo }]}
        actions={<>
          <SeletorDataBase className="w-72" value={db} onChange={setDb} />
          {podeEditar && <Button variant="primary" leftIcon={<Save />} loading={salvar.isPending} onClick={() => void onSalvar()}>Salvar</Button>}
        </>}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Card flush accent>
            <CardHeader eyebrow="Cabeçalho" title="Identificação" />
            <CardBody className="grid grid-cols-6 gap-3">
              <Field label="Código" required className="col-span-2">{(p) => <Input {...p} className="font-mono" value={cab.codigo} readOnly={!podeEditar} placeholder="ESC-001" onChange={(e) => setCab({ ...cab, codigo: e.target.value })} />}</Field>
              <Field label="Unidade" required className="col-span-1">{(p) => <Input {...p} value={cab.unidade} readOnly={!podeEditar} onChange={(e) => setCab({ ...cab, unidade: e.target.value.toUpperCase() })} />}</Field>
              <Field label="Grupo" className="col-span-3">{(p) => <Input {...p} value={cab.grupo} readOnly={!podeEditar} placeholder="REVESTIMENTOS" onChange={(e) => setCab({ ...cab, grupo: e.target.value })} />}</Field>
              <Field label="Descrição" required className="col-span-6">{(p) => <Textarea {...p} rows={2} value={cab.descricao} readOnly={!podeEditar} onChange={(e) => setCab({ ...cab, descricao: e.target.value })} />}</Field>
              <Field label="Observação (premissas, produtividade, fonte)" className="col-span-6">{(p) => <Textarea {...p} rows={2} value={cab.observacao} readOnly={!podeEditar} onChange={(e) => setCab({ ...cab, observacao: e.target.value })} />}</Field>
            </CardBody>
          </Card>

          <Card flush>
            <CardHeader eyebrow="Analítico" title={`${linhas.length} componente(s)`} />
            {podeEditar && (
              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
                <Tabs size="sm" variant="segmented" aria-label="Tipo" value={tipo} onChange={setTipo} items={[{ value: 'todos', label: 'Todos' }, { value: 'insumo', label: 'Insumos' }, { value: 'composicao', label: 'Composições' }]} />
                <div className="min-w-[280px] flex-1">
                  <Combobox<ReferenciaBusca> value={null} onChange={adicionar} onSearch={setTermo} items={busca.data ?? []} loading={busca.isFetching} clearOnSelect size="sm"
                    aria-label="Adicionar insumo ou composição" disabled={!db} getKey={(r) => `${r.tipo}-${r.id}`} getLabel={(r) => `${r.codigo} ${r.descricao}`}
                    placeholder="Adicionar insumo ou composição (código ou descrição)…" emptyText={termo.length < 2 ? 'Digite ao menos 2 caracteres' : 'Nada encontrado'}
                    renderItem={(r) => (
                      <div className="grid grid-cols-[48px_60px_1fr_36px_80px] items-center gap-2 text-sm">
                        <Badge variant={r.tipo === 'composicao' ? 'info' : 'neutral'}>{r.tipo === 'composicao' ? 'COMP' : 'INS'}</Badge>
                        <span className="font-mono text-xs text-fg-muted">{r.codigo}</span><span className="truncate">{r.descricao}</span>
                        <span className="text-xs text-fg-subtle">{r.unidade}</span><span className="num text-right text-xs">{formatMoeda(r.preco)}</span>
                      </div>
                    )} />
                </div>
              </div>
            )}
            {linhas.length === 0 ? (
              <EmptyState variant="inline" icon={<Layers />} title="Sem componentes" description="Busque insumos (materiais, mão de obra, equipamentos) e composições auxiliares e informe os coeficientes por unidade." className="py-8" />
            ) : (
              <Table density="compact" gridLines inset>
                <THead>
                  <Tr><Th width={92}>Tipo</Th><Th width={70}>Código</Th><Th>Descrição</Th><Th width={40}>Und</Th><Th numeric width={120}>Coeficiente</Th><Th numeric width={92}>Preço</Th><Th numeric width={92}>Parcial</Th><Th width={84} /></Tr>
                </THead>
                <TBody>
                  {comPreco.map((l, i) => (
                    <Tr key={l.chave}>
                      <Td><Badge variant={l.tipo_item === 'composicao' ? 'info' : l.insumo_tipo === 'mao_de_obra' ? 'brand' : 'neutral'}>{l.tipo_item === 'composicao' ? 'COMP.' : l.insumo_tipo ? SIGLA_INSUMO_TIPO[l.insumo_tipo] : 'INSUMO'}</Badge></Td>
                      <Td mono>{l.codigo}</Td>
                      <Td truncate title={l.descricao}>{l.descricao}{l.fonte === 'propria' && <Badge variant="brand" className="ml-1.5">PRÓP.</Badge>}</Td>
                      <Td muted className="text-xs">{l.unidade}</Td>
                      <Td numeric className="px-0.5">
                        {podeEditar ? (
                          <NumberInput size="sm" aria-label={`Coeficiente de ${l.codigo}`} className="!h-5 border-transparent bg-transparent px-1 shadow-none hover:border-border-strong focus:bg-surface" decimals={7} min={0} value={l.coeficiente} invalid={!l.coeficiente}
                            onChange={(v) => setLinhas((xs) => xs.map((x) => (x.chave === l.chave ? { ...x, coeficiente: v } : x)))} />
                        ) : l.coeficiente}
                      </Td>
                      <Td numeric>{formatMoeda(l.precoEf)}</Td>
                      <Td numeric>{l.precoEf !== null && l.coeficiente ? formatMoeda(l.coeficiente * l.precoEf) : '—'}</Td>
                      <Td className="px-0.5">
                        {podeEditar && (
                          <span className="flex">
                            <IconButton size="sm" className="h-5" label="Subir" icon={<ArrowUp />} onClick={() => mover(i, -1)} />
                            <IconButton size="sm" className="h-5" label="Descer" icon={<ArrowDown />} onClick={() => mover(i, 1)} />
                            <IconButton size="sm" className="h-5" label="Remover" icon={<Trash2 />} onClick={() => setLinhas((xs) => xs.filter((x) => x.chave !== l.chave))} />
                          </span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
                <TFoot>
                  <Tr><Td colSpan={6} className="text-right">Custo unitário ({cab.unidade})</Td><Td numeric className="text-md">{formatMoeda(custo)}</Td><Td /></Tr>
                </TFoot>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-4 self-start">
          <Card cornerMarks="brand" className="text-center">
            <Rotulo>Custo unitário na data-base</Rotulo>
            <div className="num mt-1 text-3xl font-semibold">{formatMoeda(custo)}</div>
            <div className="text-xs text-fg-muted">R$ / {cab.unidade || 'un'}</div>
            {temParcelaSemPreco(parcelas) && linhas.length > 0 && <p className="mt-2 text-xs text-warning">Há componentes sem preço nesta data-base.</p>}
          </Card>
          <Card>
            <Rotulo>Como é calculado</Rotulo>
            <p className="mt-1.5 text-xs leading-5 text-fg-muted">Custo = round2(Σ coeficiente × preço). Insumos usam o preço da data-base (ou o preço próprio); composições auxiliares entram com o próprio custo arredondado. Em orçamentos, cotações do orçamento têm prioridade (ARQUITETURA §8.2).</p>
          </Card>
        </div>
      </div>
    </>
  );
}
