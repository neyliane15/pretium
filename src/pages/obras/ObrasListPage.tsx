import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useExcluirObra, useObras, type ObraComCliente } from '@/api/core/obras';
import { ObraFormModal } from '@/components/obras/ObraFormModal';
import { ErroCarregamento, StatusObra } from '@/components/orcamento/comum';
import {
  Button, ConfirmDialog, DropdownMenu, EmptyState, IconButton, Input, PageHeader, Pagination, Select, Skeleton, TBody, THead, Table,
  TableMessage, Td, Th, Tr, useToast, type SortDir,
} from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { formatData, formatNumero } from '@/lib/format';
import { LABEL_OBRA_STATUS, opcoes } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';
import type { ObraStatus } from '@/types/database';

const POR_PAGINA = 25;
type Ordem = 'nome' | 'status' | 'area' | 'inicio' | 'atualizado';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Lista de obras com busca, filtro por status/município e ordenação. Dono: FRONTEND-2. */
export default function ObrasListPage() {
  const { podeEditar } = useOrganizacao();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const obras = useObras();
  const excluir = useExcluirObra();
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<ObraStatus | ''>('');
  const [municipio, setMunicipio] = useState('');
  const [pagina, setPagina] = useState(1);
  const [ordem, setOrdem] = useState<{ col: Ordem; dir: Exclude<SortDir, null> }>({ col: 'atualizado', dir: 'desc' });
  const [editando, setEditando] = useState<ObraComCliente | null>(null);
  const [aExcluir, setAExcluir] = useState<ObraComCliente | null>(null);
  const formAberto = params.get('nova') === '1' || editando !== null;

  const municipios = useMemo(() => [...new Set((obras.data ?? []).map((o) => o.municipio).filter((m): m is string => Boolean(m)))].sort(), [obras.data]);

  const filtradas = useMemo(() => {
    const t = semAcento(busca.trim());
    const xs = (obras.data ?? []).filter(
      (o) =>
        (!status || o.status === status) &&
        (!municipio || o.municipio === municipio) &&
        (!t || semAcento(`${o.nome} ${o.codigo ?? ''} ${o.cliente?.nome ?? ''} ${o.bairro ?? ''}`).includes(t)),
    );
    const k = (o: ObraComCliente): string | number =>
      ordem.col === 'nome' ? o.nome : ordem.col === 'status' ? o.status : ordem.col === 'area' ? (o.area_construida_m2 ?? -1) : ordem.col === 'inicio' ? (o.data_inicio_prevista ?? '') : o.updated_at;
    return [...xs].sort((a, b) => {
      const ka = k(a), kb = k(b);
      const c = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb), 'pt-BR');
      return ordem.dir === 'asc' ? c : -c;
    });
  }, [obras.data, busca, status, municipio, ordem]);

  const pag = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const sortProps = (col: Ordem) => ({
    sort: ordem.col === col ? ordem.dir : null,
    onSort: () => setOrdem((o) => ({ col, dir: o.col === col && o.dir === 'asc' ? 'desc' : 'asc' })),
  });

  const fecharForm = () => {
    setEditando(null);
    if (params.get('nova')) setParams({}, { replace: true });
  };

  const confirmarExclusao = async () => {
    if (!aExcluir) return;
    try {
      await excluir.mutateAsync(aExcluir.id);
      toast.success('Obra excluída', aExcluir.nome);
      setAExcluir(null);
    } catch (e) {
      toast.error('Não foi possível excluir', mensagemErro(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Obras"
        description="Empreendimentos e projetos da organização."
        actions={podeEditar && <Button variant="primary" leftIcon={<Plus />} onClick={() => setParams({ nova: '1' })}>Nova obra</Button>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-72">
          <Input size="sm" prefix={<Search />} placeholder="Buscar por nome, código, cliente, bairro…" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} aria-label="Buscar obras" />
        </div>
        <div className="w-44">
          <Select size="sm" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as ObraStatus | ''); setPagina(1); }} placeholder="Todos os status" options={opcoes(LABEL_OBRA_STATUS)} />
        </div>
        {municipios.length > 1 && (
          <div className="w-44">
            <Select size="sm" aria-label="Município" value={municipio} onChange={(e) => { setMunicipio(e.target.value); setPagina(1); }} placeholder="Todos os municípios" options={municipios.map((m) => ({ value: m, label: m }))} />
          </div>
        )}
        <span className="ml-auto font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle">{filtradas.length} obra(s)</span>
      </div>

      {obras.isError ? (
        <ErroCarregamento erro={obras.error} onRetry={() => void obras.refetch()} />
      ) : obras.data && obras.data.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title="Nenhuma obra cadastrada"
          description="Cadastre a obra para vincular orçamentos, cronograma, medições e honorários de projeto."
          action={podeEditar && <Button variant="primary" leftIcon={<Plus />} onClick={() => setParams({ nova: '1' })}>Cadastrar obra</Button>}
        />
      ) : (
        <>
          <Table stickyHeader containerClassName="max-h-[calc(100vh-240px)]">
            <THead>
              <Tr>
                <Th width={96}>Código</Th>
                <Th {...sortProps('nome')}>Obra</Th>
                <Th>Cliente</Th>
                <Th>Local</Th>
                <Th {...sortProps('status')}>Status</Th>
                <Th numeric {...sortProps('area')}>Área (m²)</Th>
                <Th numeric {...sortProps('inicio')}>Início</Th>
                <Th>RT</Th>
                <Th width={36}><span className="sr-only">Ações</span></Th>
              </Tr>
            </THead>
            <TBody>
              {obras.isLoading &&
                Array.from({ length: 6 }, (_, i) => (
                  <Tr key={i}><Td colSpan={9}><Skeleton className="h-3 w-full" /></Td></Tr>
                ))}
              {obras.data && filtradas.length === 0 && <TableMessage colSpan={9}>Nenhuma obra corresponde aos filtros.</TableMessage>}
              {pag.map((o) => (
                <Tr key={o.id} interactive onClick={() => navigate(rotas.obra(o.id))}>
                  <Td mono muted>{o.codigo ?? '—'}</Td>
                  <Td className="font-medium">
                    <Link to={rotas.obra(o.id)} onClick={(e) => e.stopPropagation()} className="hover:underline">{o.nome}</Link>
                    {o.tipo_obra && <div className="text-xs font-normal text-fg-subtle">{o.tipo_obra}</div>}
                  </Td>
                  <Td muted>{o.cliente?.nome ?? '—'}</Td>
                  <Td muted>{[o.bairro, o.municipio].filter(Boolean).join(', ') || '—'}{o.uf && <span className="ml-1 font-mono text-2xs">/{o.uf}</span>}</Td>
                  <Td><StatusObra status={o.status} /></Td>
                  <Td numeric>{formatNumero(o.area_construida_m2)}</Td>
                  <Td numeric muted>{formatData(o.data_inicio_prevista)}</Td>
                  <Td muted className="text-xs">{o.responsavel_tecnico ?? '—'}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    {podeEditar && (
                      <DropdownMenu
                        align="end"
                        aria-label={`Ações de ${o.nome}`}
                        trigger={<IconButton size="sm" label="Ações" icon={<MoreHorizontal />} />}
                        items={[
                          { label: 'Editar', icon: <Pencil />, onSelect: () => setEditando(o) },
                          'separator',
                          { label: 'Excluir', icon: <Trash2 />, danger: true, onSelect: () => setAExcluir(o) },
                        ]}
                      />
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {filtradas.length > POR_PAGINA && <Pagination className="mt-3" page={pagina} pageSize={POR_PAGINA} total={filtradas.length} onChange={setPagina} itemLabel="obras" />}
        </>
      )}

      <ObraFormModal open={formAberto} onClose={fecharForm} obra={editando} onSalva={(o) => !editando && navigate(rotas.obra(o.id))} />
      <ConfirmDialog
        open={aExcluir !== null}
        onClose={() => setAExcluir(null)}
        onConfirm={() => void confirmarExclusao()}
        destructive
        loading={excluir.isPending}
        title="Excluir obra?"
        description={<>A obra <strong>{aExcluir?.nome}</strong> e <strong>todos os seus orçamentos, medições e honorários</strong> serão excluídos definitivamente.</>}
        confirmLabel="Excluir obra"
      />
    </>
  );
}
