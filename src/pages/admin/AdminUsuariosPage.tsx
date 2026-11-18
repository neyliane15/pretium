import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Ban, Check, MoreHorizontal, Search, ShieldCheck, ShieldOff, UserCheck, Users } from 'lucide-react';
import {
  Avatar, Badge, Button, ConfirmDialog, DropdownMenu, Field, IconButton, Input, Modal, Pagination, Skeleton, TBody, THead, Table, TableMessage,
  Tabs, Td, Textarea, Th, Tooltip, Tr, useToast, type DropdownMenuEntry,
} from '@/components/ui';
import { useAdminUsuarios, useDefinirPapelGlobal, useDefinirStatusUsuario } from '@/api/core/admin';
import { useAuth } from '@/contexts/AuthContext';
import { formatData, formatRelativo } from '@/lib/format';
import { BADGE_USER_STATUS, LABEL_ORG_ROLE, LABEL_USER_STATUS } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import type { UserStatus, UsuarioAdmin } from '@/types/database';
import { EstadoErro } from '@/pages/_shared/EstadoErro';

const PAGE = 25;
type Filtro = UserStatus | '';

/** Usuários: aprovar, bloquear, papel global, busca, filtros, paginação. Dono: FRONTEND-1. */
export default function AdminUsuariosPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = (['pending', 'active', 'blocked'].includes(params.get('status') ?? '') ? params.get('status') : '') as Filtro;
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');
  const [page, setPage] = useState(1);
  const [bloqueando, setBloqueando] = useState<UsuarioAdmin | null>(null);
  const [motivo, setMotivo] = useState('');
  const [papel, setPapel] = useState<UsuarioAdmin | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setBusca(texto);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [texto]);

  const q = useAdminUsuarios({ busca, status, page, pageSize: PAGE });
  const definirStatus = useDefinirStatusUsuario();
  const definirPapel = useDefinirPapelGlobal();
  const linhas = q.data?.linhas ?? [];

  const setStatus = (u: UsuarioAdmin, s: UserStatus, m?: string | null) =>
    definirStatus.mutate(
      { userId: u.id, status: s, motivo: m },
      {
        onSuccess: () => {
          toast.success(s === 'active' ? (u.status === 'pending' ? 'Usuário aprovado' : 'Usuário reativado') : 'Usuário bloqueado', u.email);
          setBloqueando(null);
          setMotivo('');
        },
        onError: (e) => toast.error('Não foi possível alterar a situação', mensagemErro(e)),
      },
    );

  const acoes = (u: UsuarioAdmin): DropdownMenuEntry[] => {
    const eu = u.id === user?.id;
    return [
      ...(u.status !== 'active' ? [{ label: u.status === 'pending' ? 'Aprovar acesso' : 'Reativar conta', icon: <UserCheck />, onSelect: () => setStatus(u, 'active') }] : []),
      ...(u.status !== 'blocked' ? [{ label: 'Bloquear…', icon: <Ban />, danger: true, disabled: eu, onSelect: () => setBloqueando(u) }] : []),
      'separator' as const,
      u.papel_global === 'admin'
        ? { label: 'Remover administrador', icon: <ShieldOff />, disabled: eu, onSelect: () => setPapel(u) }
        : { label: 'Tornar administrador', icon: <ShieldCheck />, disabled: u.status !== 'active', onSelect: () => setPapel(u) },
    ];
  };

  const mudarFiltro = (s: Filtro) => {
    setPage(1);
    setParams(s ? { status: s } : {}, { replace: true });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs<Filtro>
          aria-label="Filtrar por situação"
          variant="segmented"
          value={status}
          onChange={mudarFiltro}
          items={[
            { value: '', label: 'Todos' },
            { value: 'pending', label: 'Pendentes' },
            { value: 'active', label: 'Ativos' },
            { value: 'blocked', label: 'Bloqueados' },
          ]}
        />
        <div className="w-full max-w-[320px]">
          <Input prefix={<Search />} placeholder="Buscar por nome ou e-mail" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar usuários" />
        </div>
      </div>

      {q.isError ? (
        <EstadoErro erro={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Table striped>
            <THead>
              <tr>
                <Th>Usuário</Th>
                <Th width={110}>Situação</Th>
                <Th width={120}>Papel global</Th>
                <Th>Organizações</Th>
                <Th width={110}>Cadastro</Th>
                <Th width={120}>Último acesso</Th>
                <Th width={150}>
                  <span className="sr-only">Ações</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {q.isLoading &&
                Array.from({ length: 6 }, (_, i) => (
                  <Tr key={i}>
                    <Td colSpan={7}>
                      <Skeleton className="h-4 w-1/2" />
                    </Td>
                  </Tr>
                ))}
              {!q.isLoading && linhas.length === 0 && (
                <TableMessage colSpan={7}>
                  <span className="inline-flex items-center gap-2">
                    <Users className="h-4 w-4 text-fg-subtle" aria-hidden /> Nenhum usuário encontrado.
                  </span>
                </TableMessage>
              )}
              {linhas.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <div className="flex items-center gap-2.5 py-0.5">
                      <Avatar name={u.nome || u.email} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {u.nome || '—'} {u.id === user?.id && <span className="text-xs font-normal text-fg-subtle">(você)</span>}
                        </div>
                        <div className="truncate text-xs text-fg-subtle">{u.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    {u.status === 'blocked' && u.motivo_bloqueio ? (
                      <Tooltip content={`Motivo: ${u.motivo_bloqueio}`}>
                        <span tabIndex={0} className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <Badge variant={BADGE_USER_STATUS[u.status]} dot>
                            {LABEL_USER_STATUS[u.status]}
                          </Badge>
                        </span>
                      </Tooltip>
                    ) : (
                      <Badge variant={BADGE_USER_STATUS[u.status]} dot>
                        {LABEL_USER_STATUS[u.status]}
                      </Badge>
                    )}
                  </Td>
                  <Td>{u.papel_global === 'admin' ? <Badge variant="brand">Administrador</Badge> : <span className="text-fg-muted">Usuário</span>}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {(u.organizacoes ?? []).length === 0 && <span className="text-xs text-fg-subtle">—</span>}
                      {(u.organizacoes ?? []).slice(0, 3).map((o) => (
                        <Badge key={o.id} variant="outline" title={LABEL_ORG_ROLE[o.papel]}>
                          {o.nome}
                        </Badge>
                      ))}
                      {(u.organizacoes ?? []).length > 3 && <Badge variant="neutral">+{u.organizacoes.length - 3}</Badge>}
                    </div>
                  </Td>
                  <Td className="num text-xs">{formatData(u.created_at.slice(0, 10))}</Td>
                  <Td muted className="text-xs">
                    {formatRelativo(u.ultimo_acesso_em)}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {u.status === 'pending' && (
                        <Button size="sm" leftIcon={<Check className="text-success" />} loading={definirStatus.isPending && definirStatus.variables?.userId === u.id} onClick={() => setStatus(u, 'active')}>
                          Aprovar
                        </Button>
                      )}
                      <DropdownMenu align="end" aria-label={`Ações de ${u.email}`} items={acoes(u)} trigger={<IconButton size="sm" label="Mais ações" icon={<MoreHorizontal />} />} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={PAGE} total={q.data?.total ?? 0} onChange={setPage} itemLabel="usuários" />
        </>
      )}

      <Modal
        open={Boolean(bloqueando)}
        onClose={() => setBloqueando(null)}
        size="sm"
        title="Bloquear usuário"
        description={bloqueando?.email}
        dismissable={!definirStatus.isPending}
        footer={
          <>
            <Button onClick={() => setBloqueando(null)}>Cancelar</Button>
            <Button variant="danger" leftIcon={<Ban />} loading={definirStatus.isPending} onClick={() => bloqueando && setStatus(bloqueando, 'blocked', motivo.trim() || null)}>
              Bloquear
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-fg-muted">O usuário perde o acesso imediatamente e verá o motivo ao tentar entrar.</p>
        <Field label="Motivo" hint="Opcional, exibido ao usuário.">
          {(p) => <Textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} data-autofocus />}
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(papel)}
        onClose={() => setPapel(null)}
        loading={definirPapel.isPending}
        destructive={papel?.papel_global === 'admin'}
        title={papel?.papel_global === 'admin' ? 'Remover acesso de administrador?' : 'Tornar administrador global?'}
        description={
          papel?.papel_global === 'admin'
            ? `${papel.email} deixará de ver o painel administrativo.`
            : `${papel?.email} poderá ver e alterar dados de todas as organizações, aprovar usuários e importar tabelas SINAPI.`
        }
        confirmLabel={papel?.papel_global === 'admin' ? 'Remover' : 'Promover'}
        onConfirm={() =>
          papel &&
          definirPapel.mutate(
            { userId: papel.id, papel: papel.papel_global === 'admin' ? 'user' : 'admin' },
            {
              onSuccess: () => {
                toast.success('Papel global alterado', papel.email);
                setPapel(null);
              },
              onError: (e) => toast.error('Não foi possível alterar o papel', mensagemErro(e)),
            },
          )
        }
      />
    </div>
  );
}
