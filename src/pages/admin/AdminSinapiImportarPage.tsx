import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, RotateCcw, Upload, X } from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, Checkbox, Field, FileDrop, NumberInput, Progress, Select, TBody, THead,
  Table, TableMessage, Td, Th, Tr, useToast,
} from '@/components/ui';
import { executarImportacao, ImportacaoCancelada, type Progresso } from '@/api/core/sinapi';
import { LABEL_IMPORTACAO_TIPO } from '@/components/admin/rotulos';
import { cn } from '@/lib/cn';
import { formatCoeficiente, formatMoeda, formatNumero } from '@/lib/format';
import { LABEL_INSUMO_TIPO, LABEL_REGIME, UFS, opcoes } from '@/lib/labels';
import {
  CAMPOS, camposFaltantes, detectarFormato, detectarLinhaCabecalho, detectarTipo, extrair, inferirMetadadosArquivo, regimePorNome, sugerirMapeamento,
  type Mapeamento, type ResultadoQualquer,
} from '@/lib/sinapi/parser';
import type { Aba } from '@/lib/sinapi/planilha';
import { mensagemErro } from '@/lib/supabase';
import type { RegimeDesoneracao, SinapiImportacao } from '@/types/database';
import type { TipoPlanilhaSinapi } from '@/types/sinapi-import';
import { SINAPI_LOTE_MAX } from '@/types/sinapi-import';
import { rotas } from '@/routes';

const letra = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letra(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const agora = new Date();

function Etapa({ n, titulo, ativo, feito, ultimo, children }: { n: number; titulo: string; ativo: boolean; feito: boolean; ultimo?: boolean; children?: ReactNode }) {
  return (
    <li className={cn('flex min-w-0 items-center gap-2', !ultimo && 'flex-1')}>
      <span
        className={cn(
          'num flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border text-2xs font-semibold',
          feito ? 'border-success bg-success text-white' : ativo ? 'border-brand bg-primary-soft text-fg' : 'border-border-strong bg-surface text-fg-subtle',
        )}
        aria-hidden
      >
        {feito ? <CheckCircle2 className="h-3 w-3" /> : n}
      </span>
      <span className={cn('truncate text-sm', ativo ? 'font-medium text-fg' : 'text-fg-muted')} aria-current={ativo ? 'step' : undefined}>
        {titulo}
      </span>
      {children}
      {!ultimo && <span aria-hidden className={cn('mx-3 hidden h-px flex-1 sm:block', feito ? 'bg-success/60' : 'bg-border')} />}
    </li>
  );
}

function Contador({ rotulo, valor, tom }: { rotulo: string; valor: number; tom?: 'ok' | 'erro' | 'neutro' }) {
  return (
    <div className="corner-marks rounded-sm border border-border bg-surface px-3 py-2">
      <div className="font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle">{rotulo}</div>
      <div className={cn('num mt-0.5 text-xl font-semibold', tom === 'ok' && 'text-success', tom === 'erro' && valor > 0 && 'text-danger')}>{formatNumero(valor, 0)}</div>
    </div>
  );
}

function Previa({ r }: { r: ResultadoQualquer }) {
  const linhas = r.linhas.slice(0, 20);
  if (r.tipo === 'insumos')
    return (
      <Table density="compact" gridLines striped>
        <THead>
          <tr>
            <Th numeric width={56}>Linha</Th>
            <Th width={80}>Código</Th>
            <Th>Descrição</Th>
            <Th width={56}>Und</Th>
            <Th width={110}>Tipo</Th>
            <Th width={56}>Orig.</Th>
            <Th numeric width={110}>Preço (R$)</Th>
          </tr>
        </THead>
        <TBody>
          {r.tipo === 'insumos' &&
            r.linhas.slice(0, 20).map((l) => (
              <Tr key={`${l.linha}`}>
                <Td numeric muted>{l.linha}</Td>
                <Td mono>{l.codigo}</Td>
                <Td truncate title={l.descricao}>{l.descricao}</Td>
                <Td mono>{l.unidade}</Td>
                <Td muted>{l.tipo ? LABEL_INSUMO_TIPO[l.tipo] : '—'}</Td>
                <Td mono>{l.origem_preco ?? '—'}</Td>
                <Td numeric>{formatMoeda(l.preco)}</Td>
              </Tr>
            ))}
          {linhas.length === 0 && <TableMessage colSpan={7}>Nenhuma linha válida.</TableMessage>}
        </TBody>
      </Table>
    );
  if (r.tipo === 'composicoes')
    return (
      <Table density="compact" gridLines striped>
        <THead>
          <tr>
            <Th numeric width={56}>Linha</Th>
            <Th width={80}>Código</Th>
            <Th>Descrição</Th>
            <Th width={56}>Und</Th>
            <Th width={180}>Grupo</Th>
            <Th numeric width={70}>% MO</Th>
            <Th numeric width={110}>Custo (R$)</Th>
          </tr>
        </THead>
        <TBody>
          {r.linhas.slice(0, 20).map((l) => (
            <Tr key={`${l.linha}`}>
              <Td numeric muted>{l.linha}</Td>
              <Td mono>{l.codigo}</Td>
              <Td truncate title={l.descricao}>{l.descricao}</Td>
              <Td mono>{l.unidade}</Td>
              <Td truncate muted>{l.grupo ?? '—'}</Td>
              <Td numeric>{l.perc_mao_obra === null || l.perc_mao_obra === undefined ? '—' : formatNumero(l.perc_mao_obra, 2)}</Td>
              <Td numeric>{formatMoeda(l.custo)}</Td>
            </Tr>
          ))}
          {linhas.length === 0 && <TableMessage colSpan={7}>Nenhuma linha válida.</TableMessage>}
        </TBody>
      </Table>
    );
  return (
    <Table density="compact" gridLines striped>
      <THead>
        <tr>
          <Th numeric width={56}>Linha</Th>
          <Th width={90}>Composição</Th>
          <Th width={100}>Tipo</Th>
          <Th width={80}>Item</Th>
          <Th>Descrição do item</Th>
          <Th width={56}>Und</Th>
          <Th numeric width={120}>Coeficiente</Th>
        </tr>
      </THead>
      <TBody>
        {r.tipo === 'analitico' &&
          r.linhas.slice(0, 20).map((l) => (
            <Tr key={`${l.linha}`}>
              <Td numeric muted>{l.linha}</Td>
              <Td mono>{l.composicao_codigo}</Td>
              <Td>
                <Badge variant={l.tipo_item === 'INSUMO' ? 'neutral' : 'info'}>{l.tipo_item === 'INSUMO' ? 'Insumo' : 'Composição'}</Badge>
              </Td>
              <Td mono>{l.item_codigo}</Td>
              <Td truncate title={l.descricao ?? undefined}>{l.descricao ?? '—'}</Td>
              <Td mono>{l.unidade ?? '—'}</Td>
              <Td numeric>{formatCoeficiente(l.coeficiente)}</Td>
            </Tr>
          ))}
        {linhas.length === 0 && <TableMessage colSpan={7}>Nenhuma linha válida.</TableMessage>}
      </TBody>
    </Table>
  );
}

/** Importador SINAPI: arquivo → mapeamento → prévia → envio em lotes. §9 da ARQUITETURA. Dono: FRONTEND-1. */
export default function AdminSinapiImportarPage() {
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [abas, setAbas] = useState<Aba[] | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [abaIdx, setAbaIdx] = useState(0);
  const [cab, setCab] = useState(0);
  const [tipo, setTipo] = useState<TipoPlanilhaSinapi>('insumos');
  const [uf, setUf] = useState('RJ');
  const [ano, setAno] = useState<number>(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [regime, setRegime] = useState<RegimeDesoneracao>('nao_desonerado');
  const [map, setMap] = useState<Mapeamento>({});
  const [publicar, setPublicar] = useState(false);
  const [cabecalhosComp, setCabecalhosComp] = useState(true);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [resultadoFinal, setResultadoFinal] = useState<SinapiImportacao | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const sinal = useRef({ cancelado: false });

  const aba = abas?.[abaIdx];
  const cabecalho = useMemo(() => aba?.linhas[cab] ?? [], [aba, cab]);
  const formato = useMemo(() => detectarFormato(cabecalho), [cabecalho]);

  // ao trocar de aba: detecta cabeçalho, tipo e regime
  useEffect(() => {
    if (!aba) return;
    const c = Math.max(0, detectarLinhaCabecalho(aba.linhas));
    setCab(c);
    const meta = arquivo ? inferirMetadadosArquivo(arquivo.name) : {};
    setTipo(meta.tipo && abas?.length === 1 ? meta.tipo : detectarTipo(aba.linhas[c] ?? [], aba.nome));
    const r = regimePorNome(aba.nome) ?? meta.regime;
    if (r) setRegime(r);
  }, [aba, abas, arquivo]);

  // mapeamento sugerido sempre que cabeçalho/tipo/UF mudam
  useEffect(() => {
    setMap(sugerirMapeamento(cabecalho, tipo, uf));
  }, [cabecalho, tipo, uf]);

  const faltantes = useMemo(() => camposFaltantes(tipo, map), [tipo, map]);
  const resultado = useMemo<ResultadoQualquer | null>(() => {
    if (!aba || faltantes.length) return null;
    return extrair(tipo, aba.linhas, cab, map, { uf });
  }, [aba, tipo, cab, map, uf, faltantes.length]);

  const carregar = async (f: File) => {
    setArquivo(f);
    setAbas(null);
    setErroLeitura(null);
    setResultadoFinal(null);
    setProgresso(null);
    setErroEnvio(null);
    setLendo(true);
    try {
      const { lerPlanilha } = await import('@/lib/sinapi/planilha');
      const lidas = (await lerPlanilha(f)).filter((a) => a.linhas.length > 0);
      if (lidas.length === 0) throw new Error('A planilha está vazia.');
      const meta = inferirMetadadosArquivo(f.name);
      if (meta.uf) setUf(meta.uf);
      if (meta.ano) setAno(meta.ano);
      if (meta.mes) setMes(meta.mes);
      if (meta.regime) setRegime(meta.regime);
      // prefere a 1ª aba com cabeçalho reconhecível
      const idx = Math.max(0, lidas.findIndex((a) => detectarLinhaCabecalho(a.linhas) >= 0));
      setAbaIdx(idx);
      setAbas(lidas);
    } catch (e) {
      setErroLeitura(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.');
    } finally {
      setLendo(false);
    }
  };

  const enviando = progresso !== null && progresso.etapa !== 'concluida' && progresso.etapa !== 'cancelada' && !erroEnvio;
  const podeEnviar = Boolean(resultado && resultado.linhas.length > 0 && !enviando);

  const importar = async () => {
    if (!resultado || !arquivo) return;
    sinal.current = { cancelado: false };
    setErroEnvio(null);
    setResultadoFinal(null);
    try {
      const fim = await executarImportacao(
        { uf, ano, mes, regime, arquivoNome: `${arquivo.name}${abas && abas.length > 1 ? ` [${aba?.nome}]` : ''}`, resultado, publicar, incluirCabecalhos: cabecalhosComp },
        setProgresso,
        sinal.current,
      );
      setResultadoFinal(fim);
      toast.success('Importação concluída', `${formatNumero(fim.linhas_ok, 0)} linhas gravadas.`);
    } catch (e) {
      if (e instanceof ImportacaoCancelada) toast.toast({ tipo: 'warning', titulo: 'Importação cancelada', descricao: 'Os lotes já enviados permanecem gravados em rascunho.' });
      else {
        setErroEnvio(mensagemErro(e));
        toast.error('Falha na importação', mensagemErro(e));
      }
    } finally {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['core', 'data-base-recente'] });
    }
  };

  const recomecar = () => {
    setArquivo(null);
    setAbas(null);
    setProgresso(null);
    setResultadoFinal(null);
    setErroEnvio(null);
  };

  const colunas = cabecalho.map((h, i) => ({ value: String(i), label: `${letra(i)} · ${String(h ?? '').trim() || '(sem título)'}`.slice(0, 60) }));
  const passo = !abas ? 1 : resultadoFinal ? 4 : progresso ? 4 : resultado ? 3 : 2;
  const pct = progresso && progresso.total > 0 ? (progresso.enviados / progresso.total) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">Importar planilha SINAPI</h2>
          <p className="text-sm text-fg-muted">Arquivos por UF (legado da Caixa) ou planilha consolidada mensal (abas ISD/ICD/CSD/CCD/Analítico).</p>
        </div>
        <Button variant="ghost" leftIcon={<ArrowLeft />} onClick={() => nav(rotas.adminSinapi)}>
          Datas-base
        </Button>
      </div>

      <ol className="flex flex-wrap items-center gap-y-2 rounded border border-border bg-surface px-4 py-2.5 shadow-xs" aria-label="Etapas da importação">
        <Etapa n={1} titulo="Arquivo" ativo={passo === 1} feito={passo > 1} />
        <Etapa n={2} titulo="Mapeamento" ativo={passo === 2} feito={passo > 2} />
        <Etapa n={3} titulo="Prévia" ativo={passo === 3} feito={passo > 3} />
        <Etapa n={4} titulo="Envio" ativo={passo === 4} feito={Boolean(resultadoFinal)} ultimo />
      </ol>

      {!abas && (
        <Card flush accent>
          <CardHeader eyebrow="01" title="Selecione o arquivo" description="A leitura acontece no seu navegador; somente as linhas normalizadas são enviadas." />
          <CardBody className="flex flex-col gap-3">
            <FileDrop
              accept=".xlsx,.xls,.csv"
              onFile={(f) => void carregar(f)}
              disabled={lendo}
              file={arquivo}
              label={lendo ? 'Lendo planilha…' : undefined}
              hint="XLSX, XLS ou CSV (separador ; ou ,) · ex.: SINAPI_Preco_Ref_Insumos_RJ_202609_NaoDesonerado.xlsx"
            />
            {erroLeitura && <Alert variant="danger" title="Não foi possível ler o arquivo">{erroLeitura}</Alert>}
            <Alert variant="info" title="Antes de importar">
              Use os arquivos oficiais publicados pela Caixa. Importe primeiro <strong>insumos</strong>, depois <strong>composições</strong> (sintético) e por
              fim o <strong>analítico</strong>, para que os vínculos entre composições e insumos fiquem completos.
            </Alert>
          </CardBody>
        </Card>
      )}

      {abas && aba && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
          <Card flush accent className="self-start">
            <CardHeader
              eyebrow="02"
              title="Origem e destino"
              actions={
                <Button size="sm" variant="ghost" leftIcon={<RotateCcw />} onClick={recomecar} disabled={enviando}>
                  Trocar arquivo
                </Button>
              }
            />
            <CardBody className="flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-2.5 py-1.5">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                <span className="truncate font-mono text-xs" title={arquivo?.name}>
                  {arquivo?.name}
                </span>
                <Badge variant="outline" className="ml-auto">
                  {formato === 'consolidado' ? 'Consolidado' : 'Por UF'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                {abas.length > 1 && (
                  <Field label="Aba" className="col-span-2">
                    {(p) => (
                      <Select {...p} value={String(abaIdx)} onChange={(e) => setAbaIdx(Number(e.target.value))} disabled={enviando} options={abas.map((a, i) => ({ value: String(i), label: `${a.nome} (${formatNumero(a.linhas.length, 0)} linhas)` }))} />
                    )}
                  </Field>
                )}
                <Field label="Tipo de planilha">
                  {(p) => <Select {...p} value={tipo} onChange={(e) => setTipo(e.target.value as TipoPlanilhaSinapi)} disabled={enviando} options={opcoes(LABEL_IMPORTACAO_TIPO)} />}
                </Field>
                <Field label="Linha do cabeçalho" hint="Detectada automaticamente.">
                  {(p) => (
                    <NumberInput {...p} value={cab + 1} decimals={0} min={1} max={Math.min(aba.linhas.length, 200)} onChange={(v) => setCab(Math.max(0, (v ?? 1) - 1))} disabled={enviando} />
                  )}
                </Field>
                <Field label="UF" hint={formato === 'consolidado' ? 'Coluna de preço usada.' : 'Filtra a coluna UF, se houver.'}>
                  {(p) => <Select {...p} value={uf} onChange={(e) => setUf(e.target.value)} disabled={enviando} options={UFS.map((u) => ({ value: u, label: u }))} />}
                </Field>
                <Field label="Regime">
                  {(p) => <Select {...p} value={regime} onChange={(e) => setRegime(e.target.value as RegimeDesoneracao)} disabled={enviando} options={opcoes(LABEL_REGIME)} />}
                </Field>
                <Field label="Mês de referência">
                  {(p) => <Select {...p} value={String(mes)} onChange={(e) => setMes(Number(e.target.value))} disabled={enviando} options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))} />}
                </Field>
                <Field label="Ano">
                  {(p) => (
                    <Select
                      {...p}
                      value={String(ano)}
                      onChange={(e) => setAno(Number(e.target.value))}
                      disabled={enviando}
                      options={Array.from(new Set([ano, ...Array.from({ length: 6 }, (_, i) => agora.getFullYear() + 1 - i)]))
                        .sort((a, b) => b - a)
                        .map((a) => ({ value: String(a), label: String(a) }))}
                    />
                  )}
                </Field>
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.1em] text-fg-subtle">
                  Mapeamento de colunas <span className="h-px flex-1 bg-border" />
                </div>
                <div className="flex flex-col divide-y divide-grid rounded-sm border border-border">
                  {CAMPOS[tipo].map((c) => {
                    const falta = c.obrigatorio && (map[c.campo] === null || map[c.campo] === undefined);
                    return (
                      <div key={c.campo} className={cn('grid grid-cols-[1fr_190px] items-center gap-2 px-2.5 py-1', falta && 'bg-danger-soft/60')}>
                        <label htmlFor={`map-${c.campo}`} className="flex items-center gap-1.5 text-sm">
                          {c.rotulo}
                          {c.obrigatorio && <span className="text-danger" aria-hidden>*</span>}
                          {c.valorUf && formato === 'consolidado' && <Badge variant="outline">{uf}</Badge>}
                        </label>
                        <Select
                          id={`map-${c.campo}`}
                          size="sm"
                          invalid={falta}
                          disabled={enviando}
                          value={map[c.campo] === null || map[c.campo] === undefined ? '' : String(map[c.campo])}
                          onChange={(e) => setMap({ ...map, [c.campo]: e.target.value === '' ? null : Number(e.target.value) })}
                          options={[{ value: '', label: c.obrigatorio ? 'Selecione…' : '— não usar —' }, ...colunas]}
                        />
                      </div>
                    );
                  })}
                </div>
                {faltantes.length > 0 && (
                  <p role="alert" className="mt-1.5 text-xs text-danger">
                    Mapeie: {faltantes.map((f) => f.rotulo).join(', ')}.
                  </p>
                )}
              </div>
            </CardBody>
          </Card>

          <div className="flex min-w-0 flex-col gap-4">
            <Card flush>
              <CardHeader
                eyebrow="03"
                title="Prévia normalizada"
                description={resultado ? `Primeiras ${Math.min(20, resultado.linhas.length)} linhas válidas de ${LABEL_IMPORTACAO_TIPO[tipo].toLowerCase()}.` : 'Complete o mapeamento para ver a prévia.'}
              />
              <CardBody className="flex flex-col gap-3">
                {resultado ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      <Contador rotulo="Válidas" valor={resultado.linhas.length} tom="ok" />
                      <Contador rotulo="Com erro" valor={resultado.erros.length} tom="erro" />
                      <Contador rotulo="Ignoradas" valor={resultado.ignoradas} />
                      <Contador rotulo={resultado.tipo === 'analitico' ? 'Composições' : 'Lotes'} valor={resultado.tipo === 'analitico' ? resultado.composicoes.length : Math.ceil(resultado.linhas.length / SINAPI_LOTE_MAX)} />
                    </div>
                    <Previa r={resultado} />
                    {resultado.erros.length > 0 && (
                      <details className="group rounded-sm border border-danger/25 bg-danger-soft/40">
                        <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm font-medium text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                          {resultado.erros.length === 1 ? '1 linha será descartada' : `${formatNumero(resultado.erros.length, 0)} linhas serão descartadas`} — ver detalhes
                        </summary>
                        <ul className="max-h-48 overflow-y-auto border-t border-danger/20 px-3 py-1.5 font-mono text-xs">
                          {resultado.erros.slice(0, 200).map((e, i) => (
                            <li key={i} className="py-0.5">
                              <span className="text-fg-subtle">L{e.linha}</span> <span className="text-fg">{e.codigo ?? '—'}</span> · {e.mensagem}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                ) : (
                  <Alert variant="warning">Mapeie as colunas obrigatórias para gerar a prévia.</Alert>
                )}
              </CardBody>
            </Card>

            <Card flush cornerMarks={resultadoFinal ? 'brand' : undefined}>
              <CardHeader eyebrow="04" title="Enviar ao banco" description={`Destino: SINAPI ${uf} · ${String(mes).padStart(2, '0')}/${ano} · ${LABEL_REGIME[regime]}`} />
              <CardBody className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Checkbox
                    checked={publicar}
                    onChange={(e) => setPublicar(e.target.checked)}
                    disabled={enviando}
                    label="Publicar a data-base ao concluir"
                    description="Sem publicar, a data-base fica em rascunho e invisível aos usuários até você publicá-la."
                  />
                  {tipo === 'analitico' && (
                    <Checkbox
                      checked={cabecalhosComp}
                      onChange={(e) => setCabecalhosComp(e.target.checked)}
                      disabled={enviando}
                      label="Atualizar descrição, unidade e custo das composições"
                      description="Usa as linhas de cabeçalho de composição do analítico."
                    />
                  )}
                </div>
                {progresso && (
                  <Progress
                    value={progresso.etapa === 'concluida' ? 100 : pct}
                    striped={enviando}
                    variant={erroEnvio ? 'danger' : progresso.etapa === 'concluida' ? 'success' : 'brand'}
                    label={
                      { iniciando: 'Preparando importação…', enviando: 'Enviando lotes…', finalizando: 'Finalizando…', concluida: 'Concluída', cancelada: 'Cancelada' }[progresso.etapa]
                    }
                    valueText={`${formatNumero(progresso.enviados, 0)} / ${formatNumero(progresso.total, 0)}`}
                  />
                )}
                {erroEnvio && <Alert variant="danger" title="A importação foi interrompida">{erroEnvio}</Alert>}
                {resultadoFinal && (
                  <Alert variant="success" title="Importação concluída">
                    {formatNumero(resultadoFinal.linhas_ok, 0)} linhas gravadas, {formatNumero(resultadoFinal.linhas_erro, 0)} rejeitadas pelo servidor.
                    {resultadoFinal.erros.length > 0 && ' Veja os erros no histórico de importações.'}
                  </Alert>
                )}
              </CardBody>
              <CardFooter>
                {enviando ? (
                  <Button variant="danger" leftIcon={<X />} onClick={() => (sinal.current.cancelado = true)}>
                    Cancelar envio
                  </Button>
                ) : resultadoFinal ? (
                  <>
                    <Button leftIcon={<RotateCcw />} onClick={recomecar}>
                      Importar outro arquivo
                    </Button>
                    <Button variant="primary" onClick={() => nav(rotas.adminSinapi)}>
                      Ver datas-base
                    </Button>
                  </>
                ) : (
                  <Button variant="primary" leftIcon={<Upload />} disabled={!podeEnviar} onClick={() => void importar()}>
                    Importar {resultado ? formatNumero(resultado.linhas.length, 0) : ''} linhas
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
