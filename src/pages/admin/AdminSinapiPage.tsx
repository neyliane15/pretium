import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, Database, FileWarning, MoreHorizontal, RotateCcw, Send, Upload } from 'lucide-react';
import {
  Badge, Button, Card, CardHeader, DemoBadge, Drawer, DropdownMenu, EmptyState, IconButton, Skeleton, TBody, THead, Table, Td, Th, Tr, useToast,
} from '@/components/ui';
import { useDatasBaseAdmin, useImportacoes, usePublicarDataBase, type ImportacaoComDataBase } from '@/api/core/admin';
import { BADGE_DATA_BASE_STATUS, BADGE_IMPORTACAO, LABEL_DATA_BASE_STATUS, LABEL_IMPORTACAO_TIPO } from '@/components/admin/rotulos';
import { formatDataHora, formatMesAno, formatNumero } from '@/lib/format';
import { LABEL_IMPORTACAO_STATUS, LABEL_REGIME } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import type { DataBaseStatus } from '@/types/database';
import { rotas } from '@/routes';
import { EstadoErro } from '@/pages/_shared/EstadoErro';
import { SincronizacaoSinapiCard } from '@/components/admin/SincronizacaoSinapiCard';

function ErrosDrawer({ imp, onClose }: { imp: ImportacaoComDataBase | null; onClose: () => void }) {
  const erros = imp?.erros ?? [];
  return (
    <Drawer
      open={Boolean(imp)}
      onClose={onClose}
      eyebrow={imp ? `Importação · ${LABEL_IMPORTACAO_TIPO[imp.tipo]}` : undefined}
      title="Erros por linha"
      description={imp?.arquivo_nome ?? undefined}
      width={560}
    >
      {erros.length === 0 ? (
        <EmptyState variant="inline" icon={<FileWarning />} title="Nenhum erro registrado" />
      ) : (
        <>
          <p className="mb-2 text-xs text-fg-muted">
            {formatNumero(imp?.linhas_erro ?? erros.length, 0)} linhas com erro{(imp?.linhas_erro ?? 0) > erros.length && ` (exibindo as primeiras ${erros.length})`}.
          </p>
          <Table density="compact" gridLines stickyHeader containerClassName="max-h-[calc(100vh-200px)]">
            <THead>
              <tr>
                <Th numeric width={70}>
                  Linha
                </Th>
                <Th width={90}>Código</Th>
                <Th>Mensagem</Th>
              </tr>
            </THead>
            <TBody>
              {erros.map((e, i) => (
                <Tr key={i}>
                  <Td numeric>{e.linha ?? '—'}</Td>
                  <Td mono>{e.codigo ?? '—'}</Td>
                  <Td className="text-danger">{e.mensagem}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </>
      )}
    </Drawer>
  );
}

/** Datas-base (publicar/arquivar) e histórico de importações. Dono: FRONTEND-1. */
export default function AdminSinapiPage() {
  const nav = useNavigate();
  const toast = useToast();
  const datas = useDatasBaseAdmin();
  const imports = useImportacoes();
  const publicar = usePublicarDataBase();
  const [errosDe, setErrosDe] = useState<ImportacaoComDataBase | null>(null);

  const mudar = (id: string, status: DataBaseStatus, rotulo: string) =>
    publicar.mutate(
      { id, status },
      { onSuccess: () => toast.success(`Data-base ${rotulo}`), onError: (e) => toast.error('Não foi possível alterar a data-base', mensagemErro(e)) },
    );

  return (
    <div className="flex flex-col gap-4">
      <SincronizacaoSinapiCard />
      <Card flush accent>
        <CardHeader
          eyebrow="Referências"
          title="Datas-base SINAPI"
          description="Somente datas-base publicadas ficam visíveis para os usuários. Dados de exemplo são marcados como “Exemplo”."
          actions={
            <Button variant="primary" size="sm" leftIcon={<Upload />} onClick={() => nav(rotas.adminSinapiImportar)}>
              Importar planilha
            </Button>
          }
        />
        {datas.isError ? (
          <div className="p-4">
            <EstadoErro erro={datas.error} onRetry={() => void datas.refetch()} />
          </div>
        ) : !datas.isLoading && (datas.data ?? []).length === 0 ? (
          <EmptyState variant="inline" icon={<Database />} title="Nenhuma data-base" description="Importe a primeira tabela SINAPI para habilitar os orçamentos." />
        ) : (
          <Table inset striped>
            <THead>
              <tr>
                <Th width={70}>UF</Th>
                <Th width={110}>Mês/ano</Th>
                <Th width={150}>Regime</Th>
                <Th>Descrição</Th>
                <Th width={120}>Situação</Th>
                <Th width={150}>Publicada em</Th>
                <Th width={44}>
                  <span className="sr-only">Ações</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {datas.isLoading &&
                [0, 1, 2].map((i) => (
                  <Tr key={i}>
                    <Td colSpan={7}>
                      <Skeleton className="h-4 w-1/3" />
                    </Td>
                  </Tr>
                ))}
              {(datas.data ?? []).map((d) => (
                <Tr key={d.id}>
                  <Td mono className="font-semibold">
                    {d.uf}
                  </Td>
                  <Td numeric className="text-left">
                    {formatMesAno(d.ano, d.mes)}
                  </Td>
                  <Td>{LABEL_REGIME[d.regime]}</Td>
                  <Td truncate title={d.descricao ?? undefined}>
                    <span className="flex items-center gap-2">
                      {d.is_demo && <DemoBadge />}
                      <span className="truncate">{d.descricao ?? d.fonte_arquivo ?? '—'}</span>
                    </span>
                  </Td>
                  <Td>
                    <Badge variant={BADGE_DATA_BASE_STATUS[d.status]} dot>
                      {LABEL_DATA_BASE_STATUS[d.status]}
                    </Badge>
                  </Td>
                  <Td className="num text-xs">{formatDataHora(d.publicada_em)}</Td>
                  <Td className="text-right">
                    <DropdownMenu
                      align="end"
                      aria-label={`Ações da data-base ${d.uf} ${formatMesAno(d.ano, d.mes)}`}
                      trigger={<IconButton size="sm" label="Ações" icon={<MoreHorizontal />} />}
                      items={[
                        { label: 'Publicar', icon: <Send />, disabled: d.status === 'publicada', onSelect: () => mudar(d.id, 'publicada', 'publicada') },
                        { label: 'Voltar para rascunho', icon: <RotateCcw />, disabled: d.status === 'rascunho', onSelect: () => mudar(d.id, 'rascunho', 'em rascunho') },
                        'separator',
                        { label: 'Arquivar', icon: <Archive />, danger: true, disabled: d.status === 'arquivada', onSelect: () => mudar(d.id, 'arquivada', 'arquivada') },
                      ]}
                    />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card flush>
        <CardHeader title="Histórico de importações" description="Últimas 100 importações, com contagem de linhas e erros." />
        {imports.isError ? (
          <div className="p-4">
            <EstadoErro erro={imports.error} onRetry={() => void imports.refetch()} />
          </div>
        ) : !imports.isLoading && (imports.data ?? []).length === 0 ? (
          <EmptyState variant="inline" icon={<Upload />} title="Nenhuma importação registrada" />
        ) : (
          <Table inset striped>
            <THead>
              <tr>
                <Th width={140}>Início</Th>
                <Th width={150}>Data-base</Th>
                <Th width={110}>Tipo</Th>
                <Th>Arquivo</Th>
                <Th numeric width={90}>
                  Total
                </Th>
                <Th numeric width={90}>
                  Ok
                </Th>
                <Th numeric width={80}>
                  Erros
                </Th>
                <Th width={110}>Situação</Th>
                <Th width={130}>Duração</Th>
              </tr>
            </THead>
            <TBody>
              {imports.isLoading &&
                [0, 1, 2].map((i) => (
                  <Tr key={i}>
                    <Td colSpan={9}>
                      <Skeleton className="h-4 w-1/3" />
                    </Td>
                  </Tr>
                ))}
              {(imports.data ?? []).map((i) => {
                const seg = i.finalizado_em ? Math.max(0, Math.round((new Date(i.finalizado_em).getTime() - new Date(i.iniciado_em).getTime()) / 1000)) : null;
                return (
                  <Tr key={i.id}>
                    <Td className="num text-xs">{formatDataHora(i.iniciado_em)}</Td>
                    <Td mono>
                      {i.data_base ? `${i.data_base.uf} ${formatMesAno(i.data_base.ano, i.data_base.mes)} · ${i.data_base.regime === 'desonerado' ? 'CD' : 'SD'}` : '—'}
                    </Td>
                    <Td>{LABEL_IMPORTACAO_TIPO[i.tipo]}</Td>
                    <Td truncate title={i.arquivo_nome ?? undefined} className="font-mono text-xs">
                      {i.arquivo_nome ?? '—'}
                    </Td>
                    <Td numeric>{formatNumero(i.total_linhas, 0)}</Td>
                    <Td numeric>{formatNumero(i.linhas_ok, 0)}</Td>
                    <Td numeric>
                      {i.linhas_erro > 0 ? (
                        <button type="button" onClick={() => setErrosDe(i)} className="text-danger underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {formatNumero(i.linhas_erro, 0)}
                        </button>
                      ) : (
                        <span className="text-fg-subtle">0</span>
                      )}
                    </Td>
                    <Td>
                      <Badge variant={BADGE_IMPORTACAO[i.status]} dot>
                        {LABEL_IMPORTACAO_STATUS[i.status]}
                      </Badge>
                    </Td>
                    <Td className="num text-xs text-fg-muted">{seg === null ? '—' : seg < 60 ? `${seg} s` : `${Math.floor(seg / 60)} min ${seg % 60} s`}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      <ErrosDrawer imp={errosDe} onClose={() => setErrosDe(null)} />
    </div>
  );
}
