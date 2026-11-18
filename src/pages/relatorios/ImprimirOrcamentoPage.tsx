import { Fragment, useEffect, useMemo, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useObra } from '@/api/core/obras';
import {
  useCronogramaFisicoFinanceiro, useCurvaAbcInsumos, useCurvaAbcServicos, useMedicao, useMedicaoResumo,
} from '@/api/orcamento/analises';
import { useBdis, useEtapas, useItens, useMemoriasOrcamento, useOrcamento } from '@/api/orcamento/orcamentos';
import { useAnaliticasOrcamento } from '@/api/orcamento/referencias';
import { CurvaSChart } from '@/components/charts';
import { ErroCarregamento } from '@/components/orcamento/comum';
import { montarEap, type EapMontada } from '@/components/orcamento/eap';
import type { OrcamentoEtapa, OrcamentoItem } from '@/types/database';
import { DocumentoImpressao, type CabecalhoDoc } from '@/components/relatorios/DocumentoImpressao';
import { Button, LoadingBlock, Select } from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { custoComposicao, somaMoeda } from '@/lib/calc';
import { montarGradeCronograma } from '@/lib/export/relatorios';
import { formatCoeficiente, formatData, formatMesAbrev, formatMoeda, formatNumero, formatQuantidade, parseIsoDate } from '@/lib/format';
import { LABEL_INSUMO_TIPO, LABEL_MEDICAO_STATUS } from '@/lib/labels';
import { rotas, type RelatorioOrcamento } from '@/routes';

const TITULOS: Record<RelatorioOrcamento, string> = {
  sintetico: 'Orçamento sintético',
  analitico: 'Orçamento analítico',
  composicoes: 'Composições de custo unitário',
  'curva-abc-servicos': 'Curva ABC de serviços',
  'curva-abc-insumos': 'Curva ABC de insumos',
  cronograma: 'Cronograma físico-financeiro',
  memoria: 'Memória de cálculo de quantitativos',
  medicao: 'Boletim de medição',
};

/** Rota de impressão A4 (fora do AppShell). PDF = "Salvar como PDF". Dono: FRONTEND-2. */
export default function ImprimirOrcamentoPage() {
  const { orcamentoId = '', relatorio = 'sintetico' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const rel = (relatorio in TITULOS ? relatorio : 'sintetico') as RelatorioOrcamento;
  const { organizacao } = useOrganizacao();
  const orc = useOrcamento(orcamentoId);
  const obra = useObra(orc.data?.obra_id);
  const bdis = useBdis(orcamentoId);
  const etapas = useEtapas(orcamentoId);
  const itens = useItens(orcamentoId);
  const eap = useMemo(() => montarEap(etapas.data ?? [], itens.data ?? []), [etapas.data, itens.data]);

  useEffect(() => {
    document.title = `${TITULOS[rel]} – ${orc.data?.nome ?? 'Pretium'}`;
  }, [rel, orc.data?.nome]);

  if (orc.isLoading || etapas.isLoading || itens.isLoading) return <LoadingBlock className="min-h-screen" label="Preparando relatório…" />;
  if (orc.isError || !orc.data) return <div className="p-8"><ErroCarregamento erro={orc.error} /></div>;
  const o = orc.data;
  const ob = obra.data;
  const padrao = (bdis.data ?? []).find((b) => b.is_padrao);
  const cab: CabecalhoDoc = {
    organizacao,
    titulo: TITULOS[rel],
    subtitulo: o.obra?.nome,
    obra: ob ? {
      nome: ob.nome, codigo: ob.codigo, cliente: ob.cliente?.nome, responsavel: ob.responsavel_tecnico, crea: ob.crea_cau, art: ob.art_rrt,
      endereco: [ob.logradouro && `${ob.logradouro}${ob.numero ? ', ' + ob.numero : ''}`, ob.bairro, ob.municipio && `${ob.municipio}/${ob.uf}`].filter(Boolean).join(' · ') || null,
    } : null,
    orcamento: { nome: o.nome, codigo: o.codigo, versao: o.versao, data: o.data_orcamento },
    dataBase: o.data_base,
    bdi: padrao?.bdi ?? null,
  };

  return (
    <div className="rel-tela">
      <div className="no-print fixed inset-x-0 top-0 z-10 flex h-12 items-center gap-3 border-b border-border bg-surface px-4 shadow-xs">
        <Link to={rotas.orcamentoRelatorios(o.id)} className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> Voltar ao orçamento</Link>
        <div className="w-64">
          <Select size="sm" aria-label="Relatório" value={rel} onChange={(e) => navigate(rotas.imprimirOrcamento(o.id, e.target.value as RelatorioOrcamento, params.get('medicao') ?? undefined))}
            options={(Object.keys(TITULOS) as RelatorioOrcamento[]).filter((k) => k !== 'medicao' || params.get('medicao')).map((k) => ({ value: k, label: TITULOS[k] }))} />
        </div>
        <span className="text-xs text-fg-subtle">A4 {rel === 'cronograma' ? 'paisagem' : 'retrato'} · use “Salvar como PDF” no diálogo de impressão</span>
        <Button className="ml-auto" variant="primary" leftIcon={<Printer />} onClick={() => window.print()}>Imprimir / PDF</Button>
      </div>
      <DocumentoImpressao cab={cab} paisagem={rel === 'cronograma'}>
        {rel === 'sintetico' && <RelSintetico eap={eap} />}
        {rel === 'analitico' && <RelAnalitico eap={eap} dataBaseId={o.data_base_id} orcamentoId={o.id} />}
        {rel === 'composicoes' && <RelComposicoes eap={eap} dataBaseId={o.data_base_id} orcamentoId={o.id} />}
        {rel === 'curva-abc-servicos' && <RelAbcServicos orcamentoId={o.id} />}
        {rel === 'curva-abc-insumos' && <RelAbcInsumos orcamentoId={o.id} />}
        {rel === 'cronograma' && <RelCronograma orcamentoId={o.id} />}
        {rel === 'memoria' && <RelMemoria eap={eap} orcamentoId={o.id} />}
        {rel === 'medicao' && <RelMedicao medicaoId={params.get('medicao') ?? ''} />}
        {o.observacoes && (rel === 'sintetico' || rel === 'analitico') && (
          <div className="rel-bloco" style={{ marginTop: '5mm' }}>
            <div className="rel-eyebrow">Observações</div>
            <p style={{ whiteSpace: 'pre-line', marginTop: '1mm' }}>{o.observacoes}</p>
          </div>
        )}
      </DocumentoImpressao>
    </div>
  );
}

type Eap = EapMontada<OrcamentoEtapa, OrcamentoItem>;

function Totais({ eap, colSpan, depois = 0 }: { eap: Eap; colSpan: number; depois?: number }) {
  const resto = depois > 0 ? <td colSpan={depois} /> : null;
  return (
    <tfoot>
      <tr><td colSpan={colSpan} className="n">Total sem BDI</td><td className="n">{formatMoeda(eap.total_sem_bdi)}</td>{resto}</tr>
      <tr><td colSpan={colSpan} className="n">BDI</td><td className="n">{formatMoeda(eap.total_bdi)}</td>{resto}</tr>
      <tr className="destaque"><td colSpan={colSpan} className="n">Total com BDI</td><td className="n">{formatMoeda(eap.total)}</td>{resto}</tr>
    </tfoot>
  );
}

function RelSintetico({ eap }: { eap: Eap }) {
  return (
    <table className="rel-tbl">
      <thead><tr><th>Item</th><th>Fonte</th><th>Código</th><th>Descrição</th><th>Und</th><th className="n">Quant.</th><th className="n">Custo unit.</th><th className="n">Preço unit.</th><th className="n">Total (R$)</th><th className="n">%</th></tr></thead>
      <tbody>
        {eap.linhas.map((l) =>
          l.tipo === 'etapa' ? (
            <tr key={l.id} className={`g${Math.min(l.nivel, 3)}`}><td className="m">{l.codigo}</td><td colSpan={7}>{l.etapa.nome}</td><td className="n">{formatMoeda(l.total)}</td><td className="n">{formatNumero(l.percentual)}</td></tr>
          ) : (
            <tr key={l.id}>
              <td className="m">{l.codigo}</td><td>{l.item.referencia_tipo === 'livre' ? 'Livre' : l.item.fonte}</td><td className="m">{l.item.referencia_codigo ?? '—'}</td>
              <td>{l.item.descricao}</td><td>{l.item.unidade}</td><td className="n">{formatQuantidade(l.item.quantidade)}</td>
              <td className="n">{formatMoeda(l.item.custo_unitario)}</td><td className="n">{formatMoeda(l.preco_unitario)}</td><td className="n">{formatMoeda(l.total)}</td><td className="n">{formatNumero(l.percentual)}</td>
            </tr>
          ),
        )}
      </tbody>
      <Totais eap={eap} colSpan={8} depois={1} />
    </table>
  );
}

function RelAnalitico({ eap, dataBaseId, orcamentoId }: { eap: Eap; dataBaseId: string; orcamentoId: string }) {
  const ids = eap.linhas.flatMap((l) => (l.tipo === 'item' && l.item.composicao_id ? [l.item.composicao_id] : []));
  const an = useAnaliticasOrcamento(ids, dataBaseId, orcamentoId);
  if (an.isLoading) return <LoadingBlock label="Carregando composições…" />;
  return (
    <table className="rel-tbl">
      <thead><tr><th>Item</th><th>Código</th><th>Descrição</th><th>Und</th><th className="n">Coef./Quant.</th><th className="n">Custo unit.</th><th className="n">Parcial</th><th className="n">Preço unit.</th><th className="n">Total (R$)</th></tr></thead>
      <tbody>
        {eap.linhas.map((l) =>
          l.tipo === 'etapa' ? (
            <tr key={l.id} className={`g${Math.min(l.nivel, 3)}`}><td className="m">{l.codigo}</td><td colSpan={7}>{l.etapa.nome}</td><td className="n">{formatMoeda(l.total)}</td></tr>
          ) : (
            <Fragment key={l.id}>
              <tr className="g3">
                <td className="m">{l.codigo}</td><td className="m">{l.item.referencia_codigo ?? '—'}</td><td>{l.item.descricao}</td><td>{l.item.unidade}</td>
                <td className="n">{formatQuantidade(l.item.quantidade)}</td><td className="n">{formatMoeda(l.item.custo_unitario)}</td><td />
                <td className="n">{formatMoeda(l.preco_unitario)}</td><td className="n">{formatMoeda(l.total)}</td>
              </tr>
              {(l.item.composicao_id ? an.data?.get(l.item.composicao_id) ?? [] : []).map((c) => (
                <tr key={c.item_id} className="sub">
                  <td /><td className="m">{c.codigo}</td>
                  <td style={{ paddingLeft: '4mm' }}>{c.tipo_item === 'composicao' ? 'COMP. ' : c.insumo_tipo ? `${LABEL_INSUMO_TIPO[c.insumo_tipo].toUpperCase()} · ` : ''}{c.descricao}</td>
                  <td>{c.unidade}</td><td className="n">{formatCoeficiente(c.coeficiente)}</td><td className="n">{formatMoeda(c.preco_unitario)}</td><td className="n">{formatMoeda(c.custo_parcial)}</td><td /><td />
                </tr>
              ))}
            </Fragment>
          ),
        )}
      </tbody>
      <Totais eap={eap} colSpan={8} />
    </table>
  );
}

function RelComposicoes({ eap, dataBaseId, orcamentoId }: { eap: Eap; dataBaseId: string; orcamentoId: string }) {
  const comps = new Map<string, { codigo: string; descricao: string; unidade: string; itens: string[] }>();
  for (const l of eap.linhas) {
    if (l.tipo !== 'item' || !l.item.composicao_id) continue;
    const c = comps.get(l.item.composicao_id) ?? { codigo: l.item.referencia_codigo ?? '', descricao: l.item.descricao, unidade: l.item.unidade, itens: [] };
    c.itens.push(l.codigo);
    comps.set(l.item.composicao_id, c);
  }
  const an = useAnaliticasOrcamento([...comps.keys()], dataBaseId, orcamentoId);
  if (an.isLoading) return <LoadingBlock label="Carregando composições…" />;
  return (
    <>
      {[...comps].sort((a, b) => a[1].codigo.localeCompare(b[1].codigo, 'pt-BR', { numeric: true })).map(([id, c]) => {
        const linhas = an.data?.get(id) ?? [];
        return (
          <section key={id} className="rel-bloco">
            <h2 className="rel-secao"><span className="m">{c.codigo}</span>{c.descricao}<span className="m">· {c.unidade} · itens {c.itens.join(', ')}</span></h2>
            <table className="rel-tbl">
              <thead><tr><th>Tipo</th><th>Código</th><th>Descrição</th><th>Und</th><th className="n">Coeficiente</th><th className="n">Preço unit.</th><th className="n">Parcial</th></tr></thead>
              <tbody>
                {linhas.map((x) => (
                  <tr key={x.item_id}><td>{x.tipo_item === 'composicao' ? 'Composição' : x.insumo_tipo ? LABEL_INSUMO_TIPO[x.insumo_tipo] : 'Insumo'}</td><td className="m">{x.codigo}</td><td>{x.descricao}</td><td>{x.unidade}</td>
                    <td className="n">{formatCoeficiente(x.coeficiente)}</td><td className="n">{formatMoeda(x.preco_unitario)}</td><td className="n">{formatMoeda(x.custo_parcial)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={6} className="n">Custo unitário</td><td className="n">{formatMoeda(custoComposicao(linhas.map((x) => ({ coeficiente: x.coeficiente, preco: x.preco_unitario }))))}</td></tr></tfoot>
            </table>
          </section>
        );
      })}
    </>
  );
}

function TabelaAbc({ cabecalho, linhas }: { cabecalho: ReactNode; linhas: ReactNode }) {
  return <table className="rel-tbl"><thead>{cabecalho}</thead><tbody>{linhas}</tbody></table>;
}

function RelAbcServicos({ orcamentoId }: { orcamentoId: string }) {
  const q = useCurvaAbcServicos(orcamentoId);
  if (q.isLoading) return <LoadingBlock />;
  const ls = q.data ?? [];
  return (
    <TabelaAbc
      cabecalho={<tr><th className="n">Pos.</th><th>Item</th><th>Código</th><th>Descrição</th><th>Und</th><th className="n">Quant.</th><th className="n">Preço unit.</th><th className="n">Total (R$)</th><th className="n">%</th><th className="n">% acum.</th><th>Cl.</th></tr>}
      linhas={ls.map((l) => (
        <tr key={l.item_id}><td className="n">{l.posicao}</td><td className="m">{l.codigo}</td><td className="m">{l.referencia_codigo ?? '—'}</td><td>{l.descricao}</td><td>{l.unidade}</td><td className="n">{formatQuantidade(l.quantidade)}</td>
          <td className="n">{formatMoeda(l.preco_unitario)}</td><td className="n">{formatMoeda(l.total)}</td><td className="n">{formatNumero(l.percentual)}</td><td className="n">{formatNumero(l.percentual_acumulado)}</td><td className="m" style={{ fontWeight: 700 }}>{l.classe}</td></tr>
      ))}
    />
  );
}

function RelAbcInsumos({ orcamentoId }: { orcamentoId: string }) {
  const q = useCurvaAbcInsumos(orcamentoId);
  if (q.isLoading) return <LoadingBlock />;
  return (
    <TabelaAbc
      cabecalho={<tr><th className="n">Pos.</th><th>Código</th><th>Descrição</th><th>Tipo</th><th>Und</th><th className="n">Quant.</th><th className="n">Preço unit.</th><th className="n">Total (R$)</th><th className="n">%</th><th className="n">% acum.</th><th>Cl.</th></tr>}
      linhas={(q.data ?? []).map((l) => (
        <tr key={`${l.insumo_id}-${l.posicao}`}><td className="n">{l.posicao}</td><td className="m">{l.codigo}</td><td>{l.descricao}</td><td>{l.insumo_tipo ? LABEL_INSUMO_TIPO[l.insumo_tipo] : '—'}</td><td>{l.unidade}</td><td className="n">{formatQuantidade(l.quantidade)}</td>
          <td className="n">{formatMoeda(l.preco_unitario)}</td><td className="n">{formatMoeda(l.total)}</td><td className="n">{formatNumero(l.percentual)}</td><td className="n">{formatNumero(l.percentual_acumulado)}</td><td className="m" style={{ fontWeight: 700 }}>{l.classe}</td></tr>
      ))}
    />
  );
}

function RelCronograma({ orcamentoId }: { orcamentoId: string }) {
  const q = useCronogramaFisicoFinanceiro(orcamentoId);
  const g = useMemo(() => montarGradeCronograma(q.data ?? []), [q.data]);
  if (q.isLoading) return <LoadingBlock />;
  if (!g.periodos.length) return <p>Cronograma não cadastrado.</p>;
  const rot = (iso: string) => formatMesAbrev(parseIsoDate(iso).getFullYear(), parseIsoDate(iso).getMonth() + 1);
  return (
    <>
      <table className="rel-tbl" style={{ fontSize: g.periodos.length > 10 ? '6.4pt' : undefined }}>
        <thead>
          <tr><th>Item</th><th>Etapa</th><th className="n">Total (R$)</th>{g.periodos.map((p) => <th key={p.periodo} className="n">P{p.periodo}<br />{rot(p.inicio)}</th>)}</tr>
        </thead>
        <tbody>
          {g.etapas.map((e) => (
            <Fragment key={e.etapa_id}>
              <tr><td className="m">{e.codigo}</td><td>{e.nome}</td><td className="n">{formatMoeda(e.total)}</td>{g.periodos.map((p) => { const c = e.celulas.get(p.periodo); return <td key={p.periodo} className="n" style={c?.percentual ? { background: '#fdece0' } : undefined}>{c?.percentual ? `${formatNumero(c.percentual)}%` : ''}</td>; })}</tr>
              <tr className="sub"><td /><td /><td />{g.periodos.map((p) => { const c = e.celulas.get(p.periodo); return <td key={p.periodo} className="n">{c?.valor ? formatMoeda(c.valor) : ''}</td>; })}</tr>
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={2}>Total do período</td><td className="n">{formatMoeda(g.total)}</td>{g.totaisPeriodo.map((t, i) => <td key={i} className="n">{formatMoeda(t.valor)}</td>)}</tr>
          <tr><td colSpan={3}>Acumulado (R$ · %)</td>{g.totaisPeriodo.map((t, i) => <td key={i} className="n">{formatMoeda(t.acumulado)}<br />{formatNumero(t.percentualAcumulado)}%</td>)}</tr>
        </tfoot>
      </table>
      <div className="rel-bloco" style={{ marginTop: '4mm' }}>
        <div className="rel-eyebrow" style={{ marginBottom: '1mm' }}>Curva S</div>
        <CurvaSChart altura={190} dados={g.periodos.map((p, i) => ({ rotulo: `P${p.periodo}`, ...g.totaisPeriodo[i]! }))} />
      </div>
    </>
  );
}

function RelMemoria({ eap, orcamentoId }: { eap: Eap; orcamentoId: string }) {
  const q = useMemoriasOrcamento(orcamentoId);
  if (q.isLoading) return <LoadingBlock />;
  const por = new Map<string, NonNullable<typeof q.data>>();
  for (const m of q.data ?? []) por.set(m.item_id, [...(por.get(m.item_id) ?? []), m]);
  const itens = eap.linhas.filter((l) => l.tipo === 'item' && por.has(l.id));
  if (!itens.length) return <p>Nenhum item com memória de cálculo.</p>;
  return (
    <>
      {itens.map((l) => l.tipo === 'item' && (
        <section key={l.id} className="rel-bloco">
          <h2 className="rel-secao"><span className="m">{l.codigo}</span>{l.item.descricao}<span className="m">· {l.item.referencia_codigo ?? 'livre'} · {l.item.unidade}</span></h2>
          <table className="rel-tbl">
            <thead><tr><th style={{ width: '8mm' }}>#</th><th>Descrição / local</th><th>Expressão</th><th className="n">Resultado</th></tr></thead>
            <tbody>{por.get(l.id)!.map((m, i) => <tr key={m.id}><td className="m">{i + 1}</td><td>{m.descricao}</td><td className="m">{m.expressao}</td><td className="n">{formatQuantidade(m.resultado)}</td></tr>)}</tbody>
            <tfoot><tr><td colSpan={3} className="n">Quantidade ({l.item.unidade})</td><td className="n">{formatQuantidade(l.item.quantidade)}</td></tr></tfoot>
          </table>
        </section>
      ))}
    </>
  );
}

function RelMedicao({ medicaoId }: { medicaoId: string }) {
  const m = useMedicao(medicaoId || undefined);
  const r = useMedicaoResumo(medicaoId || undefined);
  if (!medicaoId) return <p>Informe a medição.</p>;
  if (m.isLoading || r.isLoading) return <LoadingBlock />;
  const ls = (r.data ?? []).filter((l) => l.quantidade_acumulada > 0 || l.quantidade_atual > 0);
  return (
    <>
      <h2 className="rel-secao">Boletim nº {String(m.data?.numero ?? '').padStart(2, '0')}<span className="m">· {formatData(m.data?.periodo_inicio)} a {formatData(m.data?.periodo_fim)} · {m.data ? LABEL_MEDICAO_STATUS[m.data.status] : ''}</span></h2>
      <table className="rel-tbl">
        <thead><tr><th>Item</th><th>Descrição</th><th>Und</th><th className="n">Preço unit.</th><th className="n">Qtd. orçada</th><th className="n">Anterior</th><th className="n">Período</th><th className="n">Acumulada</th><th className="n">Valor período</th><th className="n">Valor acum.</th><th className="n">Saldo</th><th className="n">%</th></tr></thead>
        <tbody>
          {ls.map((l) => (
            <tr key={l.item_id}><td className="m">{l.codigo}</td><td>{l.descricao}</td><td>{l.unidade}</td><td className="n">{formatMoeda(l.preco_unitario)}</td><td className="n">{formatQuantidade(l.quantidade_orcada)}</td>
              <td className="n">{formatQuantidade(l.quantidade_anterior)}</td><td className="n">{formatQuantidade(l.quantidade_atual)}</td><td className="n">{formatQuantidade(l.quantidade_acumulada)}</td>
              <td className="n">{formatMoeda(l.valor_atual)}</td><td className="n">{formatMoeda(l.valor_acumulado)}</td><td className="n">{formatMoeda(l.valor_saldo)}</td><td className="n">{formatNumero(l.percentual_acumulado)}</td></tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="destaque"><td colSpan={8} className="n">Totais</td>
            <td className="n">{formatMoeda(somaMoeda((r.data ?? []).map((l) => l.valor_atual)))}</td>
            <td className="n">{formatMoeda(somaMoeda((r.data ?? []).map((l) => l.valor_acumulado)))}</td>
            <td className="n">{formatMoeda(somaMoeda((r.data ?? []).map((l) => l.valor_saldo)))}</td><td /></tr>
        </tfoot>
      </table>
      <div className="rel-carimbo" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '8mm' }}>
        <div><div className="rel-eyebrow">Medido por (contratada)</div><div className="ass">nome · assinatura · data</div></div>
        <div><div className="rel-eyebrow">Aprovado por (fiscalização / contratante)</div><div className="ass">nome · assinatura · data</div></div>
      </div>
    </>
  );
}
