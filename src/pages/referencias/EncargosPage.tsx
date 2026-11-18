import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, HardHat } from 'lucide-react';
import { useDuplicarEncargos, useEncargos } from '@/api/orcamento/referencias';
import { ErroCarregamento } from '@/components/orcamento/comum';
import { Badge, Button, DemoBadge, EmptyState, Field, Input, Modal, PageHeader, Skeleton, TBody, THead, Table, Td, Th, Tr, useToast } from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { formatData, formatPercent } from '@/lib/format';
import { LABEL_REGIME } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';
import type { EncargosSociais } from '@/types/database';

/** Tabelas de encargos sociais: referências globais (somente leitura) e da organização. Dono: FRONTEND-2. */
export default function EncargosPage() {
  const { podeEditar } = useOrganizacao();
  const navigate = useNavigate();
  const toast = useToast();
  const q = useEncargos();
  const duplicar = useDuplicarEncargos();
  const [copiar, setCopiar] = useState<{ base: EncargosSociais; nome: string } | null>(null);

  const onCopiar = async () => {
    if (!copiar?.nome.trim()) return;
    try {
      const id = await duplicar.mutateAsync({ encargosId: copiar.base.id, nome: copiar.nome.trim() });
      setCopiar(null);
      toast.success('Tabela copiada para a organização');
      navigate(rotas.encargosDetalhe(id));
    } catch (e) {
      toast.error('Não foi possível copiar', mensagemErro(e));
    }
  };

  const grupos = [
    { titulo: 'Da organização', itens: (q.data ?? []).filter((e) => e.organizacao_id) },
    { titulo: 'Referências (somente leitura)', itens: (q.data ?? []).filter((e) => !e.organizacao_id) },
  ];

  return (
    <>
      <PageHeader title="Encargos sociais" description="Percentuais sobre a mão de obra (horista e mensalista), grupos A a D. Copie uma referência para ajustá-la à sua realidade." />
      {q.isError ? <ErroCarregamento erro={q.error} onRetry={() => void q.refetch()} /> : q.data?.length === 0 ? (
        <EmptyState icon={<HardHat />} title="Nenhuma tabela de encargos" description="O administrador pode cadastrar tabelas de referência (SINAPI) para todas as organizações." />
      ) : (
        <Table stickyHeader>
          <THead><Tr><Th>Tabela</Th><Th width={50}>UF</Th><Th width={130}>Regime</Th><Th numeric width={90}>Vigência</Th><Th numeric width={100}>Horista</Th><Th numeric width={110}>Mensalista</Th><Th width={110} /></Tr></THead>
          <TBody>
            {q.isLoading && Array.from({ length: 3 }, (_, i) => <Tr key={i}><Td colSpan={7}><Skeleton className="h-3" /></Td></Tr>)}
            {grupos.map((g) => g.itens.length > 0 && [
              <Tr key={g.titulo} group={2}><Td colSpan={7} className="font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle">{g.titulo}</Td></Tr>,
              ...g.itens.map((e) => (
                <Tr key={e.id} interactive onClick={() => navigate(rotas.encargosDetalhe(e.id))}>
                  <Td className="font-medium"><span className="flex items-center gap-1.5">{e.nome}{e.is_demo && <DemoBadge />}{!e.organizacao_id && <Badge variant="outline">Referência</Badge>}</span></Td>
                  <Td mono>{e.uf ?? '—'}</Td>
                  <Td muted>{LABEL_REGIME[e.regime]}</Td>
                  <Td numeric muted>{formatData(e.vigencia)}</Td>
                  <Td numeric className="font-medium">{formatPercent(e.total_horista)}</Td>
                  <Td numeric>{formatPercent(e.total_mensalista)}</Td>
                  <Td onClick={(ev) => ev.stopPropagation()}>{podeEditar && <Button size="sm" variant="ghost" leftIcon={<Copy />} onClick={() => setCopiar({ base: e, nome: `${e.nome} (cópia)` })}>Copiar</Button>}</Td>
                </Tr>
              )),
            ])}
          </TBody>
        </Table>
      )}
      <Modal open={copiar !== null} onClose={() => setCopiar(null)} size="sm" title="Copiar para a organização" description={copiar?.base.nome}
        footer={<><Button onClick={() => setCopiar(null)}>Cancelar</Button><Button variant="primary" loading={duplicar.isPending} onClick={() => void onCopiar()}>Copiar</Button></>}>
        <Field label="Nome da nova tabela">{(p) => <Input {...p} data-autofocus value={copiar?.nome ?? ''} onChange={(e) => copiar && setCopiar({ ...copiar, nome: e.target.value })} />}</Field>
      </Modal>
    </>
  );
}
