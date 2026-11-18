import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, Layers, Package, Search } from 'lucide-react';
import { useBuscarReferencias, useListarReferencias, useDatasBase } from '@/api/orcamento/referencias';
import { DataBaseTag, ErroCarregamento } from '@/components/orcamento/comum';
import { SeletorDataBase } from '@/components/referencias/SeletorDataBase';
import { Badge, DemoBadge, EmptyState, Input, PageHeader, Pagination, Skeleton, TBody, THead, Table, TableMessage, Tabs, Td, Th, Tr } from '@/components/ui';
import { useDebounce } from '@/hooks/orcamento/useDebounce';
import { formatMoeda } from '@/lib/format';
import { LABEL_INSUMO_TIPO } from '@/lib/labels';
import { rotas } from '@/routes';
import { BotaoBuscarSinapiCaixa } from '@/components/referencias/BuscarSinapiCaixa';

/** Consulta SINAPI (e próprias) por código/descrição na data-base escolhida. Dono: FRONTEND-2. */
export default function SinapiConsultaPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [termo, setTermo] = useState(params.get('q') ?? '');
  const [db, setDb] = useState(params.get('db') ?? '');
  const [tipo, setTipo] = useState<'todos' | 'composicao' | 'insumo'>((params.get('tipo') as 'composicao' | 'insumo') ?? 'todos');
  const t = useDebounce(termo, 300);
  const datas = useDatasBase();
  const q = useBuscarReferencias(t, db, tipo === 'todos' ? null : tipo, 100);
  const dbSel = datas.data?.find((d) => d.id === db);
  const buscando = t.trim().length >= 2;
  // sem busca: lista a tabela inteira (composições ou insumos), página a página
  const tipoLista: 'insumo' | 'composicao' = tipo === 'insumo' ? 'insumo' : 'composicao';
  const [pagina, setPagina] = useState(1);
  useEffect(() => setPagina(1), [db, tipoLista]);
  const lista = useListarReferencias(buscando ? null : db, tipoLista, pagina, 50);

  const atualizar = (patch: Record<string, string>) => setParams({ ...Object.fromEntries(params), ...patch }, { replace: true });

  return (
    <>
      <PageHeader title="Consulta SINAPI" description="Insumos e composições com preço na data-base, incluindo os próprios da organização." badges={dbSel && <DataBaseTag db={dbSel} />} actions={<BotaoBuscarSinapiCaixa ufInicial={dbSel?.uf} />} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-80 flex-1 md:flex-none">
          <Input autoFocus prefix={<Search />} placeholder="Buscar por código ou descrição (ex.: alvenaria)" aria-label="Buscar" value={termo}
            onChange={(e) => { setTermo(e.target.value); atualizar({ q: e.target.value }); }} />
        </div>
        <Tabs variant="segmented" aria-label="Tipo" value={buscando ? tipo : tipoLista} onChange={(v) => { setTipo(v); atualizar({ tipo: v }); }}
          items={buscando ? [{ value: 'todos', label: 'Todos' }, { value: 'composicao', label: 'Composições', icon: <Layers /> }, { value: 'insumo', label: 'Insumos', icon: <Package /> }] : [{ value: 'composicao', label: 'Composições', icon: <Layers /> }, { value: 'insumo', label: 'Insumos', icon: <Package /> }]} />
        <SeletorDataBase className="w-72" value={db} onChange={(v) => { setDb(v); atualizar({ db: v }); }} />
        {buscando && q.data && <span className="ml-auto font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle">{q.data.length} resultado(s){q.data.length === 100 ? ' (máx.)' : ''}</span>}
        {!buscando && lista.data && <span className="ml-auto font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle">{lista.data.total.toLocaleString('pt-BR')} {tipoLista === 'insumo' ? 'insumos' : 'composições'}</span>}
      </div>

      {q.isError ? (
        <ErroCarregamento erro={q.error} onRetry={() => void q.refetch()} />
      ) : !buscando ? (
        lista.isError ? (
          <ErroCarregamento erro={lista.error} onRetry={() => void lista.refetch()} />
        ) : !db || (lista.data && lista.data.total === 0) ? (
          <EmptyState icon={<BookOpen />} title="Nenhum item nesta tabela"
            description="Escolha outra data-base no seletor acima ou atualize a tabela SINAPI." />
        ) : (
          <>
            <Table density="compact" stickyHeader striped containerClassName="max-h-[calc(100vh-280px)]">
              <THead>
                <Tr>
                  <Th width={80}>Código</Th><Th>Descrição</Th>{tipoLista === 'insumo' && <Th width={110}>Classe</Th>}<Th width={48}>Und</Th><Th numeric width={120}>{tipoLista === 'insumo' ? 'Preço (R$)' : 'Custo (R$)'}</Th>
                </Tr>
              </THead>
              <TBody>
                {lista.isLoading && Array.from({ length: 10 }, (_, i) => <Tr key={i}><Td colSpan={5}><Skeleton className="h-3" /></Td></Tr>)}
                {(lista.data?.itens ?? []).map((r) => (
                  <Tr key={r.id} interactive={r.tipo === 'composicao'} onClick={() => r.tipo === 'composicao' && navigate(`${rotas.composicao(r.id)}?db=${db}`)}>
                    <Td mono>{r.codigo}</Td>
                    <Td><span className="flex items-center gap-1.5"><span className="line-clamp-2">{r.descricao}</span>{r.is_demo && <DemoBadge />}</span></Td>
                    {tipoLista === 'insumo' && <Td muted className="text-xs">{r.insumo_tipo ? LABEL_INSUMO_TIPO[r.insumo_tipo] : '—'}</Td>}
                    <Td muted className="text-xs">{r.unidade}</Td>
                    <Td numeric className="font-medium">{formatMoeda(r.preco)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            {lista.data && lista.data.total > 50 && (
              <Pagination className="mt-3" page={pagina} pageSize={50} total={lista.data.total} onChange={setPagina} itemLabel={tipoLista === 'insumo' ? 'insumos' : 'composições'} />
            )}
          </>
        )
      ) : (
        <Table density="compact" stickyHeader striped containerClassName="max-h-[calc(100vh-230px)]">
          <THead>
            <Tr>
              <Th width={92}>Tipo</Th><Th width={64}>Fonte</Th><Th width={80}>Código</Th><Th>Descrição</Th><Th width={110}>Classe</Th><Th width={48}>Und</Th><Th numeric width={110}>Preço (R$)</Th>
            </Tr>
          </THead>
          <TBody>
            {q.isLoading && Array.from({ length: 8 }, (_, i) => <Tr key={i}><Td colSpan={7}><Skeleton className="h-3" /></Td></Tr>)}
            {q.data?.length === 0 && <TableMessage colSpan={7}>Nada encontrado para “{t}” nesta data-base.</TableMessage>}
            {(q.data ?? []).map((r) => (
              <Tr key={`${r.tipo}-${r.id}`} interactive={r.tipo === 'composicao'} onClick={() => r.tipo === 'composicao' && navigate(`${rotas.composicao(r.id)}?db=${db}`)}>
                <Td><Badge variant={r.tipo === 'composicao' ? 'info' : 'neutral'}>{r.tipo === 'composicao' ? 'COMPOSIÇÃO' : 'INSUMO'}</Badge></Td>
                <Td><Badge variant={r.fonte === 'propria' ? 'brand' : 'outline'}>{r.fonte === 'propria' ? 'PRÓPRIA' : 'SINAPI'}</Badge></Td>
                <Td mono>{r.codigo}</Td>
                <Td><span className="flex items-center gap-1.5"><span className="line-clamp-2">{r.descricao}</span>{r.is_demo && <DemoBadge />}</span></Td>
                <Td muted className="text-xs">{r.insumo_tipo ? LABEL_INSUMO_TIPO[r.insumo_tipo] : '—'}</Td>
                <Td muted className="text-xs">{r.unidade}</Td>
                <Td numeric className="font-medium">{formatMoeda(r.preco)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
