import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useCurvaAbcInsumos, useCurvaAbcServicos } from '@/api/orcamento/analises';
import { ParetoChart } from '@/components/charts';
import { BotoesExportar } from '@/components/orcamento/BotoesExportar';
import { ErroCarregamento, Rotulo } from '@/components/orcamento/comum';
import { useOrcamentoContexto } from '@/components/orcamento/contexto';
import { Card, CardHeader, EmptyState, LoadingBlock, Select, TBody, THead, Table, Tabs, Td, Th, Tr } from '@/components/ui';
import { useMetaOrcamento } from '@/hooks/orcamento/useMetaOrcamento';
import { somaMoeda } from '@/lib/calc';
import { cn } from '@/lib/cn';
import { formatBRL, formatMoeda, formatNumero, formatQuantidade } from '@/lib/format';
import { LABEL_INSUMO_TIPO, opcoes } from '@/lib/labels';
import { BG_CLASSE_ABC } from '@/lib/labels-orcamento';
import { tabelaAbcInsumos, tabelaAbcServicos } from '@/lib/export/relatorios';
import { rotas } from '@/routes';
import type { ClasseAbc, InsumoTipo } from '@/types/database';

interface LinhaComum {
  key: string;
  posicao: number;
  codigo: string;
  item?: string;
  descricao: string;
  tipo?: InsumoTipo | null;
  unidade: string;
  quantidade: number;
  preco_unitario: number;
  total: number;
  percentual: number;
  percentual_acumulado: number;
  classe: ClasseAbc;
}

const DESC_CLASSE: Record<ClasseAbc, string> = { A: 'até 80% do valor', B: '80% a 95%', C: '95% a 100%' };

/** Curva ABC de serviços e de insumos (tabela + Pareto). Dono: FRONTEND-2. */
export default function OrcamentoCurvaAbcPage() {
  const { orcamento } = useOrcamentoContexto();
  const meta = useMetaOrcamento();
  const [aba, setAba] = useState<'servicos' | 'insumos'>('servicos');
  const [classe, setClasse] = useState<ClasseAbc | ''>('');
  const [tipo, setTipo] = useState<InsumoTipo | ''>('');
  const serv = useCurvaAbcServicos(aba === 'servicos' ? orcamento.id : undefined);
  const ins = useCurvaAbcInsumos(aba === 'insumos' ? orcamento.id : undefined);
  const q = aba === 'servicos' ? serv : ins;

  const linhas = useMemo<LinhaComum[]>(() => {
    if (aba === 'servicos')
      return (serv.data ?? []).map((l) => ({ key: l.item_id, posicao: l.posicao, codigo: l.referencia_codigo ?? '—', item: l.codigo, descricao: l.descricao, unidade: l.unidade, quantidade: l.quantidade, preco_unitario: l.preco_unitario, total: l.total, percentual: l.percentual, percentual_acumulado: l.percentual_acumulado, classe: l.classe }));
    return (ins.data ?? []).map((l) => ({ key: `${l.insumo_id ?? l.codigo}-${l.posicao}`, posicao: l.posicao, codigo: l.codigo, descricao: l.descricao, tipo: l.insumo_tipo, unidade: l.unidade, quantidade: l.quantidade, preco_unitario: l.preco_unitario, total: l.total, percentual: l.percentual, percentual_acumulado: l.percentual_acumulado, classe: l.classe }));
  }, [aba, serv.data, ins.data]);

  const resumo = useMemo(() => {
    const total = somaMoeda(linhas.map((l) => l.total));
    return (['A', 'B', 'C'] as ClasseAbc[]).map((c) => {
      const ls = linhas.filter((l) => l.classe === c);
      const v = somaMoeda(ls.map((l) => l.total));
      return { classe: c, n: ls.length, valor: v, pct: total ? (v / total) * 100 : 0, pctItens: linhas.length ? (ls.length / linhas.length) * 100 : 0 };
    });
  }, [linhas]);

  const filtradas = linhas.filter((l) => (!classe || l.classe === classe) && (!tipo || l.tipo === tipo));
  const tabela = () => (aba === 'servicos' ? tabelaAbcServicos(meta, serv.data ?? []) : tabelaAbcInsumos(meta, ins.data ?? []));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs aria-label="Curva" value={aba} onChange={(v) => { setAba(v); setTipo(''); }} variant="segmented" items={[{ value: 'servicos', label: 'Serviços (com BDI)' }, { value: 'insumos', label: 'Insumos (custo direto)' }]} />
        <span className="text-xs text-fg-subtle">{aba === 'servicos' ? 'Itens do orçamento ordenados pelo total com BDI.' : 'Composições explodidas recursivamente até os insumos (§8.4).'}</span>
        <div className="ml-auto">
          <BotoesExportar tabela={tabela} disabled={!linhas.length} imprimir={rotas.imprimirOrcamento(orcamento.id, aba === 'servicos' ? 'curva-abc-servicos' : 'curva-abc-insumos')} />
        </div>
      </div>

      {q.isLoading ? (
        <LoadingBlock label="Calculando curva ABC…" />
      ) : q.isError ? (
        <ErroCarregamento erro={q.error} onRetry={() => void q.refetch()} />
      ) : linhas.length === 0 ? (
        <EmptyState icon={<BarChart3 />} title="Curva ABC vazia" description="Adicione itens com quantidade e preço ao orçamento." />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {resumo.map((r) => (
              <button key={r.classe} type="button" aria-pressed={classe === r.classe} onClick={() => setClasse(classe === r.classe ? '' : r.classe)}
                className={cn('corner-marks relative rounded border bg-surface p-3 text-left shadow-xs transition-colors hover:border-border-strong', classe === r.classe ? 'border-brand ring-1 ring-brand/30' : 'border-border')}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className={cn('flex h-6 w-6 items-center justify-center rounded-sm font-display text-md font-bold', BG_CLASSE_ABC[r.classe], 'text-accent-fg')}>{r.classe}</span>
                    <Rotulo>Classe {r.classe} · {DESC_CLASSE[r.classe]}</Rotulo>
                  </span>
                  <span className="num text-xs text-fg-muted">{r.n} {aba === 'servicos' ? 'itens' : 'insumos'} ({formatNumero(r.pctItens, 1)}%)</span>
                </div>
                <div className="num mt-2 text-xl font-semibold">{formatBRL(r.valor)}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-sunken"><span className={cn('block h-full', BG_CLASSE_ABC[r.classe])} style={{ width: `${r.pct}%` }} /></span>
                  <span className="num text-xs">{formatNumero(r.pct)}%</span>
                </div>
              </button>
            ))}
          </div>

          <Card flush>
            <CardHeader eyebrow="Pareto" title={aba === 'servicos' ? 'Participação dos serviços' : 'Participação dos insumos'} />
            <div className="p-4">
              <ParetoChart dados={linhas.map((l) => ({ posicao: l.posicao, rotulo: l.item ?? l.codigo, descricao: l.descricao, total: l.total, percentual: l.percentual, percentual_acumulado: l.percentual_acumulado, classe: l.classe }))} />
            </div>
          </Card>

          <Card flush accent>
            <CardHeader
              eyebrow="Tabela"
              title={`${filtradas.length} de ${linhas.length} ${aba === 'servicos' ? 'serviços' : 'insumos'}`}
              actions={
                <>
                  {aba === 'insumos' && <div className="w-40"><Select size="sm" aria-label="Tipo de insumo" value={tipo} onChange={(e) => setTipo(e.target.value as InsumoTipo | '')} placeholder="Todos os tipos" options={opcoes(LABEL_INSUMO_TIPO)} /></div>}
                  <div className="w-36"><Select size="sm" aria-label="Classe" value={classe} onChange={(e) => setClasse(e.target.value as ClasseAbc | '')} placeholder="Todas as classes" options={[{ value: 'A', label: 'Classe A' }, { value: 'B', label: 'Classe B' }, { value: 'C', label: 'Classe C' }]} /></div>
                </>
              }
            />
            <Table density="compact" gridLines stickyHeader containerClassName="max-h-[60vh] rounded-none border-0">
              <THead>
                <Tr>
                  <Th numeric width={44}>Pos.</Th>
                  {aba === 'servicos' && <Th width={64}>Item</Th>}
                  <Th width={70}>Código</Th>
                  <Th>Descrição</Th>
                  {aba === 'insumos' && <Th width={96}>Tipo</Th>}
                  <Th width={40}>Und</Th>
                  <Th numeric width={110}>Quant.</Th>
                  <Th numeric width={96}>Preço unit.</Th>
                  <Th numeric width={120}>Total (R$)</Th>
                  <Th numeric width={60}>%</Th>
                  <Th numeric width={70}>% acum.</Th>
                  <Th width={52}>Classe</Th>
                </Tr>
              </THead>
              <TBody>
                {filtradas.map((l) => (
                  <Tr key={l.key}>
                    <Td numeric muted>{l.posicao}</Td>
                    {aba === 'servicos' && <Td mono muted>{l.item}</Td>}
                    <Td mono>{l.codigo}</Td>
                    <Td truncate title={l.descricao}>{l.descricao}</Td>
                    {aba === 'insumos' && <Td muted className="text-xs">{l.tipo ? LABEL_INSUMO_TIPO[l.tipo] : '—'}</Td>}
                    <Td muted className="text-xs">{l.unidade}</Td>
                    <Td numeric>{formatQuantidade(l.quantidade)}</Td>
                    <Td numeric>{formatMoeda(l.preco_unitario)}</Td>
                    <Td numeric className="font-medium">{formatMoeda(l.total)}</Td>
                    <Td numeric>{formatNumero(l.percentual)}</Td>
                    <Td numeric className="relative">
                      <span aria-hidden className={cn('absolute inset-y-1 left-0 opacity-25', BG_CLASSE_ABC[l.classe])} style={{ width: `${Math.min(100, l.percentual_acumulado)}%` }} />
                      <span className="relative">{formatNumero(l.percentual_acumulado)}</span>
                    </Td>
                    <Td className="text-center">
                      <span className={cn('inline-flex h-4 w-5 items-center justify-center rounded-xs text-2xs font-bold', BG_CLASSE_ABC[l.classe], 'text-accent-fg')}>{l.classe}</span>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
