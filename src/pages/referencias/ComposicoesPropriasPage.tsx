import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Layers, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useComposicoesProprias, useExcluirComposicaoPropria } from '@/api/orcamento/referencias';
import { ErroCarregamento } from '@/components/orcamento/comum';
import {
  Badge, Button, ConfirmDialog, DropdownMenu, EmptyState, IconButton, Input, PageHeader, Skeleton, TBody, THead, Table, TableMessage, Td, Th, Tr, useToast,
} from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { formatRelativo } from '@/lib/format';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';
import type { Composicao } from '@/types/database';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Composições próprias da organização. Dono: FRONTEND-2. */
export default function ComposicoesPropriasPage() {
  const { podeEditar } = useOrganizacao();
  const navigate = useNavigate();
  const toast = useToast();
  const q = useComposicoesProprias();
  const excluir = useExcluirComposicaoPropria();
  const [busca, setBusca] = useState('');
  const [aExcluir, setAExcluir] = useState<Composicao | null>(null);
  const lista = useMemo(() => {
    const t = semAcento(busca.trim());
    return (q.data ?? []).filter((c) => !t || semAcento(`${c.codigo} ${c.descricao} ${c.grupo ?? ''}`).includes(t));
  }, [q.data, busca]);

  return (
    <>
      <PageHeader title="Composições próprias" description="Serviços do escritório montados com insumos e composições SINAPI ou próprios."
        actions={podeEditar && <Button variant="primary" leftIcon={<Plus />} onClick={() => navigate(rotas.composicaoPropriaNova)}>Nova composição</Button>} />
      {q.isError ? <ErroCarregamento erro={q.error} onRetry={() => void q.refetch()} /> : q.data?.length === 0 ? (
        <EmptyState icon={<Layers />} title="Nenhuma composição própria" description="Crie composições para serviços sem referência SINAPI ou com produtividade própria."
          action={podeEditar && <Button variant="primary" leftIcon={<Plus />} onClick={() => navigate(rotas.composicaoPropriaNova)}>Criar composição</Button>} />
      ) : (
        <>
          <div className="mb-3 w-80"><Input size="sm" prefix={<Search />} placeholder="Buscar código, descrição ou grupo…" aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <Table stickyHeader containerClassName="max-h-[calc(100vh-230px)]">
            <THead><Tr><Th width={110}>Código</Th><Th>Descrição</Th><Th width={56}>Und</Th><Th width={160}>Grupo</Th><Th width={80}>Situação</Th><Th numeric width={100}>Atualizada</Th><Th width={36} /></Tr></THead>
            <TBody>
              {q.isLoading && Array.from({ length: 5 }, (_, i) => <Tr key={i}><Td colSpan={7}><Skeleton className="h-3" /></Td></Tr>)}
              {q.data && lista.length === 0 && <TableMessage colSpan={7}>Nada encontrado.</TableMessage>}
              {lista.map((c) => (
                <Tr key={c.id} interactive onClick={() => navigate(podeEditar ? rotas.composicaoPropria(c.id) : rotas.composicao(c.id))}>
                  <Td mono>{c.codigo}</Td>
                  <Td><span className="line-clamp-2">{c.descricao}</span></Td>
                  <Td muted className="text-xs">{c.unidade}</Td>
                  <Td muted className="text-xs">{c.grupo ?? '—'}</Td>
                  <Td><Badge variant={c.ativo ? 'success' : 'neutral'} dot>{c.ativo ? 'Ativa' : 'Inativa'}</Badge></Td>
                  <Td numeric muted className="text-xs">{formatRelativo(c.updated_at)}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu align="end" aria-label={`Ações de ${c.codigo}`} trigger={<IconButton size="sm" label="Ações" icon={<MoreHorizontal />} />}
                      items={[
                        { label: 'Ver analítico', icon: <Eye />, onSelect: () => navigate(rotas.composicao(c.id)) },
                        { label: 'Editar', icon: <Pencil />, disabled: !podeEditar, onSelect: () => navigate(rotas.composicaoPropria(c.id)) },
                        'separator',
                        { label: 'Excluir', icon: <Trash2 />, danger: true, disabled: !podeEditar, onSelect: () => setAExcluir(c) },
                      ]} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </>
      )}
      <ConfirmDialog open={aExcluir !== null} onClose={() => setAExcluir(null)} destructive loading={excluir.isPending} title={`Excluir ${aExcluir?.codigo}?`}
        description="Composições em uso por orçamentos ou outras composições não podem ser excluídas — desative-as." confirmLabel="Excluir"
        onConfirm={() => aExcluir && excluir.mutate(aExcluir.id, { onSuccess: () => setAExcluir(null), onError: (e) => toast.error('Não foi possível excluir', mensagemErro(e)) })} />
    </>
  );
}
