import { useMemo, useState } from 'react';
import { Ban, Building2, CheckCircle2, MoreHorizontal, Search, UserPlus, Users } from 'lucide-react';
import {
  Avatar, Badge, Button, Combobox, ConfirmDialog, Drawer, DropdownMenu, EmptyState, Field, IconButton, Input, LoadingBlock, Select, Skeleton,
  TBody, THead, Table, TableMessage, Td, Th, Tr, useToast,
} from '@/components/ui';
import { useAdminAdicionarMembro, useAdminOrganizacoes, useAdminUsuarios, useDefinirStatusOrganizacao, type OrganizacaoAdmin } from '@/api/core/admin';
import { useMembros } from '@/api/core/organizacao';
import { BADGE_ORG_STATUS, LABEL_ORG_STATUS } from '@/components/admin/rotulos';
import { formatData, formatDocumento, formatRelativo } from '@/lib/format';
import { LABEL_ORG_ROLE, opcoes } from '@/lib/labels';
import { normalizarTexto } from '@/lib/sinapi/parser';
import { mensagemErro } from '@/lib/supabase';
import type { OrgRole, UsuarioAdmin } from '@/types/database';
import { EstadoErro } from '@/pages/_shared/EstadoErro';

function MembrosDrawer({ org, onClose }: { org: OrganizacaoAdmin | null; onClose: () => void }) {
  const membros = useMembros(org?.id ?? '');
  const adicionar = useAdminAdicionarMembro();
  const toast = useToast();
  const [termo, setTermo] = useState('');
  const [usuario, setUsuario] = useState<UsuarioAdmin | null>(null);
  const [papel, setPapel] = useState<OrgRole>('editor');
  const busca = useAdminUsuarios({ busca: termo, status: 'active', page: 1, pageSize: 10 });

  return (
    <Drawer
      open={Boolean(org)}
      onClose={onClose}
      eyebrow="Organização"
      title={org?.nome}
      description="Membros e papéis. Como administrador, você pode incluir qualquer usuário ativo."
      width={520}
    >
      <section className="corner-marks mb-5 rounded-sm border border-border bg-surface-2 p-3">
        <div className="mb-2 font-mono text-2xs uppercase tracking-[0.1em] text-fg-subtle">Adicionar membro</div>
        <div className="flex flex-col gap-2">
          <Field label="Usuário">
            {(p) => (
              <Combobox<UsuarioAdmin>
                {...p}
                value={usuario}
                onChange={setUsuario}
                onSearch={setTermo}
                items={busca.data?.linhas ?? []}
                loading={busca.isFetching}
                getKey={(u) => u.id}
                getLabel={(u) => `${u.nome || u.email} <${u.email}>`}
                placeholder="Buscar por nome ou e-mail"
                renderItem={(u) => (
                  <span className="flex items-center gap-2">
                    <Avatar name={u.nome || u.email} size="xs" />
                    <span className="truncate">{u.nome || '—'}</span>
                    <span className="ml-auto truncate text-xs text-fg-subtle">{u.email}</span>
                  </span>
                )}
              />
            )}
          </Field>
          <div className="flex items-end gap-2">
            <Field label="Papel" className="flex-1">
              {(p) => <Select {...p} value={papel} onChange={(e) => setPapel(e.target.value as OrgRole)} options={opcoes(LABEL_ORG_ROLE)} />}
            </Field>
            <Button
              variant="primary"
              leftIcon={<UserPlus />}
              disabled={!usuario || !org}
              loading={adicionar.isPending}
              onClick={() =>
                usuario &&
                org &&
                adicionar.mutate(
                  { orgId: org.id, userId: usuario.id, papel },
                  {
                    onSuccess: () => {
                      toast.success('Membro adicionado', `${usuario.email} → ${org.nome}`);
                      setUsuario(null);
                    },
                    onError: (e) => toast.error('Não foi possível adicionar', mensagemErro(e)),
                  },
                )
              }
            >
              Adicionar
            </Button>
          </div>
        </div>
      </section>

      <div className="mb-2 font-mono text-2xs uppercase tracking-[0.1em] text-fg-subtle">Membros ({membros.data?.length ?? 0})</div>
      {membros.isLoading ? (
        <LoadingBlock />
      ) : membros.isError ? (
        <EstadoErro erro={membros.error} />
      ) : (
        <ul className="divide-y divide-grid rounded-sm border border-border">
          {(membros.data ?? []).map((m) => (
            <li key={m.user_id} className="flex items-center gap-2.5 px-3 py-2">
              <Avatar name={m.nome || m.email} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-medium">{m.nome || '—'}</div>
                <div className="truncate text-xs text-fg-subtle">{m.email}</div>
              </div>
              <Badge variant={m.papel === 'owner' ? 'brand' : 'outline'}>{LABEL_ORG_ROLE[m.papel]}</Badge>
            </li>
          ))}
          {(membros.data ?? []).length === 0 && <li className="px-3 py-4 text-center text-sm text-fg-muted">Sem membros.</li>}
        </ul>
      )}
    </Drawer>
  );
}

/** Organizações: status, membros, adicionar membro. Dono: FRONTEND-1. */
export default function AdminOrganizacoesPage() {
  const q = useAdminOrganizacoes();
  const definir = useDefinirStatusOrganizacao();
  const toast = useToast();
  const [texto, setTexto] = useState('');
  const [aberta, setAberta] = useState<OrganizacaoAdmin | null>(null);
  const [alterando, setAlterando] = useState<OrganizacaoAdmin | null>(null);

  const linhas = useMemo(() => {
    const t = normalizarTexto(texto);
    const todas = q.data ?? [];
    return t ? todas.filter((o) => normalizarTexto(`${o.nome} ${o.razao_social ?? ''} ${o.cnpj ?? ''} ${o.municipio ?? ''}`).includes(t)) : todas;
  }, [q.data, texto]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="w-full max-w-[320px]">
          <Input prefix={<Search />} placeholder="Buscar organização" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar organizações" />
        </div>
        <span className="text-xs text-fg-subtle">
          <span className="num text-fg">{linhas.length}</span> organizações
        </span>
      </div>
      {q.isError ? (
        <EstadoErro erro={q.error} onRetry={() => void q.refetch()} />
      ) : !q.isLoading && (q.data ?? []).length === 0 ? (
        <EmptyState icon={<Building2 />} title="Nenhuma organização" description="As organizações são criadas pelos usuários no primeiro acesso." />
      ) : (
        <Table striped>
          <THead>
            <tr>
              <Th>Organização</Th>
              <Th width={170}>CNPJ</Th>
              <Th width={170}>Município</Th>
              <Th numeric width={90}>
                Membros
              </Th>
              <Th width={110}>Situação</Th>
              <Th width={110}>Criada</Th>
              <Th width={110}>
                <span className="sr-only">Ações</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            {q.isLoading &&
              Array.from({ length: 5 }, (_, i) => (
                <Tr key={i}>
                  <Td colSpan={7}>
                    <Skeleton className="h-4 w-1/2" />
                  </Td>
                </Tr>
              ))}
            {!q.isLoading && linhas.length === 0 && <TableMessage colSpan={7}>Nenhuma organização encontrada.</TableMessage>}
            {linhas.map((o) => (
              <Tr key={o.id}>
                <Td>
                  <div className="flex items-center gap-2.5 py-0.5">
                    <Avatar square size="sm" name={o.nome} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{o.nome}</div>
                      {o.razao_social && <div className="truncate text-xs text-fg-subtle">{o.razao_social}</div>}
                    </div>
                  </div>
                </Td>
                <Td mono>{formatDocumento(o.cnpj)}</Td>
                <Td muted>{o.municipio ? `${o.municipio}${o.uf ? `/${o.uf}` : ''}` : '—'}</Td>
                <Td numeric>{o.membros?.[0]?.count ?? 0}</Td>
                <Td>
                  <Badge variant={BADGE_ORG_STATUS[o.status]} dot>
                    {LABEL_ORG_STATUS[o.status]}
                  </Badge>
                </Td>
                <Td className="num text-xs" title={formatRelativo(o.created_at)}>
                  {formatData(o.created_at.slice(0, 10))}
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" leftIcon={<Users />} onClick={() => setAberta(o)}>
                      Membros
                    </Button>
                    <DropdownMenu
                      align="end"
                      aria-label={`Ações de ${o.nome}`}
                      trigger={<IconButton size="sm" label="Mais ações" icon={<MoreHorizontal />} />}
                      items={[
                        o.status === 'ativa'
                          ? { label: 'Bloquear organização', icon: <Ban />, danger: true, onSelect: () => setAlterando(o) }
                          : { label: 'Reativar organização', icon: <CheckCircle2 />, onSelect: () => setAlterando(o) },
                      ]}
                    />
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <MembrosDrawer org={aberta} onClose={() => setAberta(null)} />
      <ConfirmDialog
        open={Boolean(alterando)}
        onClose={() => setAlterando(null)}
        loading={definir.isPending}
        destructive={alterando?.status === 'ativa'}
        title={alterando?.status === 'ativa' ? 'Bloquear organização?' : 'Reativar organização?'}
        description={
          alterando?.status === 'ativa'
            ? `Os membros de "${alterando.nome}" passam a ter acesso somente leitura.`
            : `Os membros de "${alterando?.nome}" voltam a poder editar os dados.`
        }
        confirmLabel={alterando?.status === 'ativa' ? 'Bloquear' : 'Reativar'}
        onConfirm={() =>
          alterando &&
          definir.mutate(
            { orgId: alterando.id, status: alterando.status === 'ativa' ? 'bloqueada' : 'ativa' },
            {
              onSuccess: () => {
                toast.success('Situação da organização alterada', alterando.nome);
                setAlterando(null);
              },
              onError: (e) => toast.error('Não foi possível alterar', mensagemErro(e)),
            },
          )
        }
      />
    </div>
  );
}
