import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, PencilRuler, Plus, Search, Trash2 } from 'lucide-react';
import { useExcluirHonorario, useHonorarios, type HonorarioLista } from '@/api/orcamento/analises';
import { NovoHonorarioModal } from '@/components/honorarios/NovoHonorarioModal';
import { ErroCarregamento } from '@/components/orcamento/comum';
import {
  Badge, Button, ConfirmDialog, DropdownMenu, EmptyState, IconButton, Input, PageHeader, Select, Skeleton, TBody, TFoot, THead, Table, TableMessage, Td, Th, Tr, useToast,
} from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { somaMoeda } from '@/lib/calc';
import { formatNumero, formatRelativo } from '@/lib/format';
import { LABEL_HONORARIO_STATUS, opcoes } from '@/lib/labels';
import { BADGE_HONORARIO_STATUS } from '@/lib/labels-orcamento';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';
import type { HonorarioStatus } from '@/types/database';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Propostas de honorários de projeto. Dono: FRONTEND-2. */
export default function HonorariosListPage() {
  const { podeEditar } = useOrganizacao();
  const navigate = useNavigate();
  const toast = useToast();
  const q = useHonorarios();
  const excluir = useExcluirHonorario();
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<HonorarioStatus | ''>('');
  const [novo, setNovo] = useState(false);
  const [aExcluir, setAExcluir] = useState<HonorarioLista | null>(null);
  const lista = useMemo(() => {
    const t = semAcento(busca.trim());
    return (q.data ?? []).filter((h) => (!status || h.status === status) && (!t || semAcento(`${h.nome} ${h.obra?.nome ?? ''}`).includes(t)));
  }, [q.data, busca, status]);

  return (
    <>
      <PageHeader title="Honorários de projeto" description="Propostas por disciplina — arquitetura, estrutura, instalações, legalização — com área, % da obra, horas ou valor fixo."
        actions={podeEditar && <Button variant="primary" leftIcon={<Plus />} onClick={() => setNovo(true)}>Nova proposta</Button>} />
      {q.isError ? <ErroCarregamento erro={q.error} onRetry={() => void q.refetch()} /> : q.data?.length === 0 ? (
        <EmptyState icon={<PencilRuler />} title="Nenhuma proposta de honorários" description="Monte a proposta de projeto com as disciplinas contratadas e emita para o cliente."
          action={podeEditar && <Button variant="primary" leftIcon={<Plus />} onClick={() => setNovo(true)}>Criar proposta</Button>} />
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <div className="w-80"><Input size="sm" prefix={<Search />} placeholder="Buscar proposta ou obra…" aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
            <div className="w-40"><Select size="sm" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as HonorarioStatus | '')} placeholder="Todos os status" options={opcoes(LABEL_HONORARIO_STATUS)} /></div>
          </div>
          <Table stickyHeader>
            <THead><Tr><Th>Proposta</Th><Th>Obra</Th><Th width={110}>Status</Th><Th numeric width={100}>Área (m²)</Th><Th numeric width={130}>Subtotal (R$)</Th><Th numeric width={130}>Total (R$)</Th><Th numeric width={100}>Atualizada</Th><Th width={36} /></Tr></THead>
            <TBody>
              {q.isLoading && Array.from({ length: 4 }, (_, i) => <Tr key={i}><Td colSpan={8}><Skeleton className="h-3" /></Td></Tr>)}
              {q.data && lista.length === 0 && <TableMessage colSpan={8}>Nada encontrado.</TableMessage>}
              {lista.map((h) => (
                <Tr key={h.id} interactive onClick={() => navigate(rotas.honorario(h.id))}>
                  <Td className="font-medium">{h.nome}</Td>
                  <Td muted>{h.obra?.nome ?? '—'}</Td>
                  <Td><Badge variant={BADGE_HONORARIO_STATUS[h.status]} dot>{LABEL_HONORARIO_STATUS[h.status]}</Badge></Td>
                  <Td numeric>{formatNumero(h.area_m2)}</Td>
                  <Td numeric muted>{formatNumero(h.subtotal)}</Td>
                  <Td numeric className="font-medium">{formatNumero(h.total)}</Td>
                  <Td numeric muted className="text-xs">{formatRelativo(h.updated_at)}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    {podeEditar && <DropdownMenu align="end" aria-label={`Ações de ${h.nome}`} trigger={<IconButton size="sm" label="Ações" icon={<MoreHorizontal />} />}
                      items={[{ label: 'Excluir', icon: <Trash2 />, danger: true, onSelect: () => setAExcluir(h) }]} />}
                  </Td>
                </Tr>
              ))}
            </TBody>
            {lista.length > 0 && <TFoot><Tr><Td colSpan={5} className="text-right">Total das propostas filtradas</Td><Td numeric>{formatNumero(somaMoeda(lista.map((h) => h.total)))}</Td><Td colSpan={2} /></Tr></TFoot>}
          </Table>
        </>
      )}
      <NovoHonorarioModal open={novo} onClose={() => setNovo(false)} />
      <ConfirmDialog open={aExcluir !== null} onClose={() => setAExcluir(null)} destructive loading={excluir.isPending} title="Excluir proposta?" description={aExcluir?.nome} confirmLabel="Excluir"
        onConfirm={() => aExcluir && excluir.mutate(aExcluir.id, { onSuccess: () => setAExcluir(null), onError: (e) => toast.error('Não foi possível excluir', mensagemErro(e)) })} />
    </>
  );
}
