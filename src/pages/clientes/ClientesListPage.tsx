import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building, MoreHorizontal, Pencil, Plus, Search, Trash2, User, UsersRound } from 'lucide-react';
import {
  Badge, Button, ConfirmDialog, DropdownMenu, EmptyState, IconButton, Input, PageHeader, Pagination, Select, Skeleton, TBody, THead, Table,
  TableMessage, Td, Th, Tr, useToast,
} from '@/components/ui';
import { useClientes, useExcluirCliente, type FiltrosClientes } from '@/api/core/clientes';
import { ClienteFormModal } from '@/components/clientes/ClienteFormModal';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { formatDocumento, formatTelefone } from '@/lib/format';
import { mensagemErro } from '@/lib/supabase';
import type { Cliente, PessoaTipo } from '@/types/database';
import { rotas } from '@/routes';
import { EstadoErro } from '@/pages/_shared/EstadoErro';

const PAGE = 50;

/** Lista de clientes com busca, filtros e paginação. Dono: FRONTEND-1. */
export default function ClientesListPage() {
  const { podeEditar } = useOrganizacao();
  const nav = useNavigate();
  const toast = useToast();
  const [texto, setTexto] = useState('');
  const [f, setF] = useState<Required<FiltrosClientes>>({ busca: '', tipo: '', situacao: 'ativos', page: 1, pageSize: PAGE });
  const [editando, setEditando] = useState<Cliente | null | undefined>(undefined);
  const [excluindo, setExcluindo] = useState<Cliente | null>(null);
  const q = useClientes(f);
  const excluir = useExcluirCliente();

  useEffect(() => {
    const t = window.setTimeout(() => setF((x) => (x.busca === texto ? x : { ...x, busca: texto, page: 1 })), 250);
    return () => window.clearTimeout(t);
  }, [texto]);

  const linhas = q.data?.linhas ?? [];
  const total = q.data?.total ?? 0;
  const filtrando = Boolean(f.busca || f.tipo || f.situacao !== 'ativos');

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Contratantes das obras e propostas do escritório."
        breadcrumbs={[{ label: 'Cadastros' }, { label: 'Clientes' }]}
        actions={
          podeEditar && (
            <Button variant="primary" leftIcon={<Plus />} onClick={() => setEditando(null)}>
              Novo cliente
            </Button>
          )
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-full max-w-[320px]">
          <Input prefix={<Search />} placeholder="Buscar por nome, e-mail ou documento" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar clientes" />
        </div>
        <div className="w-44">
          <Select
            aria-label="Tipo de pessoa"
            value={f.tipo}
            onChange={(e) => setF({ ...f, tipo: e.target.value as PessoaTipo | '', page: 1 })}
            options={[
              { value: '', label: 'Todos os tipos' },
              { value: 'PJ', label: 'Pessoa jurídica' },
              { value: 'PF', label: 'Pessoa física' },
            ]}
          />
        </div>
        <div className="w-36">
          <Select
            aria-label="Situação"
            value={f.situacao}
            onChange={(e) => setF({ ...f, situacao: e.target.value as FiltrosClientes['situacao'] & string, page: 1 })}
            options={[
              { value: 'ativos', label: 'Ativos' },
              { value: 'inativos', label: 'Inativos' },
              { value: 'todos', label: 'Todos' },
            ]}
          />
        </div>
        {q.isFetching && !q.isLoading && <span className="text-xs text-fg-subtle">Atualizando…</span>}
      </div>

      {q.isError ? (
        <EstadoErro erro={q.error} onRetry={() => void q.refetch()} />
      ) : !q.isLoading && total === 0 && !filtrando ? (
        <EmptyState
          icon={<UsersRound />}
          title="Nenhum cliente cadastrado"
          description="Cadastre os contratantes para vinculá-los às obras e orçamentos."
          action={
            podeEditar && (
              <Button variant="primary" leftIcon={<Plus />} onClick={() => setEditando(null)}>
                Cadastrar primeiro cliente
              </Button>
            )
          }
        />
      ) : (
        <>
          <Table striped>
            <THead>
              <tr>
                <Th>Nome / razão social</Th>
                <Th width={70}>Tipo</Th>
                <Th width={170}>Documento</Th>
                <Th width={220}>Contato</Th>
                <Th width={180}>Município</Th>
                <Th width={44}>
                  <span className="sr-only">Ações</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {q.isLoading &&
                Array.from({ length: 6 }, (_, i) => (
                  <Tr key={i}>
                    <Td colSpan={6}>
                      <Skeleton className="h-3.5 w-2/3" />
                    </Td>
                  </Tr>
                ))}
              {!q.isLoading && linhas.length === 0 && <TableMessage colSpan={6}>Nenhum cliente encontrado com estes filtros.</TableMessage>}
              {linhas.map((c) => (
                <Tr key={c.id} interactive onClick={() => nav(rotas.cliente(c.id))}>
                  <Td>
                    <a
                      href={rotas.cliente(c.id)}
                      onClick={(e) => {
                        e.preventDefault();
                        nav(rotas.cliente(c.id));
                      }}
                      className="font-medium text-fg hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {c.nome}
                    </a>
                    {c.nome_fantasia && <span className="ml-2 text-xs text-fg-subtle">{c.nome_fantasia}</span>}
                    {!c.ativo && (
                      <Badge variant="outline" className="ml-2">
                        Inativo
                      </Badge>
                    )}
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1 font-mono text-2xs text-fg-muted" title={c.tipo === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}>
                      {c.tipo === 'PF' ? <User className="h-3 w-3" aria-hidden /> : <Building className="h-3 w-3" aria-hidden />}
                      {c.tipo}
                    </span>
                  </Td>
                  <Td mono>{formatDocumento(c.documento)}</Td>
                  <Td truncate title={c.email ?? undefined}>
                    <div className="truncate">{c.contato_nome || c.email || '—'}</div>
                    {c.telefone && <div className="num text-xs text-fg-subtle">{formatTelefone(c.telefone)}</div>}
                  </Td>
                  <Td muted>{c.municipio ? `${c.municipio}${c.uf ? ` · ${c.uf}` : ''}` : '—'}</Td>
                  <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                    {podeEditar && (
                      <DropdownMenu
                        align="end"
                        aria-label={`Ações de ${c.nome}`}
                        trigger={<IconButton size="sm" label="Ações" icon={<MoreHorizontal />} />}
                        items={[
                          { label: 'Editar', icon: <Pencil />, onSelect: () => setEditando(c) },
                          'separator',
                          { label: 'Excluir', icon: <Trash2 />, danger: true, onSelect: () => setExcluindo(c) },
                        ]}
                      />
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pagination className="mt-3" page={f.page} pageSize={PAGE} total={total} onChange={(page) => setF({ ...f, page })} itemLabel="clientes" />
        </>
      )}

      <ClienteFormModal open={editando !== undefined} cliente={editando} onClose={() => setEditando(undefined)} />
      <ConfirmDialog
        open={Boolean(excluindo)}
        onClose={() => setExcluindo(null)}
        destructive
        loading={excluir.isPending}
        title="Excluir cliente?"
        description={`"${excluindo?.nome}" será removido. Obras vinculadas ficam sem cliente. Para manter o histórico, prefira marcar como inativo.`}
        confirmLabel="Excluir"
        onConfirm={() =>
          excluindo &&
          excluir.mutate(excluindo.id, {
            onSuccess: () => {
              toast.success('Cliente excluído');
              setExcluindo(null);
            },
            onError: (e) => toast.error('Não foi possível excluir', mensagemErro(e)),
          })
        }
      />
    </>
  );
}
