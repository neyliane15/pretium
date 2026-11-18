import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Calculator, Database, HardHat, UserCheck, UserX, Users } from 'lucide-react';
import { Badge, Button, Card, CardHeader, DemoBadge, EmptyState, Skeleton, Stat, TBody, THead, Table, Td, Th, Tr } from '@/components/ui';
import { useAdminEstatisticas, useAdminUsuarios, useImportacoes } from '@/api/core/admin';
import { formatDataHora, formatMesAno, formatNumero, formatRelativo } from '@/lib/format';
import { LABEL_IMPORTACAO_STATUS, LABEL_REGIME } from '@/lib/labels';
import { rotas } from '@/routes';
import { EstadoErro } from '@/pages/_shared/EstadoErro';
import { BADGE_IMPORTACAO, LABEL_IMPORTACAO_TIPO } from '@/components/admin/rotulos';

const n = (v: number | undefined) => (v === undefined ? '—' : formatNumero(v, 0));

/** Visão geral do admin (`admin_estatisticas`). Dono: FRONTEND-1. */
export default function AdminDashboardPage() {
  const nav = useNavigate();
  const est = useAdminEstatisticas();
  const pendentes = useAdminUsuarios({ busca: '', status: 'pending', page: 1, pageSize: 6 });
  const imports = useImportacoes();
  const s = est.data;
  const db = s?.ultima_data_base ?? null;

  return (
    <div className="flex flex-col gap-4">
      {est.isError && <EstadoErro erro={est.error} onRetry={() => void est.refetch()} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Usuários" value={est.isLoading ? <Skeleton className="h-7 w-14" /> : n(s?.usuarios_total)} icon={<Users />} hint="contas cadastradas" />
        <Stat
          label="Aguardando aprovação"
          value={est.isLoading ? <Skeleton className="h-7 w-10" /> : n(s?.usuarios_pendentes)}
          icon={<UserCheck />}
          highlight={Boolean(s?.usuarios_pendentes)}
          hint={s?.usuarios_pendentes ? 'revise as solicitações' : 'nenhuma pendência'}
        />
        <Stat label="Bloqueados" value={est.isLoading ? <Skeleton className="h-7 w-10" /> : n(s?.usuarios_bloqueados)} icon={<UserX />} />
        <Stat label="Organizações" value={est.isLoading ? <Skeleton className="h-7 w-10" /> : n(s?.organizacoes_total)} icon={<Building2 />} />
        <Stat label="Obras" value={est.isLoading ? <Skeleton className="h-7 w-10" /> : n(s?.obras_total)} icon={<HardHat />} />
        <Stat label="Orçamentos" value={est.isLoading ? <Skeleton className="h-7 w-10" /> : n(s?.orcamentos_total)} icon={<Calculator />} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <Card flush accent>
          <CardHeader
            eyebrow="Fila"
            title="Solicitações de acesso"
            description="Novos cadastros aguardando aprovação."
            actions={
              <Button size="sm" variant="ghost" rightIcon={<ArrowRight />} onClick={() => nav(rotas.adminUsuarios)}>
                Ver todos
              </Button>
            }
          />
          {pendentes.isError ? (
            <div className="p-4">
              <EstadoErro erro={pendentes.error} />
            </div>
          ) : (pendentes.data?.linhas ?? []).length === 0 ? (
            <EmptyState variant="inline" icon={<UserCheck />} title={pendentes.isLoading ? 'Carregando…' : 'Nenhuma solicitação pendente'} />
          ) : (
            <Table inset>
              <THead>
                <tr>
                  <Th>Usuário</Th>
                  <Th width={150}>Cadastro</Th>
                </tr>
              </THead>
              <TBody>
                {(pendentes.data?.linhas ?? []).map((u) => (
                  <Tr key={u.id} interactive onClick={() => nav(`${rotas.adminUsuarios}?status=pending`)}>
                    <Td>
                      <div className="font-medium">{u.nome || '—'}</div>
                      <div className="text-xs text-fg-subtle">{u.email}</div>
                    </Td>
                    <Td muted className="text-xs">
                      {formatRelativo(u.created_at)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card cornerMarks className="flex flex-col">
          <div className="flex items-center justify-between">
            <span className="font-mono text-2xs uppercase tracking-[0.1em] text-fg-subtle">Data-base mais recente</span>
            <Database className="h-4 w-4 text-fg-subtle" aria-hidden />
          </div>
          {est.isLoading ? (
            <Skeleton className="mt-3 h-8 w-40" />
          ) : db ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <span className="num text-2xl font-semibold">
                  {db.uf} · {formatMesAno(db.ano, db.mes)}
                </span>
                {db.is_demo && <DemoBadge />}
              </div>
              <div className="mt-0.5 text-sm text-fg-muted">SINAPI · {LABEL_REGIME[db.regime]}</div>
            </>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">Nenhuma data-base importada.</p>
          )}
          <div className="mt-auto flex gap-2 pt-4">
            <Button size="sm" variant="primary" onClick={() => nav(rotas.adminSinapiImportar)}>
              Importar planilha
            </Button>
            <Button size="sm" onClick={() => nav(rotas.adminSinapi)}>
              Gerenciar datas-base
            </Button>
          </div>
        </Card>
      </div>

      <Card flush>
        <CardHeader
          title="Últimas importações SINAPI"
          actions={
            <Link to={rotas.adminSinapi} className="text-xs font-medium text-primary hover:underline">
              Histórico completo
            </Link>
          }
        />
        {imports.isError ? (
          <div className="p-4">
            <EstadoErro erro={imports.error} />
          </div>
        ) : (imports.data ?? []).length === 0 ? (
          <EmptyState variant="inline" icon={<Database />} title={imports.isLoading ? 'Carregando…' : 'Nenhuma importação registrada'} />
        ) : (
          <Table inset>
            <THead>
              <tr>
                <Th width={150}>Início</Th>
                <Th width={130}>Data-base</Th>
                <Th width={110}>Tipo</Th>
                <Th>Arquivo</Th>
                <Th numeric width={90}>
                  Linhas
                </Th>
                <Th numeric width={80}>
                  Erros
                </Th>
                <Th width={110}>Situação</Th>
              </tr>
            </THead>
            <TBody>
              {(imports.data ?? []).slice(0, 5).map((i) => (
                <Tr key={i.id}>
                  <Td className="num text-xs">{formatDataHora(i.iniciado_em)}</Td>
                  <Td mono>{i.data_base ? `${i.data_base.uf} ${formatMesAno(i.data_base.ano, i.data_base.mes)}` : '—'}</Td>
                  <Td>{LABEL_IMPORTACAO_TIPO[i.tipo]}</Td>
                  <Td truncate title={i.arquivo_nome ?? undefined} className="font-mono text-xs">
                    {i.arquivo_nome ?? '—'}
                  </Td>
                  <Td numeric>{formatNumero(i.linhas_ok, 0)}</Td>
                  <Td numeric className={i.linhas_erro ? 'text-danger' : 'text-fg-subtle'}>
                    {formatNumero(i.linhas_erro, 0)}
                  </Td>
                  <Td>
                    <Badge variant={BADGE_IMPORTACAO[i.status]} dot>
                      {LABEL_IMPORTACAO_STATUS[i.status]}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
