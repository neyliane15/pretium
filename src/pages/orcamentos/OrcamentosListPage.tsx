import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Calculator, Copy, ExternalLink, MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react';
import { useDuplicarOrcamento, useExcluirOrcamento, useOrcamentos, type OrcamentoLista } from '@/api/orcamento/orcamentos';
import { DataBaseTag, ErroCarregamento, StatusOrcamento } from '@/components/orcamento/comum';
import { NovoOrcamentoModal } from '@/components/orcamento/NovoOrcamentoModal';
import {
  Button, ConfirmDialog, DropdownMenu, EmptyState, IconButton, Input, PageHeader, Pagination, Select, Skeleton, TBody, TFoot, THead,
  Table, TableMessage, Td, Th, Tooltip, Tr, useToast,
} from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { somaMoeda } from '@/lib/calc';
import { formatData, formatNumero, formatRelativo } from '@/lib/format';
import { LABEL_ORCAMENTO_STATUS, opcoes } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';
import type { OrcamentoStatus } from '@/types/database';

const POR_PAGINA = 30;
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Lista de orçamentos da organização. Dono: FRONTEND-2. */
export default function OrcamentosListPage() {
  const { podeEditar } = useOrganizacao();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const orcs = useOrcamentos();
  const duplicar = useDuplicarOrcamento();
  const excluir = useExcluirOrcamento();
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<OrcamentoStatus | ''>('');
  const [obra, setObra] = useState('');
  const [pagina, setPagina] = useState(1);
  const [aExcluir, setAExcluir] = useState<OrcamentoLista | null>(null);

  const obras = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orcs.data ?? []) if (o.obra) m.set(o.obra.id, o.obra.nome);
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [orcs.data]);

  const filtrados = useMemo(() => {
    const t = semAcento(busca.trim());
    return (orcs.data ?? []).filter(
      (o) => (!status || o.status === status) && (!obra || o.obra_id === obra) && (!t || semAcento(`${o.nome} ${o.codigo ?? ''} ${o.obra?.nome ?? ''}`).includes(t)),
    );
  }, [orcs.data, busca, status, obra]);
  const pag = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const onDuplicar = async (o: OrcamentoLista) => {
    try {
      const id = await duplicar.mutateAsync({ id: o.id, novaVersao: true });
      toast.success('Nova versão criada', `${o.nome} – cópia`);
      navigate(rotas.orcamento(id));
    } catch (e) {
      toast.error('Não foi possível duplicar', mensagemErro(e));
    }
  };
  const onExcluir = async () => {
    if (!aExcluir) return;
    try {
      await excluir.mutateAsync(aExcluir.id);
      toast.success('Orçamento excluído');
      setAExcluir(null);
    } catch (e) {
      toast.error('Não foi possível excluir', mensagemErro(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Orçamentos"
        description="Orçamentos analíticos com base SINAPI-RJ, versões e status."
        actions={podeEditar && <Button variant="primary" leftIcon={<Plus />} onClick={() => setParams({ novo: '1' })}>Novo orçamento</Button>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-72"><Input size="sm" prefix={<Search />} placeholder="Buscar orçamento ou obra…" aria-label="Buscar orçamentos" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} /></div>
        <div className="w-40"><Select size="sm" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as OrcamentoStatus | ''); setPagina(1); }} placeholder="Todos os status" options={opcoes(LABEL_ORCAMENTO_STATUS)} /></div>
        <div className="w-56"><Select size="sm" aria-label="Obra" value={obra} onChange={(e) => { setObra(e.target.value); setPagina(1); }} placeholder="Todas as obras" options={obras} /></div>
        <span className="ml-auto font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle">{filtrados.length} orçamento(s)</span>
      </div>

      {orcs.isError ? (
        <ErroCarregamento erro={orcs.error} onRetry={() => void orcs.refetch()} />
      ) : orcs.data && orcs.data.length === 0 ? (
        <EmptyState
          icon={<Calculator />}
          title="Nenhum orçamento"
          description="Crie um orçamento a partir de uma obra e da data-base SINAPI desejada."
          action={podeEditar && <Button variant="primary" leftIcon={<Plus />} onClick={() => setParams({ novo: '1' })}>Novo orçamento</Button>}
        />
      ) : (
        <>
          <Table stickyHeader containerClassName="max-h-[calc(100vh-240px)]">
            <THead>
              <Tr>
                <Th width={100}>Código</Th>
                <Th>Orçamento</Th>
                <Th>Obra</Th>
                <Th width={44}>Ver.</Th>
                <Th>Data-base</Th>
                <Th>Status</Th>
                <Th numeric>Data</Th>
                <Th numeric>Total s/ BDI</Th>
                <Th numeric>Total (R$)</Th>
                <Th numeric>Atualizado</Th>
                <Th width={36}><span className="sr-only">Ações</span></Th>
              </Tr>
            </THead>
            <TBody>
              {orcs.isLoading && Array.from({ length: 6 }, (_, i) => <Tr key={i}><Td colSpan={11}><Skeleton className="h-3 w-full" /></Td></Tr>)}
              {orcs.data && filtrados.length === 0 && <TableMessage colSpan={11}>Nenhum orçamento corresponde aos filtros.</TableMessage>}
              {pag.map((o) => (
                <Tr key={o.id} interactive onClick={() => navigate(rotas.orcamento(o.id))}>
                  <Td mono muted>{o.codigo ?? '—'}</Td>
                  <Td className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {o.nome}
                      {o.itens_sem_preco > 0 && (
                        <Tooltip content={`${o.itens_sem_preco} item(ns) sem preço na data-base`}>
                          <AlertTriangle aria-label="Itens sem preço" className="h-3.5 w-3.5 text-warning" />
                        </Tooltip>
                      )}
                    </span>
                  </Td>
                  <Td muted truncate className="max-w-[220px]" title={o.obra?.nome}>{o.obra?.nome ?? '—'}</Td>
                  <Td mono>v{o.versao}</Td>
                  <Td><DataBaseTag db={o.data_base} /></Td>
                  <Td><StatusOrcamento status={o.status} /></Td>
                  <Td numeric muted>{formatData(o.data_orcamento)}</Td>
                  <Td numeric muted>{formatNumero(o.total_sem_bdi)}</Td>
                  <Td numeric className="font-medium">{formatNumero(o.total)}</Td>
                  <Td numeric muted className="text-xs">{formatRelativo(o.updated_at)}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu
                      align="end"
                      aria-label={`Ações de ${o.nome}`}
                      trigger={<IconButton size="sm" label="Ações" icon={<MoreHorizontal />} />}
                      items={[
                        { label: 'Abrir planilha', icon: <ExternalLink />, onSelect: () => navigate(rotas.orcamento(o.id)) },
                        { label: 'Duplicar como nova versão', icon: <Copy />, onSelect: () => void onDuplicar(o), disabled: !podeEditar },
                        'separator',
                        { label: 'Excluir', icon: <Trash2 />, danger: true, onSelect: () => setAExcluir(o), disabled: !podeEditar },
                      ]}
                    />
                  </Td>
                </Tr>
              ))}
            </TBody>
            {filtrados.length > 0 && (
              <TFoot>
                <Tr>
                  <Td colSpan={7} className="text-right font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle">Soma dos filtrados</Td>
                  <Td numeric>{formatNumero(somaMoeda(filtrados.map((o) => o.total_sem_bdi)))}</Td>
                  <Td numeric>{formatNumero(somaMoeda(filtrados.map((o) => o.total)))}</Td>
                  <Td colSpan={2} />
                </Tr>
              </TFoot>
            )}
          </Table>
          {filtrados.length > POR_PAGINA && <Pagination className="mt-3" page={pagina} pageSize={POR_PAGINA} total={filtrados.length} onChange={setPagina} itemLabel="orçamentos" />}
        </>
      )}

      <NovoOrcamentoModal open={params.get('novo') === '1'} onClose={() => setParams({}, { replace: true })} obraId={params.get('obra')} />
      <ConfirmDialog
        open={aExcluir !== null}
        onClose={() => setAExcluir(null)}
        onConfirm={() => void onExcluir()}
        destructive
        loading={excluir.isPending}
        title="Excluir orçamento?"
        description={<>O orçamento <strong>{aExcluir?.nome}</strong> (v{aExcluir?.versao}) será excluído com etapas, itens, cronograma e medições.</>}
        confirmLabel="Excluir"
      />
    </>
  );
}
