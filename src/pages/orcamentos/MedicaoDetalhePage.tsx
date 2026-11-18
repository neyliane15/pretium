import { Fragment, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCheck, Lock, LockOpen, Search } from 'lucide-react';
import { useAtualizarMedicao, useMedicao, useMedicaoResumo, useSalvarMedicaoItem } from '@/api/orcamento/analises';
import { useEtapas } from '@/api/orcamento/orcamentos';
import { BotoesExportar } from '@/components/orcamento/BotoesExportar';
import { BarraPercentual, ErroCarregamento, Rotulo } from '@/components/orcamento/comum';
import { useOrcamentoContexto } from '@/components/orcamento/contexto';
import { montarEap } from '@/components/orcamento/eap';
import { Alert, Badge, Button, Card, CardHeader, Input, LoadingBlock, NumberInput, Stat, TBody, TFoot, THead, Table, Td, Th, Tr, useToast } from '@/components/ui';
import { useMetaOrcamento } from '@/hooks/orcamento/useMetaOrcamento';
import { round4, somaMoeda, valorMedido } from '@/lib/calc';
import { cn } from '@/lib/cn';
import { formatBRL, formatData, formatMoeda, formatNumero, formatQuantidade } from '@/lib/format';
import { LABEL_MEDICAO_STATUS } from '@/lib/labels';
import { BADGE_MEDICAO_STATUS } from '@/lib/labels-orcamento';
import { tabelaMedicao } from '@/lib/export/relatorios';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';
import type { MedicaoResumoLinha, MedicaoStatus } from '@/types/database';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Boletim de medição: quantidades do período, anterior, acumulado e saldo. Dono: FRONTEND-2. */
export default function MedicaoDetalhePage() {
  const { medicaoId = '' } = useParams();
  const { orcamento, podeEditar } = useOrcamentoContexto();
  const toast = useToast();
  const meta = useMetaOrcamento();
  const med = useMedicao(medicaoId);
  const resumo = useMedicaoResumo(medicaoId);
  const etapas = useEtapas(orcamento.id);
  const salvarItem = useSalvarMedicaoItem(medicaoId, orcamento.id);
  const atualizar = useAtualizarMedicao(medicaoId, orcamento.id);
  const [filtro, setFiltro] = useState('');
  const [soMedidos, setSoMedidos] = useState(false);
  const [local, setLocal] = useState<Map<string, number>>(new Map());

  const linhas = useMemo(() => {
    const r = (resumo.data ?? []).map((l) => {
      const q = local.get(l.item_id);
      if (q === undefined) return l;
      const vt = valorMedido(q, l.preco_unitario);
      const qa = round4(l.quantidade_anterior + q);
      return { ...l, quantidade_atual: q, valor_atual: vt, quantidade_acumulada: qa, quantidade_saldo: round4(l.quantidade_orcada - qa), valor_acumulado: l.valor_anterior + vt, valor_saldo: l.valor_orcado - l.valor_anterior - vt, percentual_acumulado: l.valor_orcado ? ((l.valor_anterior + vt) / l.valor_orcado) * 100 : 0 };
    });
    const t = semAcento(filtro.trim());
    return r.filter((l) => (!soMedidos || l.quantidade_atual > 0) && (!t || semAcento(`${l.codigo} ${l.descricao}`).includes(t)));
  }, [resumo.data, local, filtro, soMedidos]);

  const grupos = useMemo(() => {
    const eap = montarEap(etapas.data ?? [], []);
    const porEtapa = new Map<string, MedicaoResumoLinha[]>();
    for (const l of linhas) porEtapa.set(l.etapa_id, [...(porEtapa.get(l.etapa_id) ?? []), l]);
    return eap.linhas.filter((e) => porEtapa.has(e.id)).map((e) => ({ id: e.id, codigo: e.codigo, nome: e.tipo === 'etapa' ? e.etapa.nome : '', itens: porEtapa.get(e.id)! }));
  }, [etapas.data, linhas]);

  if (med.isLoading || resumo.isLoading) return <LoadingBlock label="Carregando boletim…" />;
  if (med.isError || !med.data) return <ErroCarregamento erro={med.error} />;
  const m = med.data;
  const aberta = m.status === 'aberta';
  const editavel = podeEditar && aberta;
  const todas = resumo.data ?? [];
  const tot = (k: keyof MedicaoResumoLinha) => somaMoeda(linhas.map((l) => l[k] as number));
  const totalAtual = somaMoeda(todas.map((l) => valorMedido(local.get(l.item_id) ?? l.quantidade_atual, l.preco_unitario)));

  const onQtd = (l: MedicaoResumoLinha, v: number | null) => {
    const q = v ?? 0;
    const maximo = round4(l.quantidade_orcada - l.quantidade_anterior);
    if (q > maximo + 1e-9) {
      toast.error('Quantidade medida excede o orçado', `Saldo disponível: ${formatQuantidade(maximo)} ${l.unidade}`);
      return;
    }
    setLocal((s) => new Map(s).set(l.item_id, q));
    salvarItem.mutate({ itemId: l.item_id, quantidade: q }, {
      onSuccess: () => setLocal((s) => { const n = new Map(s); n.delete(l.item_id); return n; }),
      onError: (e) => { setLocal((s) => { const n = new Map(s); n.delete(l.item_id); return n; }); toast.error('Não foi possível salvar', mensagemErro(e)); },
    });
  };
  const status = (s: MedicaoStatus) => atualizar.mutate({ status: s }, { onSuccess: () => toast.success(`Medição ${LABEL_MEDICAO_STATUS[s].toLowerCase()}`), onError: (e) => toast.error('Não foi possível alterar', mensagemErro(e)) });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={rotas.orcamentoMedicoes(orcamento.id)} className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="h-3.5 w-3.5" /> Medições</Link>
        <h2 className="font-display text-xl font-semibold">Boletim nº {String(m.numero).padStart(2, '0')}</h2>
        <Badge variant={BADGE_MEDICAO_STATUS[m.status]} dot>{LABEL_MEDICAO_STATUS[m.status]}</Badge>
        <span className="num text-xs text-fg-muted">{formatData(m.periodo_inicio)} → {formatData(m.periodo_fim)} · medido em {formatData(m.data_medicao)}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <BotoesExportar tabela={() => tabelaMedicao(meta, m.numero, resumo.data ?? [])} imprimir={rotas.imprimirOrcamento(orcamento.id, 'medicao', m.id)} />
          {podeEditar && m.status === 'aberta' && <Button size="sm" leftIcon={<Lock />} onClick={() => status('fechada')}>Fechar</Button>}
          {podeEditar && m.status === 'fechada' && <><Button size="sm" leftIcon={<LockOpen />} onClick={() => status('aberta')}>Reabrir</Button><Button size="sm" variant="primary" leftIcon={<CheckCheck />} onClick={() => status('aprovada')}>Aprovar</Button></>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Valor deste boletim" value={formatBRL(totalAtual)} highlight />
        <Stat label="Medido anterior" value={formatBRL(somaMoeda(todas.map((l) => l.valor_anterior)))} />
        <Stat label="Acumulado" value={formatBRL(somaMoeda(todas.map((l) => l.valor_anterior)) + totalAtual)} hint={orcamento.total ? `${formatNumero(((somaMoeda(todas.map((l) => l.valor_anterior)) + totalAtual) / orcamento.total) * 100)}% do contrato` : undefined} />
        <Stat label="Saldo do contrato" value={formatBRL(orcamento.total - somaMoeda(todas.map((l) => l.valor_anterior)) - totalAtual)} />
      </div>
      {!aberta && <Alert variant="info" icon={<Lock />}>Medição {LABEL_MEDICAO_STATUS[m.status].toLowerCase()}: quantidades somente leitura.</Alert>}

      <Card flush accent>
        <CardHeader
          eyebrow="Planilha de medição"
          title={`${linhas.length} item(ns)`}
          actions={
            <>
              <label className="flex items-center gap-1.5 text-xs text-fg-muted"><input type="checkbox" className="accent-[rgb(var(--c-primary))]" checked={soMedidos} onChange={(e) => setSoMedidos(e.target.checked)} /> Só medidos no período</label>
              <div className="w-60"><Input size="sm" prefix={<Search />} placeholder="Filtrar itens…" aria-label="Filtrar itens" value={filtro} onChange={(e) => setFiltro(e.target.value)} /></div>
            </>
          }
        />
        <Table density="compact" gridLines stickyHeader containerClassName="max-h-[64vh] rounded-none border-0">
          <THead>
            <Tr>
              <Th rowSpan={2} width={64}>Item</Th>
              <Th rowSpan={2}>Descrição</Th>
              <Th rowSpan={2} width={40}>Und</Th>
              <Th rowSpan={2} numeric width={84}>Preço unit.</Th>
              <Th colSpan={2} className="text-center">Orçado</Th>
              <Th colSpan={3} className="text-center">Quantidades</Th>
              <Th colSpan={3} className="text-center">Valores (R$)</Th>
              <Th rowSpan={2} width={96}>% acum.</Th>
            </Tr>
            <Tr>
              <Th numeric width={80}>Quant.</Th><Th numeric width={96}>Valor</Th>
              <Th numeric width={80}>Anterior</Th><Th numeric width={96} className="text-primary">Período</Th><Th numeric width={80}>Saldo</Th>
              <Th numeric width={92}>Período</Th><Th numeric width={96}>Acumulado</Th><Th numeric width={92}>Saldo</Th>
            </Tr>
          </THead>
          <TBody>
            {grupos.map((g) => (
              <Fragment key={g.id}>
                <Tr group={1}><Td mono>{g.codigo}</Td><Td colSpan={12} className="uppercase">{g.nome}</Td></Tr>
                {g.itens.map((l) => (
                  <Tr key={l.item_id}>
                    <Td mono muted>{l.codigo}</Td>
                    <Td truncate title={l.descricao}>{l.descricao}</Td>
                    <Td muted className="text-xs">{l.unidade}</Td>
                    <Td numeric>{formatMoeda(l.preco_unitario)}</Td>
                    <Td numeric muted>{formatQuantidade(l.quantidade_orcada)}</Td>
                    <Td numeric muted>{formatMoeda(l.valor_orcado)}</Td>
                    <Td numeric>{formatQuantidade(l.quantidade_anterior)}</Td>
                    <Td numeric className={cn('px-0.5', l.quantidade_atual > 0 && 'bg-primary-soft/50')}>
                      {editavel ? (
                        <NumberInput size="sm" aria-label={`Quantidade medida do item ${l.codigo}`} className="!h-5 border-transparent bg-transparent px-1 shadow-none hover:border-border-strong focus:bg-surface" decimals={4} min={0} value={l.quantidade_atual || null} onChange={(v) => onQtd(l, v)} />
                      ) : (
                        formatQuantidade(l.quantidade_atual)
                      )}
                    </Td>
                    <Td numeric className={cn(l.quantidade_saldo < 0 && 'text-danger')}>{formatQuantidade(l.quantidade_saldo)}</Td>
                    <Td numeric className="font-medium">{formatMoeda(l.valor_atual)}</Td>
                    <Td numeric>{formatMoeda(l.valor_acumulado)}</Td>
                    <Td numeric muted>{formatMoeda(l.valor_saldo)}</Td>
                    <Td><span className="flex items-center gap-1.5"><BarraPercentual valor={l.percentual_acumulado} cor={l.percentual_acumulado >= 99.995 ? 'bg-success' : 'bg-brand'} /><span className="num w-9 text-right text-2xs">{formatNumero(l.percentual_acumulado, 0)}%</span></span></Td>
                  </Tr>
                ))}
              </Fragment>
            ))}
          </TBody>
          <TFoot>
            <Tr>
              <Td colSpan={5} className="text-right">Totais {filtro || soMedidos ? '(filtrados)' : ''}</Td>
              <Td numeric>{formatMoeda(tot('valor_orcado'))}</Td>
              <Td colSpan={3} />
              <Td numeric>{formatMoeda(tot('valor_atual'))}</Td>
              <Td numeric>{formatMoeda(tot('valor_acumulado'))}</Td>
              <Td numeric>{formatMoeda(tot('valor_saldo'))}</Td>
              <Td />
            </Tr>
          </TFoot>
        </Table>
      </Card>
      <p className="text-2xs text-fg-subtle"><Rotulo>Regra</Rotulo> valor = round2(quantidade × preço unitário com BDI); o acumulado de todas as medições não pode exceder a quantidade orçada.</p>
    </div>
  );
}
