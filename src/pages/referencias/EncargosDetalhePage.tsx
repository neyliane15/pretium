import { Fragment, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Save, Sigma, Trash2 } from 'lucide-react';
import { useEncargosDetalhe, useExcluirEncargos, useSalvarEncargos } from '@/api/orcamento/referencias';
import { ErroCarregamento, Rotulo } from '@/components/orcamento/comum';
import {
  Alert, Badge, Button, Card, CardHeader, ConfirmDialog, DemoBadge, IconButton, Input, LoadingBlock, NumberInput, PageHeader, Stat, TBody, TFoot,
  THead, Table, Td, Th, Tr, useToast,
} from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { reincidencia, totalEncargos } from '@/lib/calc';
import { formatNumero, formatPercent } from '@/lib/format';
import { LABEL_REGIME } from '@/lib/labels';
import { LABEL_ENCARGO_GRUPO } from '@/lib/labels-orcamento';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';
import type { EncargoGrupo } from '@/types/database';

interface ItemEd {
  chave: string;
  id?: string;
  grupo: EncargoGrupo;
  codigo: string;
  descricao: string;
  horista: number;
  mensalista: number;
}
const GRUPOS: EncargoGrupo[] = ['A', 'B', 'C', 'D'];

/** Detalhe/edição de tabela de encargos sociais (grupos A–D). Dono: FRONTEND-2. */
export default function EncargosDetalhePage() {
  const { encargosId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { podeEditar } = useOrganizacao();
  const q = useEncargosDetalhe(encargosId);
  const salvar = useSalvarEncargos();
  const excluir = useExcluirEncargos();
  const [nome, setNome] = useState('');
  const [itens, setItens] = useState<ItemEd[]>([]);
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [sujo, setSujo] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    if (!q.data || sujo) return;
    setNome(q.data.encargos.nome);
    setItens(q.data.itens.map((i) => ({ chave: i.id, id: i.id, grupo: i.grupo, codigo: i.codigo, descricao: i.descricao, horista: i.horista, mensalista: i.mensalista })));
  }, [q.data, sujo]);

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data) return <ErroCarregamento erro={q.error} />;
  const e = q.data.encargos;
  const editavel = podeEditar && Boolean(e.organizacao_id);
  const tot = totalEncargos(itens);
  const set = (chave: string, patch: Partial<ItemEd>) => { setItens((xs) => xs.map((x) => (x.chave === chave ? { ...x, ...patch } : x))); setSujo(true); };
  const add = (g: EncargoGrupo, base?: Partial<ItemEd>) => {
    const n = itens.filter((i) => i.grupo === g).length + 1;
    setItens((xs) => [...xs, { chave: crypto.randomUUID(), grupo: g, codigo: `${g}${n}`, descricao: '', horista: 0, mensalista: 0, ...base }]);
    setSujo(true);
  };

  const onSalvar = async () => {
    try {
      await salvar.mutateAsync({
        id: e.id,
        cabecalho: { nome: nome.trim() || e.nome },
        removidos,
        itens: itens.map((i, k) => ({ id: i.id, grupo: i.grupo, codigo: i.codigo.trim(), descricao: i.descricao.trim(), horista: i.horista, mensalista: i.mensalista, ordem: k + 1 })),
      });
      setSujo(false);
      setRemovidos([]);
      toast.success('Encargos salvos', `Horista ${formatPercent(tot.horista)} · Mensalista ${formatPercent(tot.mensalista)}`);
    } catch (err) {
      toast.error('Não foi possível salvar', mensagemErro(err));
    }
  };

  return (
    <>
      <PageHeader
        title={editavel ? <Input aria-label="Nome da tabela" value={nome} onChange={(ev) => { setNome(ev.target.value); setSujo(true); }} className="h-9 min-w-[420px] font-display text-xl font-semibold" /> : e.nome}
        breadcrumbs={[{ label: 'Encargos sociais', to: rotas.encargos }, { label: e.nome }]}
        badges={<>{e.is_demo && <DemoBadge />}{!e.organizacao_id && <Badge variant="outline">Referência · somente leitura</Badge>}</>}
        description={`${e.uf ?? '—'} · ${LABEL_REGIME[e.regime]}`}
        actions={editavel && <>
          <Button variant="ghost" className="text-danger" leftIcon={<Trash2 />} onClick={() => setConfirmar(true)}>Excluir</Button>
          <Button variant="primary" leftIcon={<Save />} disabled={!sujo} loading={salvar.isPending} onClick={() => void onSalvar()}>Salvar</Button>
        </>}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="Total horista" value={formatPercent(tot.horista)} highlight className="xl:col-span-2" />
        <Stat label="Total mensalista" value={formatPercent(tot.mensalista)} className="xl:col-span-2" />
        {GRUPOS.slice(0, 2).map((g) => <Stat key={g} label={`Grupo ${g}`} value={formatPercent(tot.porGrupo[g].horista)} hint={`mensalista ${formatPercent(tot.porGrupo[g].mensalista)}`} />)}
      </div>
      {!editavel && e.organizacao_id === null && podeEditar && <Alert variant="info" className="mb-3">Tabelas de referência são mantidas pelo administrador. Copie-a para a organização na lista de encargos para editar.</Alert>}

      <Card flush accent>
        <CardHeader eyebrow="Composição" title="Itens por grupo" description="Percentuais sobre a remuneração; grupo D = reincidências (A × B)." />
        <Table density="compact" gridLines inset>
          <THead><Tr><Th width={70}>Código</Th><Th>Descrição</Th><Th numeric width={120}>Horista (%)</Th><Th numeric width={120}>Mensalista (%)</Th><Th width={36} /></Tr></THead>
          <TBody>
            {GRUPOS.map((g) => (
              <Fragment key={g}>
                <Tr group={1}>
                  <Td mono>{g}</Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      {LABEL_ENCARGO_GRUPO[g]}
                      {editavel && <Button size="sm" variant="ghost" className="h-5" leftIcon={<Plus />} onClick={() => add(g)}>item</Button>}
                      {editavel && g === 'D' && (
                        <Button size="sm" variant="ghost" className="h-5" leftIcon={<Sigma />}
                          onClick={() => add('D', { descricao: 'Reincidência de A sobre B', horista: reincidencia(tot.porGrupo.A.horista, tot.porGrupo.B.horista), mensalista: reincidencia(tot.porGrupo.A.mensalista, tot.porGrupo.B.mensalista) })}>
                          A × B
                        </Button>
                      )}
                    </span>
                  </Td>
                  <Td numeric>{formatNumero(tot.porGrupo[g].horista)}</Td>
                  <Td numeric>{formatNumero(tot.porGrupo[g].mensalista)}</Td>
                  <Td />
                </Tr>
                {itens.filter((i) => i.grupo === g).map((i) => (
                  <Tr key={i.chave}>
                    <Td mono>{editavel ? <Input size="sm" aria-label="Código" className="!h-5 font-mono" value={i.codigo} onChange={(ev) => set(i.chave, { codigo: ev.target.value })} /> : i.codigo}</Td>
                    <Td>{editavel ? <Input size="sm" aria-label="Descrição" className="!h-5" value={i.descricao} onChange={(ev) => set(i.chave, { descricao: ev.target.value })} /> : i.descricao}</Td>
                    <Td numeric className="px-0.5">{editavel ? <NumberInput size="sm" aria-label={`Horista ${i.codigo}`} className="!h-5" decimals={2} min={0} value={i.horista} onChange={(v) => set(i.chave, { horista: v ?? 0 })} /> : formatNumero(i.horista)}</Td>
                    <Td numeric className="px-0.5">{editavel ? <NumberInput size="sm" aria-label={`Mensalista ${i.codigo}`} className="!h-5" decimals={2} min={0} value={i.mensalista} onChange={(v) => set(i.chave, { mensalista: v ?? 0 })} /> : formatNumero(i.mensalista)}</Td>
                    <Td className="px-0.5">{editavel && <IconButton size="sm" className="h-5" label="Remover" icon={<Trash2 />} onClick={() => { setItens((xs) => xs.filter((x) => x.chave !== i.chave)); if (i.id) setRemovidos((r) => [...r, i.id!]); setSujo(true); }} />}</Td>
                  </Tr>
                ))}
              </Fragment>
            ))}
          </TBody>
          <TFoot>
            <Tr><Td colSpan={2} className="text-right">Total de encargos sociais</Td><Td numeric className="text-md">{formatNumero(tot.horista)}</Td><Td numeric className="text-md">{formatNumero(tot.mensalista)}</Td><Td /></Tr>
          </TFoot>
        </Table>
      </Card>
      <p className="mt-2 text-2xs text-fg-subtle"><Rotulo>Nota</Rotulo> o total é recalculado também no banco (trigger); os insumos SINAPI de mão de obra já incluem encargos.</p>
      <ConfirmDialog open={confirmar} onClose={() => setConfirmar(false)} destructive loading={excluir.isPending} title="Excluir tabela de encargos?" confirmLabel="Excluir"
        description="Orçamentos que a utilizam ficam sem tabela de encargos."
        onConfirm={() => excluir.mutate(e.id, { onSuccess: () => navigate(rotas.encargos), onError: (err) => toast.error('Não foi possível excluir', mensagemErro(err)) })} />
    </>
  );
}
