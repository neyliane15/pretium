import { useState } from 'react';
import { BarChart3, CalendarRange, ClipboardCheck, FileSpreadsheet, FileText, Layers, ListTree, Package, Printer, Ruler } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useMedicoes } from '@/api/orcamento/analises';
import { useEtapas, useItens } from '@/api/orcamento/orcamentos';
import { useOrcamentoContexto } from '@/components/orcamento/contexto';
import { montarEap } from '@/components/orcamento/eap';
import { Button, Card, CardHeader, Select, useToast } from '@/components/ui';
import { linhasParaExport, useMetaOrcamento } from '@/hooks/orcamento/useMetaOrcamento';
import { buscarTodas, ok } from '@/api/orcamento/util';
import { baixarCsv } from '@/lib/export/csv';
import {
  montarGradeCronograma, tabelaAbcInsumos, tabelaAbcServicos, tabelaAnalitico, tabelaCronograma, tabelaMedicao, tabelaSintetico,
} from '@/lib/export/relatorios';
import type { TabelaExport } from '@/lib/export/tabela';
import { baixarXlsx } from '@/lib/export/xlsx';
import { mensagemErro } from '@/lib/supabase';
import { rotas, type RelatorioOrcamento } from '@/routes';
import type { ComposicaoAnaliticaLinha } from '@/types/database';

type Gerador = () => Promise<TabelaExport>;

/** Central de relatórios: impressão A4 e exportação CSV/XLSX. Dono: FRONTEND-2. */
export default function OrcamentoRelatoriosPage() {
  const { orcamento } = useOrcamentoContexto();
  const toast = useToast();
  const meta = useMetaOrcamento();
  const etapas = useEtapas(orcamento.id);
  const itens = useItens(orcamento.id);
  const medicoes = useMedicoes(orcamento.id);
  const [medicao, setMedicao] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const id = orcamento.id;

  const eap = () => montarEap(etapas.data ?? [], itens.data ?? []);
  const analiticas = async (): Promise<Map<string, ComposicaoAnaliticaLinha[]>> => {
    const ids = [...new Set((itens.data ?? []).flatMap((i) => (i.composicao_id ? [i.composicao_id] : [])))];
    const m = new Map<string, ComposicaoAnaliticaLinha[]>();
    for (const c of ids) m.set(c, ok(await supabase.rpc('fn_composicao_analitica', { p_composicao_id: c, p_data_base_id: orcamento.data_base_id, p_orcamento_id: id })) ?? []);
    return m;
  };

  const ger: Partial<Record<RelatorioOrcamento, Gerador>> = {
    sintetico: async () => { const e = eap(); return tabelaSintetico(meta, linhasParaExport(e.linhas), e); },
    analitico: async () => {
      const e = eap();
      const an = await analiticas();
      const porItem = new Map((itens.data ?? []).flatMap((i) => (i.composicao_id ? [[i.id, an.get(i.composicao_id) ?? []] as const] : [])));
      return tabelaAnalitico(meta, linhasParaExport(e.linhas), porItem, e);
    },
    'curva-abc-servicos': async () => tabelaAbcServicos(meta, await buscarTodas((de, ate) => supabase.rpc('fn_curva_abc_servicos', { p_orcamento_id: id }).range(de, ate))),
    'curva-abc-insumos': async () => tabelaAbcInsumos(meta, await buscarTodas((de, ate) => supabase.rpc('fn_curva_abc_insumos', { p_orcamento_id: id }).range(de, ate))),
    cronograma: async () => tabelaCronograma(meta, montarGradeCronograma(await buscarTodas((de, ate) => supabase.rpc('fn_cronograma_fisico_financeiro', { p_orcamento_id: id }).range(de, ate)))),
    medicao: async () => {
      const m = (medicoes.data ?? []).find((x) => x.id === medicao);
      if (!m) throw new Error('Selecione a medição');
      return tabelaMedicao(meta, m.numero, await buscarTodas((de, ate) => supabase.rpc('fn_medicao_resumo', { p_medicao_id: m.id }).range(de, ate)));
    },
  };

  const exportar = async (chave: string, geradores: Gerador[], formato: 'xlsx' | 'csv', arquivo?: string) => {
    setOcupado(chave + formato);
    try {
      const ts = await Promise.all(geradores.map((g) => g()));
      if (formato === 'csv') ts.forEach(baixarCsv);
      else baixarXlsx(ts, arquivo);
    } catch (e) {
      toast.error('Não foi possível exportar', mensagemErro(e));
    } finally {
      setOcupado(null);
    }
  };

  const RELS: { chave: RelatorioOrcamento; titulo: string; desc: string; icon: React.ReactNode; paisagem?: boolean }[] = [
    { chave: 'sintetico', titulo: 'Orçamento sintético', desc: 'EAP com itens, quantidades, preços com BDI e totais por etapa.', icon: <FileText /> },
    { chave: 'analitico', titulo: 'Orçamento analítico', desc: 'Cada serviço com insumos e coeficientes da composição.', icon: <ListTree /> },
    { chave: 'composicoes', titulo: 'Composições de custo unitário', desc: 'Fichas das composições usadas, uma por bloco.', icon: <Layers /> },
    { chave: 'curva-abc-servicos', titulo: 'Curva ABC de serviços', desc: 'Serviços por relevância no valor total (A/B/C).', icon: <BarChart3 /> },
    { chave: 'curva-abc-insumos', titulo: 'Curva ABC de insumos', desc: 'Insumos explodidos das composições, para compras.', icon: <Package /> },
    { chave: 'cronograma', titulo: 'Cronograma físico-financeiro', desc: 'Grade por período e curva S (A4 paisagem).', icon: <CalendarRange />, paisagem: true },
    { chave: 'memoria', titulo: 'Memória de cálculo', desc: 'Quantitativos com expressões e locais de medição.', icon: <Ruler /> },
  ];

  const pronto = !etapas.isLoading && !itens.isLoading;

  return (
    <div className="space-y-4">
      <Card flush accent>
        <CardHeader
          eyebrow="Exportação"
          title="Pasta de trabalho completa"
          description="Sintético, analítico, curvas ABC e cronograma em abas de um único arquivo .xlsx (números como números, formato pt-BR)."
          actions={
            <Button variant="primary" leftIcon={<FileSpreadsheet />} disabled={!pronto} loading={ocupado === 'tudoxlsx'}
              onClick={() => void exportar('tudo', [ger.sintetico!, ger.analitico!, ger['curva-abc-servicos']!, ger['curva-abc-insumos']!, ger.cronograma!], 'xlsx', `${orcamento.codigo ?? ''} ${orcamento.nome} v${orcamento.versao}`)}>
              Baixar .xlsx completo
            </Button>
          }
        />
      </Card>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {RELS.map((r) => (
          <Card key={r.chave} className="flex flex-col" cornerMarks>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-surface-2 text-brand [&_svg]:h-4 [&_svg]:w-4">{r.icon}</span>
              <div className="min-w-0">
                <h3 className="font-display text-md font-semibold">{r.titulo}</h3>
                <p className="mt-0.5 text-xs text-fg-muted">{r.desc}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-grid pt-3">
              <Button size="sm" leftIcon={<Printer />} onClick={() => window.open(rotas.imprimirOrcamento(id, r.chave), '_blank')}>Imprimir / PDF</Button>
              {ger[r.chave] && (
                <>
                  <Button size="sm" variant="ghost" disabled={!pronto} loading={ocupado === r.chave + 'xlsx'} onClick={() => void exportar(r.chave, [ger[r.chave]!], 'xlsx')}>XLSX</Button>
                  <Button size="sm" variant="ghost" disabled={!pronto} loading={ocupado === r.chave + 'csv'} onClick={() => void exportar(r.chave, [ger[r.chave]!], 'csv')}>CSV</Button>
                </>
              )}
              {r.paisagem && <span className="ml-auto font-mono text-2xs uppercase text-fg-subtle">A4 paisagem</span>}
            </div>
          </Card>
        ))}
        <Card className="flex flex-col" cornerMarks>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-surface-2 text-brand"><ClipboardCheck className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-md font-semibold">Boletim de medição</h3>
              <p className="mt-0.5 text-xs text-fg-muted">Quantidades do período, acumulado e saldo, com campos de assinatura.</p>
              <div className="mt-2"><Select size="sm" aria-label="Medição" value={medicao} onChange={(e) => setMedicao(e.target.value)} placeholder={medicoes.data?.length ? 'Selecione a medição…' : 'Nenhuma medição'} options={(medicoes.data ?? []).map((m) => ({ value: m.id, label: `Medição nº ${m.numero}` }))} /></div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-grid pt-3">
            <Button size="sm" leftIcon={<Printer />} disabled={!medicao} onClick={() => window.open(rotas.imprimirOrcamento(id, 'medicao', medicao), '_blank')}>Imprimir / PDF</Button>
            <Button size="sm" variant="ghost" disabled={!medicao} loading={ocupado === 'medicaoxlsx'} onClick={() => void exportar('medicao', [ger.medicao!], 'xlsx')}>XLSX</Button>
            <Button size="sm" variant="ghost" disabled={!medicao} loading={ocupado === 'medicaocsv'} onClick={() => void exportar('medicao', [ger.medicao!], 'csv')}>CSV</Button>
          </div>
        </Card>
      </div>
      <p className="text-xs text-fg-subtle">CSV: separador “;”, vírgula decimal e UTF-8 com BOM (abre direto no Excel pt-BR). PDF: use “Salvar como PDF” no diálogo de impressão do navegador.</p>
    </div>
  );
}
