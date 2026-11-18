import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, LogOut, MailPlus, MoreHorizontal, Send, ShieldCheck, Trash2, UserMinus, Users } from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, DropdownMenu, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select,
  Skeleton, TBody, THead, Table, TableMessage, Td, Th, Tooltip, Tr, useToast, type DropdownMenuEntry,
} from '@/components/ui';
import { useConvidarMembro, useConvites, useMembros, useAlterarPapelMembro, useRemoverMembro, useRevogarConvite } from '@/api/core/organizacao';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { formatData, formatRelativo } from '@/lib/format';
import { LABEL_ORG_ROLE, opcoes } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import { conviteSchema, type ConviteForm } from '@/schemas/core';
import type { MembroListado, OrgRole } from '@/types/database';
import { rotas } from '@/routes';
import { EstadoErro } from '@/pages/_shared/EstadoErro';

const BADGE_PAPEL: Record<OrgRole, 'brand' | 'info' | 'neutral'> = { owner: 'brand', editor: 'info', viewer: 'neutral' };
const DESC_PAPEL: Record<OrgRole, string> = {
  owner: 'Tudo, inclusive equipe, convites e dados do escritório.',
  editor: 'Cria e edita clientes, obras, orçamentos e referências próprias.',
  viewer: 'Somente leitura, impressão e exportação.',
};

function ConvidarModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const convidar = useConvidarMembro();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ConviteForm>({ resolver: zodResolver(conviteSchema), defaultValues: { email: '', papel: 'editor' } });
  const papel = watch('papel');

  const fechar = () => {
    reset();
    convidar.reset();
    onClose();
  };

  const onSubmit = handleSubmit((d) =>
    convidar.mutate(d, {
      onSuccess: () => {
        toast.success('Convite criado', d.email);
      },
      onError: (e) => toast.error('Não foi possível convidar', mensagemErro(e)),
    }),
  );

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Convidar para a equipe"
      description="A pessoa recebe acesso ao aceitar o convite com o mesmo e-mail."
      footer={
        <>
          <Button onClick={fechar}>{convidar.isSuccess ? 'Fechar' : 'Cancelar'}</Button>
          {!convidar.isSuccess && (
            <Button variant="primary" leftIcon={<Send />} loading={convidar.isPending} onClick={() => void onSubmit()}>
              Criar convite
            </Button>
          )}
        </>
      }
    >
      {convidar.isSuccess ? (
        <div className="flex flex-col gap-3">
          <Alert variant="success" title="Convite criado">
            Compartilhe o link abaixo com a pessoa convidada. Ele também aparece para ela ao entrar no Pretium com este e-mail.
          </Alert>
          <ConviteLink conviteId={convidar.data} />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
          <Field label="E-mail" required error={errors.email?.message}>
            {(p) => <Input {...p} {...register('email')} type="email" autoFocus placeholder="colega@escritorio.com.br" />}
          </Field>
          <Field label="Papel" hint={DESC_PAPEL[papel]}>
            {(p) => <Select {...p} {...register('papel')} options={opcoes(LABEL_ORG_ROLE)} />}
          </Field>
        </form>
      )}
    </Modal>
  );
}

/** Link copiável do convite (o token vem da lista de convites). */
function ConviteLink({ conviteId }: { conviteId?: string }) {
  const { data: convites = [] } = useConvites();
  const toast = useToast();
  const t = convites.find((c) => c.id === conviteId)?.token;
  if (!t) return null;
  const url = `${window.location.origin}${rotas.convite(t)}`;
  return (
    <div className="flex gap-1.5">
      <Input readOnly value={url} className="font-mono text-xs" aria-label="Link do convite" onFocus={(e) => e.currentTarget.select()} />
      <Button
        leftIcon={<Copy />}
        onClick={() => void navigator.clipboard?.writeText(url).then(() => toast.success('Link copiado'))}
      >
        Copiar
      </Button>
    </div>
  );
}

/** Membros, papéis e convites da organização. Dono: FRONTEND-1. */
export default function OrganizacaoMembrosPage() {
  const { organizacao, isOwner } = useOrganizacao();
  const { user } = useAuth();
  const toast = useToast();
  const membros = useMembros();
  const convites = useConvites();
  const alterar = useAlterarPapelMembro();
  const remover = useRemoverMembro();
  const revogar = useRevogarConvite();
  const [convidarAberto, setConvidarAberto] = useState(false);
  const [removendo, setRemovendo] = useState<MembroListado | null>(null);
  const [revogando, setRevogando] = useState<string | null>(null);

  const lista = membros.data ?? [];
  const owners = lista.filter((m) => m.papel === 'owner').length;

  const mudarPapel = (m: MembroListado, papel: OrgRole) =>
    alterar.mutate(
      { userId: m.user_id, papel },
      {
        onSuccess: () => toast.success('Papel alterado', `${m.nome || m.email} agora é ${LABEL_ORG_ROLE[papel].toLowerCase()}.`),
        onError: (e) => toast.error('Não foi possível alterar o papel', mensagemErro(e)),
      },
    );

  const acoes = (m: MembroListado): DropdownMenuEntry[] => {
    const eu = m.user_id === user?.id;
    const ultimoOwner = m.papel === 'owner' && owners <= 1;
    const itens: DropdownMenuEntry[] = [];
    if (isOwner) {
      (['owner', 'editor', 'viewer'] as OrgRole[]).forEach((p) =>
        itens.push({
          label: `Tornar ${LABEL_ORG_ROLE[p].toLowerCase()}`,
          icon: p === 'owner' ? <ShieldCheck /> : <Users />,
          disabled: m.papel === p || (ultimoOwner && p !== 'owner'),
          onSelect: () => mudarPapel(m, p),
        }),
      );
      itens.push('separator');
    }
    itens.push({
      label: eu ? 'Sair da organização' : 'Remover da equipe',
      icon: eu ? <LogOut /> : <UserMinus />,
      danger: true,
      disabled: ultimoOwner || (!isOwner && !eu),
      onSelect: () => setRemovendo(m),
    });
    return itens;
  };

  return (
    <>
      <PageHeader
        title="Equipe"
        description={`Pessoas com acesso a ${organizacao?.nome ?? 'esta organização'} e seus papéis.`}
        breadcrumbs={[{ label: 'Cadastros' }, { label: 'Equipe' }]}
        actions={
          isOwner && (
            <Button variant="primary" leftIcon={<MailPlus />} onClick={() => setConvidarAberto(true)}>
              Convidar
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {(['owner', 'editor', 'viewer'] as OrgRole[]).map((p) => (
          <div key={p} className="corner-marks rounded border border-border bg-surface px-3.5 py-3 shadow-xs">
            <div className="flex items-center justify-between">
              <Badge variant={BADGE_PAPEL[p]}>{LABEL_ORG_ROLE[p]}</Badge>
              <span className="num text-lg font-semibold">{lista.filter((m) => m.papel === p).length}</span>
            </div>
            <p className="mt-1.5 text-xs text-fg-muted">{DESC_PAPEL[p]}</p>
          </div>
        ))}
      </div>

      {membros.isError ? (
        <EstadoErro erro={membros.error} onRetry={() => void membros.refetch()} />
      ) : (
        <Table striped>
          <THead>
            <tr>
              <Th>Membro</Th>
              <Th width={140}>Papel</Th>
              <Th width={130}>Desde</Th>
              <Th width={140}>Último acesso</Th>
              <Th width={44}>
                <span className="sr-only">Ações</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            {membros.isLoading &&
              [0, 1, 2].map((i) => (
                <Tr key={i}>
                  <Td colSpan={5}>
                    <Skeleton className="h-4 w-1/2" />
                  </Td>
                </Tr>
              ))}
            {!membros.isLoading && lista.length === 0 && <TableMessage colSpan={5}>Nenhum membro.</TableMessage>}
            {lista.map((m) => (
              <Tr key={m.user_id}>
                <Td>
                  <div className="flex items-center gap-2.5 py-0.5">
                    <Avatar name={m.nome || m.email} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {m.nome || '—'} {m.user_id === user?.id && <span className="text-xs font-normal text-fg-subtle">(você)</span>}
                      </div>
                      <div className="truncate text-xs text-fg-subtle">{m.email}</div>
                    </div>
                  </div>
                </Td>
                <Td>
                  <Badge variant={BADGE_PAPEL[m.papel]}>{LABEL_ORG_ROLE[m.papel]}</Badge>
                </Td>
                <Td numeric className="text-left">
                  {formatData(m.created_at.slice(0, 10))}
                </Td>
                <Td muted className="text-xs">
                  {formatRelativo(m.ultimo_acesso_em)}
                </Td>
                <Td className="text-right">
                  <DropdownMenu align="end" aria-label={`Ações de ${m.nome || m.email}`} items={acoes(m)} trigger={<IconButton size="sm" label="Ações" icon={<MoreHorizontal />} />} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      {isOwner && (
        <Card flush className="mt-5">
          <CardHeader title="Convites pendentes" description="Convites ainda não aceitos. Expiram automaticamente." />
          {convites.isError ? (
            <div className="p-4">
              <EstadoErro erro={convites.error} onRetry={() => void convites.refetch()} />
            </div>
          ) : (convites.data ?? []).length === 0 ? (
            <EmptyState variant="inline" icon={<MailPlus />} title="Nenhum convite pendente" description="Convide colegas para colaborar nos orçamentos." />
          ) : (
            <Table inset>
              <THead>
                <tr>
                  <Th>E-mail</Th>
                  <Th width={140}>Papel</Th>
                  <Th width={130}>Expira em</Th>
                  <Th width={90}>
                    <span className="sr-only">Ações</span>
                  </Th>
                </tr>
              </THead>
              <TBody>
                {(convites.data ?? []).map((c) => (
                  <Tr key={c.id}>
                    <Td>{c.email}</Td>
                    <Td>
                      <Badge variant="outline">{LABEL_ORG_ROLE[c.papel]}</Badge>
                    </Td>
                    <Td numeric className="text-left">
                      {formatData(c.expira_em.slice(0, 10))}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Tooltip content="Copiar link do convite">
                          <IconButton
                            size="sm"
                            label="Copiar link"
                            icon={<Copy />}
                            onClick={() =>
                              void navigator.clipboard
                                ?.writeText(`${window.location.origin}${rotas.convite(c.token)}`)
                                .then(() => toast.success('Link copiado', c.email))
                            }
                          />
                        </Tooltip>
                        <IconButton size="sm" label="Revogar convite" icon={<Trash2 />} onClick={() => setRevogando(c.id)} />
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      <ConvidarModal open={convidarAberto} onClose={() => setConvidarAberto(false)} />
      <ConfirmDialog
        open={Boolean(removendo)}
        onClose={() => setRemovendo(null)}
        destructive
        loading={remover.isPending}
        title={removendo?.user_id === user?.id ? 'Sair da organização?' : 'Remover membro?'}
        description={
          removendo?.user_id === user?.id
            ? 'Você perderá o acesso aos dados deste escritório.'
            : `${removendo?.nome || removendo?.email} perderá o acesso aos dados deste escritório.`
        }
        confirmLabel={removendo?.user_id === user?.id ? 'Sair' : 'Remover'}
        onConfirm={() =>
          removendo &&
          remover.mutate(removendo.user_id, {
            onSuccess: () => {
              toast.success(removendo.user_id === user?.id ? 'Você saiu da organização' : 'Membro removido');
              setRemovendo(null);
            },
            onError: (e) => toast.error('Não foi possível remover', mensagemErro(e)),
          })
        }
      />
      <ConfirmDialog
        open={Boolean(revogando)}
        onClose={() => setRevogando(null)}
        destructive
        loading={revogar.isPending}
        title="Revogar convite?"
        description="O link deixará de funcionar."
        confirmLabel="Revogar"
        onConfirm={() =>
          revogando &&
          revogar.mutate(revogando, {
            onSuccess: () => {
              toast.success('Convite revogado');
              setRevogando(null);
            },
            onError: (e) => toast.error('Não foi possível revogar', mensagemErro(e)),
          })
        }
      />
    </>
  );
}
