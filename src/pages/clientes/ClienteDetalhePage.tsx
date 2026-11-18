import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Building2, Mail, Pencil, Phone, Trash2 } from 'lucide-react';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, LoadingBlock, PageHeader, TBody, THead, Table, Td, Th, Tr, useToast,
} from '@/components/ui';
import { useCliente, useExcluirCliente, useObrasDoCliente } from '@/api/core/clientes';
import { ClienteFormModal } from '@/components/clientes/ClienteFormModal';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { formatCep, formatDataHora, formatDocumento, formatRelativo, formatTelefone } from '@/lib/format';
import { BADGE_OBRA_STATUS, LABEL_OBRA_STATUS, LABEL_PESSOA_TIPO } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';
import { EstadoErro } from '@/pages/_shared/EstadoErro';

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <dt className="font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle">{rotulo}</dt>
      <dd className="text-base text-fg">{children || '—'}</dd>
    </div>
  );
}

/** Detalhe do cliente com as obras vinculadas. Dono: FRONTEND-1. */
export default function ClienteDetalhePage() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const { podeEditar } = useOrganizacao();
  const nav = useNavigate();
  const toast = useToast();
  const q = useCliente(clienteId);
  const obras = useObrasDoCliente(clienteId);
  const excluir = useExcluirCliente();
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data)
    return (
      <>
        <PageHeader title="Cliente" breadcrumbs={[{ label: 'Clientes', to: rotas.clientes }]} />
        <EstadoErro erro={q.error ?? 'Cliente não encontrado.'} onRetry={() => void q.refetch()} />
      </>
    );
  const c = q.data;
  const endereco = [c.logradouro, c.numero, c.complemento].filter(Boolean).join(', ');
  const cidade = [c.bairro, c.municipio && `${c.municipio}${c.uf ? `/${c.uf}` : ''}`].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader
        title={c.nome}
        description={c.nome_fantasia ?? LABEL_PESSOA_TIPO[c.tipo]}
        breadcrumbs={[{ label: 'Cadastros' }, { label: 'Clientes', to: rotas.clientes }, { label: c.nome }]}
        badges={
          <>
            <Badge variant="outline">{c.tipo}</Badge>
            {!c.ativo && <Badge variant="neutral">Inativo</Badge>}
          </>
        }
        actions={
          podeEditar && (
            <>
              <Button variant="ghost" leftIcon={<Trash2 />} onClick={() => setExcluindo(true)}>
                Excluir
              </Button>
              <Button leftIcon={<Pencil />} onClick={() => setEditando(true)}>
                Editar
              </Button>
            </>
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        <Card cornerMarks as="section">
          <div className="mb-1 font-mono text-2xs uppercase tracking-[0.1em] text-fg-subtle">Ficha cadastral</div>
          <dl className="divide-y divide-grid">
            <Item rotulo={c.tipo === 'PF' ? 'CPF' : 'CNPJ'}>
              <span className="num">{formatDocumento(c.documento)}</span>
            </Item>
            {c.tipo === 'PJ' && <Item rotulo="Inscrição estadual">{c.inscricao_estadual}</Item>}
            <Item rotulo="Contato">{c.contato_nome}</Item>
            <Item rotulo="E-mail">
              {c.email && (
                <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                  <Mail className="h-3.5 w-3.5" aria-hidden /> {c.email}
                </a>
              )}
            </Item>
            <Item rotulo="Telefone">
              {c.telefone && (
                <span className="num inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-fg-subtle" aria-hidden /> {formatTelefone(c.telefone)}
                </span>
              )}
            </Item>
            <Item rotulo="Endereço">
              {endereco || cidade ? (
                <>
                  {endereco && <div>{endereco}</div>}
                  {cidade && <div className="text-sm text-fg-muted">{cidade}</div>}
                  {c.cep && <div className="num text-xs text-fg-subtle">CEP {formatCep(c.cep)}</div>}
                </>
              ) : null}
            </Item>
            {c.observacoes && <Item rotulo="Observações">{<span className="whitespace-pre-line text-sm">{c.observacoes}</span>}</Item>}
            <Item rotulo="Atualizado">
              <span className="num text-sm">{formatDataHora(c.updated_at)}</span>
            </Item>
          </dl>
        </Card>
        <Card flush as="section">
          <CardHeader title="Obras do cliente" description="Obras vinculadas a este contratante." />
          {obras.isError ? (
            <div className="p-4">
              <EstadoErro erro={obras.error} onRetry={() => void obras.refetch()} />
            </div>
          ) : obras.isLoading ? (
            <LoadingBlock />
          ) : (obras.data ?? []).length === 0 ? (
            <EmptyState variant="inline" icon={<Building2 />} title="Nenhuma obra vinculada" description="Ao cadastrar uma obra, selecione este cliente." />
          ) : (
            <Table inset>
              <THead>
                <tr>
                  <Th width={110}>Código</Th>
                  <Th>Obra</Th>
                  <Th width={150}>Local</Th>
                  <Th width={130}>Situação</Th>
                  <Th width={110}>Atualizada</Th>
                </tr>
              </THead>
              <TBody>
                {(obras.data ?? []).map((o) => (
                  <Tr key={o.id} interactive onClick={() => nav(rotas.obra(o.id))}>
                    <Td mono>{o.codigo ?? '—'}</Td>
                    <Td>
                      <Link to={rotas.obra(o.id)} className="font-medium hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        {o.nome}
                      </Link>
                    </Td>
                    <Td muted>{o.municipio ? `${o.municipio}/${o.uf}` : o.uf}</Td>
                    <Td>
                      <Badge variant={BADGE_OBRA_STATUS[o.status]} dot>
                        {LABEL_OBRA_STATUS[o.status]}
                      </Badge>
                    </Td>
                    <Td muted className="text-xs">
                      {formatRelativo(o.updated_at)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
      <ClienteFormModal open={editando} cliente={c} onClose={() => setEditando(false)} />
      <ConfirmDialog
        open={excluindo}
        onClose={() => setExcluindo(false)}
        destructive
        loading={excluir.isPending}
        title="Excluir cliente?"
        description={`"${c.nome}" será removido. Obras vinculadas ficam sem cliente.`}
        confirmLabel="Excluir"
        onConfirm={() =>
          excluir.mutate(c.id, {
            onSuccess: () => {
              toast.success('Cliente excluído');
              nav(rotas.clientes, { replace: true });
            },
            onError: (e) => toast.error('Não foi possível excluir', mensagemErro(e)),
          })
        }
      />
    </>
  );
}
