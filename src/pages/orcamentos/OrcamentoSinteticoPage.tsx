import { useMemo, useState } from 'react';
import { useEtapas, useItens } from '@/api/orcamento/orcamentos';
import { BotoesExportar } from '@/components/orcamento/BotoesExportar';
import { BarraPercentual, ErroCarregamento } from '@/components/orcamento/comum';
import { useOrcamentoContexto } from '@/components/orcamento/contexto';
import { montarEap } from '@/components/orcamento/eap';
import { Card, CardHeader, LoadingBlock, Select, TBody, TFoot, THead, Table, Tabs, Td, Th, Tr } from '@/components/ui';
import { linhasParaExport, useMetaOrcamento } from '@/hooks/orcamento/useMetaOrcamento';
import { formatMoeda, formatNumero, formatPercent, formatQuantidade } from '@/lib/format';
import { tabelaSintetico, tabelaResumo } from '@/lib/export/relatorios';
import { rotas } from '@/routes';

/** Orçamento sintético: resumo por etapa ou planilha sintética com itens. Dono: FRONTEND-2. */
export default function OrcamentoSinteticoPage() {
  const { orcamento } = useOrcamentoContexto();
  const meta = useMetaOrcamento();
  const etapasQ = useEtapas(orcamento.id);
  const itensQ = useItens(orcamento.id);
  const [modo, setModo] = useState<'etapas' | 'itens'>('etapas');
  const [nivelMax, setNivelMax] = useState('3');
  const eap = useMemo(() => montarEap(etapasQ.data ?? [], itensQ.data ?? []), [etapasQ.data, itensQ.data]);

  if (etapasQ.isLoading || itensQ.isLoading) return <LoadingBlock />;
  if (etapasQ.isError || itensQ.isError) return <ErroCarregamento erro={etapasQ.error ?? itensQ.error} />;

  const linhas = eap.linhas.filter((l) => (modo === 'itens' ? true : l.tipo === 'etapa' && l.nivel <= Number(nivelMax)));
  const tabela = () => {
    if (modo === 'itens') return tabelaSintetico(meta, linhasParaExport(eap.linhas), eap);
    return tabelaResumo(
      meta,
      eap.linhas.flatMap((l) => (l.tipo === 'etapa' ? [{ etapa_id: l.id, parent_id: l.etapa.parent_id, codigo: l.codigo, nome: l.etapa.nome, nivel: l.nivel, ordem_path: l.codigo, total_sem_bdi: l.total_sem_bdi, total: l.total, percentual: l.percentual }] : [])),
      eap,
    );
  };

  return (
    <Card flush accent>
      <CardHeader
        eyebrow="Orçamento sintético"
        title={modo === 'etapas' ? 'Resumo por etapa' : 'Planilha sintética'}
        description="Valores com BDI; percentuais sobre o total do orçamento."
        actions={
          <>
            <Tabs size="sm" variant="segmented" aria-label="Detalhamento" value={modo} onChange={setModo} items={[{ value: 'etapas', label: 'Etapas' }, { value: 'itens', label: 'Com itens' }]} />
            {modo === 'etapas' && (
              <div className="w-32"><Select size="sm" aria-label="Níveis" value={nivelMax} onChange={(e) => setNivelMax(e.target.value)} options={[{ value: '1', label: '1º nível' }, { value: '2', label: 'Até 2 níveis' }, { value: '3', label: 'Todos os níveis' }]} /></div>
            )}
            <BotoesExportar tabela={tabela} imprimir={rotas.imprimirOrcamento(orcamento.id, 'sintetico')} />
          </>
        }
      />
      <Table density={modo === 'itens' ? 'compact' : 'default'} gridLines={modo === 'itens'} containerClassName="rounded-none border-0">
        <THead>
          <Tr>
            <Th width={70}>Item</Th>
            {modo === 'itens' && <><Th width={60}>Fonte</Th><Th width={64}>Código</Th></>}
            <Th>Descrição</Th>
            {modo === 'itens' && <><Th width={40}>Und</Th><Th numeric width={96}>Quant.</Th><Th numeric width={92}>Preço unit.</Th></>}
            {modo === 'etapas' && <><Th numeric width={140}>Sem BDI (R$)</Th><Th numeric width={120}>BDI (R$)</Th></>}
            <Th numeric width={140}>Total (R$)</Th>
            <Th numeric width={64}>%</Th>
            {modo === 'etapas' && <Th width={160}><span className="sr-only">Participação</span></Th>}
          </Tr>
        </THead>
        <TBody>
          {linhas.map((l) =>
            l.tipo === 'etapa' ? (
              <Tr key={l.id} group={modo === 'itens' ? (Math.min(l.nivel, 3) as 1 | 2 | 3) : l.nivel === 1 ? 2 : undefined}>
                <Td mono className={l.nivel === 1 ? 'font-semibold' : ''}>{l.codigo}</Td>
                <Td colSpan={modo === 'itens' ? 6 : 1} style={{ paddingLeft: 8 + (l.nivel - 1) * 14 }} className={l.nivel === 1 ? 'font-semibold uppercase' : 'text-fg-muted'}>{l.etapa.nome}</Td>
                {modo === 'etapas' && <><Td numeric muted>{formatMoeda(l.total_sem_bdi)}</Td><Td numeric muted>{formatMoeda(l.total - l.total_sem_bdi)}</Td></>}
                <Td numeric className={l.nivel === 1 ? 'font-semibold' : ''}>{formatMoeda(l.total)}</Td>
                <Td numeric muted className="text-xs">{formatNumero(l.percentual)}</Td>
                {modo === 'etapas' && <Td><BarraPercentual valor={l.percentual} cor={l.nivel === 1 ? 'bg-brand' : 'bg-chart-6'} /></Td>}
              </Tr>
            ) : (
              <Tr key={l.id}>
                <Td mono muted>{l.codigo}</Td>
                <Td className="text-xs text-fg-muted">{l.item.referencia_tipo === 'livre' ? 'LIVRE' : l.item.fonte}</Td>
                <Td mono>{l.item.referencia_codigo ?? '—'}</Td>
                <Td truncate title={l.item.descricao} style={{ paddingLeft: 8 + (l.nivel - 1) * 14 }}>{l.item.descricao}</Td>
                <Td muted className="text-xs">{l.item.unidade}</Td>
                <Td numeric>{formatQuantidade(l.item.quantidade)}</Td>
                <Td numeric>{formatMoeda(l.preco_unitario)}</Td>
                <Td numeric>{formatMoeda(l.total)}</Td>
                <Td numeric muted className="text-xs">{formatNumero(l.percentual)}</Td>
              </Tr>
            ),
          )}
        </TBody>
        <TFoot>
          <Tr>
            <Td colSpan={modo === 'itens' ? 7 : 2} className="text-right">Total do orçamento</Td>
            {modo === 'etapas' && <><Td numeric>{formatMoeda(eap.total_sem_bdi)}</Td><Td numeric>{formatMoeda(eap.total_bdi)}</Td></>}
            <Td numeric className="text-md">{formatMoeda(eap.total)}</Td>
            <Td numeric className="text-xs">100,00</Td>
            {modo === 'etapas' && <Td className="text-xs font-normal text-fg-muted">BDI efetivo {formatPercent(eap.bdi_medio)}</Td>}
          </Tr>
        </TFoot>
      </Table>
    </Card>
  );
}
