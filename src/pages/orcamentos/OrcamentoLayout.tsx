import { useMemo } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ChevronDown, Copy, Lock, Printer, RefreshCw } from 'lucide-react';
import { useBdis, useDuplicarOrcamento, useAtualizarOrcamento, useOrcamento, useRecalcularOrcamento } from '@/api/orcamento/orcamentos';
import { useDataBase } from '@/api/orcamento/referencias';
import { DataBaseTag, ErroCarregamento, Rotulo, StatusOrcamento } from '@/components/orcamento/comum';
import type { OrcamentoContexto } from '@/components/orcamento/contexto';
import { Alert, Button, DropdownMenu, LoadingBlock, PageHeader, Spinner, TabLinks, useToast } from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { useDebouncedCallback } from '@/hooks/orcamento/useDebouncedCallback';
import { formatBRL, formatPercent, formatRelativo } from '@/lib/format';
import { LABEL_ORCAMENTO_STATUS } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';
import type { OrcamentoStatus } from '@/types/database';

const STATUS: OrcamentoStatus[] = ['rascunho', 'em_revisao', 'aprovado', 'arquivado'];

/** Moldura do orçamento: cabeçalho com totais, status, ações e abas. Dono: FRONTEND-2. */
export default function OrcamentoLayout() {
  const { orcamentoId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { podeEditar } = useOrganizacao();
  const orc = useOrcamento(orcamentoId);
  const bdis = useBdis(orcamentoId);
  const db = useDataBase(orc.data?.data_base_id);
  const recalcular = useRecalcularOrcamento(orcamentoId);
  const atualizar = useAtualizarOrcamento(orcamentoId);
  const duplicar = useDuplicarOrcamento();

  const { agendar } = useDebouncedCallback(() => {
    recalcular.mutate(undefined, { onError: (e) => toast.error('Não foi possível recalcular', mensagemErro(e)) });
  }, 600);

  const ctx = useMemo<OrcamentoContexto | null>(() => {
    if (!orc.data) return null;
    const lista = bdis.data ?? [];
    return {
      orcamento: orc.data,
      dataBase: db.data,
      bdis: lista,
      bdiPadrao: lista.find((b) => b.is_padrao) ?? lista[0] ?? null,
      podeEditar,
      editavel: podeEditar && (orc.data.status === 'rascunho' || orc.data.status === 'em_revisao'),
      agendarRecalculo: agendar,
      recalculando: recalcular.isPending,
    };
  }, [orc.data, bdis.data, db.data, podeEditar, agendar, recalcular.isPending]);

  if (orc.isLoading) return <LoadingBlock label="Carregando orçamento…" />;
  if (orc.isError || !ctx) return <ErroCarregamento erro={orc.error} onRetry={() => void orc.refetch()} />;
  const o = ctx.orcamento;
  const id = o.id;

  const mudarStatus = async (s: OrcamentoStatus) => {
    try {
      await atualizar.mutateAsync({ status: s });
      toast.success('Status alterado', LABEL_ORCAMENTO_STATUS[s]);
    } catch (e) {
      toast.error('Não foi possível alterar o status', mensagemErro(e));
    }
  };
  const onDuplicar = async () => {
    try {
      const novo = await duplicar.mutateAsync({ id, novaVersao: true });
      toast.success('Nova versão criada');
      navigate(rotas.orcamento(novo));
    } catch (e) {
      toast.error('Não foi possível duplicar', mensagemErro(e));
    }
  };

  const bdiMedio = o.total_sem_bdi > 0 ? (o.total / o.total_sem_bdi - 1) * 100 : ctx.bdiPadrao?.bdi ?? 0;

  return (
    <>
      <PageHeader
        title={<>{o.codigo && <span className="mr-2 font-mono text-lg font-medium text-fg-subtle">{o.codigo}</span>}{o.nome}</>}
        breadcrumbs={[
          { label: 'Orçamentos', to: rotas.orcamentos },
          ...(o.obra ? [{ label: o.obra.nome, to: rotas.obra(o.obra.id) }] : []),
          { label: `v${o.versao}` },
        ]}
        badges={
          <>
            <StatusOrcamento status={o.status} />
            <span className="font-mono text-xs text-fg-subtle">v{o.versao}</span>
          </>
        }
        description={<DataBaseTag db={o.data_base} />}
        actions={
          <>
            {ctx.editavel && (
              <Button leftIcon={recalcular.isPending ? <Spinner size="xs" /> : <RefreshCw />} disabled={recalcular.isPending} onClick={() => recalcular.mutate(undefined, {
                onSuccess: () => toast.success('Orçamento recalculado'),
                onError: (e) => toast.error('Não foi possível recalcular', mensagemErro(e)),
              })}>
                Recalcular
              </Button>
            )}
            <Button leftIcon={<Printer />} onClick={() => window.open(rotas.imprimirOrcamento(id, 'sintetico'), '_blank')}>Imprimir</Button>
            {podeEditar && (
              <>
                <Button leftIcon={<Copy />} loading={duplicar.isPending} onClick={() => void onDuplicar()}>Nova versão</Button>
                <DropdownMenu
                  align="end"
                  aria-label="Alterar status"
                  trigger={<Button variant="primary" rightIcon={<ChevronDown />}>Status</Button>}
                  items={STATUS.map((s) => ({ label: LABEL_ORCAMENTO_STATUS[s], disabled: s === o.status, onSelect: () => void mudarStatus(s) }))}
                />
              </>
            )}
          </>
        }
      >
        <div className="mb-3 grid grid-cols-2 overflow-hidden rounded border border-border bg-surface shadow-xs sm:grid-cols-3 lg:grid-cols-6">
          {[
            { r: 'Total sem BDI', v: formatBRL(o.total_sem_bdi) },
            { r: 'BDI', v: <>{formatBRL(o.total_bdi)} <span className="text-xs text-fg-subtle">{formatPercent(bdiMedio)}</span></> },
            { r: 'Total com BDI', v: formatBRL(o.total), destaque: true as boolean },
            {
              r: 'Itens sem preço',
              v: o.itens_sem_preco > 0 ? <span className="inline-flex items-center gap-1 text-warning"><AlertTriangle className="h-3.5 w-3.5" />{o.itens_sem_preco}</span> : <span className="text-success">0</span>,
            },
            { r: 'Recalculado', v: recalcular.isPending ? <span className="inline-flex items-center gap-1.5 text-fg-muted"><Spinner size="xs" /> recalculando</span> : formatRelativo(o.recalculado_em) },
            { r: 'Data / validade', v: <>{new Date(o.data_orcamento + 'T00:00:00').toLocaleDateString('pt-BR')} <span className="text-xs text-fg-subtle">· {o.validade_dias} d</span></> },
          ].map((k, i) => (
            <div key={i} className={`relative border-border px-3 py-2 [&:not(:last-child)]:border-r ${k.destaque ? 'bg-primary-soft/40' : ''}`}>
              {k.destaque && <span aria-hidden className="absolute left-0 top-0 h-[2px] w-7 bg-brand" />}
              <Rotulo>{k.r}</Rotulo>
              <div className={`num mt-0.5 ${k.destaque ? 'text-lg font-semibold' : 'text-md'} text-fg`}>{k.v}</div>
            </div>
          ))}
        </div>
        <TabLinks
          items={[
            { to: rotas.orcamento(id), label: 'Planilha', end: true },
            { to: rotas.orcamentoSintetico(id), label: 'Sintético' },
            { to: rotas.orcamentoBdi(id), label: 'BDI' },
            { to: rotas.orcamentoCronograma(id), label: 'Cronograma' },
            { to: rotas.orcamentoCurvaAbc(id), label: 'Curva ABC' },
            { to: rotas.orcamentoMaoObra(id), label: 'Mão de obra' },
            { to: rotas.orcamentoMedicoes(id), label: 'Medições' },
            { to: rotas.orcamentoRelatorios(id), label: 'Relatórios' },
            { to: rotas.orcamentoDados(id), label: 'Dados e versões' },
          ]}
        />
      </PageHeader>

      {podeEditar && !ctx.editavel && (
        <Alert variant="info" icon={<Lock />} className="mb-3" title={`Orçamento ${LABEL_ORCAMENTO_STATUS[o.status].toLowerCase()} — somente leitura`}
          action={<Button size="sm" onClick={() => void mudarStatus('em_revisao')}>Reabrir para revisão</Button>}>
          Para alterar itens, reabra o orçamento ou <button type="button" className="text-primary hover:underline" onClick={() => void onDuplicar()}>crie uma nova versão</button>.
        </Alert>
      )}
      <Outlet context={ctx} />
    </>
  );
}
