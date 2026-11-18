import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ChevronRight, Tag } from 'lucide-react';
import { useSalvarCotacao } from '@/api/orcamento/orcamentos';
import { useComposicaoAnalitica, useComposicaoPrecoOficial } from '@/api/orcamento/referencias';
import { Badge, Button, Drawer, IconButton, Input, LoadingBlock, NumberInput, TBody, TFoot, THead, Table, TableMessage, Td, Th, Tooltip, Tr, useToast } from '@/components/ui';
import { custoComposicao, temParcelaSemPreco } from '@/lib/calc';
import { formatCoeficiente, formatMoeda, formatNumero } from '@/lib/format';
import { LABEL_INSUMO_TIPO } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import { SIGLA_INSUMO_TIPO } from '@/lib/labels-orcamento';
import { rotas } from '@/routes';
import type { ComposicaoAnaliticaLinha } from '@/types/database';
import { ErroCarregamento, Rotulo } from './comum';

interface Nivel {
  id: string;
  codigo: string;
  descricao: string;
  unidade?: string;
}

export interface ComposicaoAnaliticaDrawerProps {
  open: boolean;
  onClose: () => void;
  composicao: Nivel | null;
  dataBaseId: string | null | undefined;
  /** com orçamento: considera cotações e permite cotar insumos */
  orcamentoId?: string | null;
  podeCotar?: boolean;
}

/** Composição analítica (um nível por vez, com navegação por subcomposições). */
export function ComposicaoAnaliticaDrawer({ open, onClose, composicao, dataBaseId, orcamentoId, podeCotar }: ComposicaoAnaliticaDrawerProps) {
  const [pilha, setPilha] = useState<Nivel[]>([]);
  useEffect(() => {
    setPilha(composicao ? [composicao] : []);
  }, [composicao, open]);
  const atual = pilha[pilha.length - 1] ?? null;

  return (
    <Drawer
      open={open && atual !== null}
      onClose={onClose}
      width={760}
      eyebrow={atual ? `Composição ${atual.codigo}${atual.unidade ? ' · ' + atual.unidade : ''}` : undefined}
      title={atual?.descricao}
      description={
        pilha.length > 1 && (
          <span className="flex flex-wrap items-center gap-1 text-xs">
            {pilha.map((p, i) => (
              <span key={p.id + i} className="inline-flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                <button type="button" className="font-mono hover:text-fg hover:underline" onClick={() => setPilha(pilha.slice(0, i + 1))}>{p.codigo}</button>
              </span>
            ))}
          </span>
        )
      }
      actions={pilha.length > 1 && <IconButton size="sm" label="Voltar" icon={<ArrowLeft />} onClick={() => setPilha(pilha.slice(0, -1))} />}
      footer={atual && <Link to={rotas.composicao(atual.id)} className="mr-auto text-xs text-primary hover:underline">Abrir ficha da composição</Link>}
    >
      {atual && (
        <CorpoAnalitico
          key={atual.id}
          composicaoId={atual.id}
          dataBaseId={dataBaseId}
          orcamentoId={orcamentoId}
          podeCotar={podeCotar}
          onAbrirSub={(l) => setPilha([...pilha, { id: l.referencia_id, codigo: l.codigo, descricao: l.descricao, unidade: l.unidade }])}
        />
      )}
    </Drawer>
  );
}

export function CorpoAnalitico({
  composicaoId, dataBaseId, orcamentoId, podeCotar, onAbrirSub,
}: { composicaoId: string; dataBaseId: string | null | undefined; orcamentoId?: string | null; podeCotar?: boolean; onAbrirSub?: (l: ComposicaoAnaliticaLinha) => void }) {
  const toast = useToast();
  const q = useComposicaoAnalitica(composicaoId, dataBaseId, orcamentoId);
  const oficial = useComposicaoPrecoOficial(composicaoId, dataBaseId);
  const cotar = useSalvarCotacao(orcamentoId ?? '');
  const [cotando, setCotando] = useState<{ insumoId: string; preco: number | null; fonte: string } | null>(null);

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError) return <ErroCarregamento erro={q.error} onRetry={() => void q.refetch()} />;
  const linhas = q.data ?? [];
  const parcelas = linhas.map((l) => ({ coeficiente: l.coeficiente, preco: l.preco_unitario }));
  const custo = custoComposicao(parcelas);
  const porTipo = new Map<string, number>();
  for (const l of linhas) {
    const k = l.tipo_item === 'composicao' ? 'Composições auxiliares' : l.insumo_tipo ? LABEL_INSUMO_TIPO[l.insumo_tipo] : 'Outros';
    porTipo.set(k, (porTipo.get(k) ?? 0) + (l.custo_parcial ?? 0));
  }

  const salvarCotacao = async () => {
    if (!cotando || cotando.preco === null) return;
    try {
      await cotar.mutateAsync({ insumoId: cotando.insumoId, preco: cotando.preco, fonte: cotando.fonte || null });
      toast.success('Cotação aplicada ao orçamento', 'Todas as composições que usam este insumo foram recalculadas.');
      setCotando(null);
    } catch (e) {
      toast.error('Não foi possível salvar a cotação', mensagemErro(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="corner-marks rounded border border-border bg-surface-2 px-3 py-2">
          <Rotulo>Custo analítico</Rotulo>
          <div className="num mt-0.5 text-lg font-semibold">{formatMoeda(custo)}</div>
        </div>
        <div className="rounded border border-border bg-surface-2 px-3 py-2">
          <Rotulo>Custo oficial (Caixa)</Rotulo>
          <div className="num mt-0.5 text-lg">{oficial.data ? formatMoeda(oficial.data.custo) : '—'}</div>
        </div>
        <div className="rounded border border-border bg-surface-2 px-3 py-2">
          <Rotulo>% mão de obra</Rotulo>
          <div className="num mt-0.5 text-lg">{oficial.data?.perc_mao_obra !== null && oficial.data?.perc_mao_obra !== undefined ? `${formatNumero(oficial.data.perc_mao_obra)}%` : '—'}</div>
        </div>
      </div>
      {temParcelaSemPreco(parcelas) && (
        <p className="flex items-center gap-1.5 text-xs text-warning"><AlertTriangle className="h-3.5 w-3.5" /> Há componentes sem preço nesta data-base (tratados como zero).</p>
      )}

      <Table density="compact" gridLines>
        <THead>
          <Tr>
            <Th width={92}>Tipo</Th>
            <Th width={70}>Código</Th>
            <Th>Descrição</Th>
            <Th width={40}>Und</Th>
            <Th numeric width={90}>Coef.</Th>
            <Th numeric width={86}>Preço</Th>
            <Th numeric width={86}>Parcial</Th>
          </Tr>
        </THead>
        <TBody>
          {linhas.length === 0 && <TableMessage colSpan={7}>Composição sem itens analíticos (usa o custo oficial).</TableMessage>}
          {linhas.map((l) => (
            <Tr key={l.item_id}>
              <Td>
                <Badge variant={l.tipo_item === 'composicao' ? 'info' : l.insumo_tipo === 'mao_de_obra' ? 'brand' : 'neutral'}>
                  {l.tipo_item === 'composicao' ? 'COMP.' : l.insumo_tipo ? SIGLA_INSUMO_TIPO[l.insumo_tipo] : 'INSUMO'}
                </Badge>
              </Td>
              <Td mono>{l.codigo}</Td>
              <Td truncate title={l.descricao}>
                {l.tipo_item === 'composicao' && onAbrirSub ? (
                  <button type="button" className="max-w-full truncate text-left text-primary hover:underline" onClick={() => onAbrirSub(l)}>{l.descricao}</button>
                ) : (
                  l.descricao
                )}
              </Td>
              <Td muted className="text-xs">{l.unidade}</Td>
              <Td numeric>{formatCoeficiente(l.coeficiente)}</Td>
              <Td numeric>
                <span className="inline-flex items-center gap-1">
                  {l.sem_preco && (
                    <Tooltip content="Sem preço na data-base"><AlertTriangle aria-label="Sem preço" className="h-3 w-3 text-warning" /></Tooltip>
                  )}
                  {podeCotar && orcamentoId && l.tipo_item === 'insumo' ? (
                    <button type="button" title="Cotar preço deste insumo no orçamento" className="hover:text-primary hover:underline" onClick={() => setCotando({ insumoId: l.referencia_id, preco: l.preco_unitario, fonte: '' })}>
                      {formatMoeda(l.preco_unitario)}
                    </button>
                  ) : (
                    formatMoeda(l.preco_unitario)
                  )}
                </span>
              </Td>
              <Td numeric>{formatMoeda(l.custo_parcial)}</Td>
            </Tr>
          ))}
        </TBody>
        <TFoot>
          <Tr>
            <Td colSpan={6} className="text-right">Custo unitário (Σ coef. × preço, arredondado)</Td>
            <Td numeric>{formatMoeda(custo)}</Td>
          </Tr>
        </TFoot>
      </Table>

      {cotando && (
        <div className="accent-rule rounded border border-border-strong bg-surface-2 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Tag className="h-3.5 w-3.5 text-brand" /> Cotação do insumo neste orçamento</div>
          <div className="grid grid-cols-[140px_1fr_auto_auto] items-end gap-2">
            <NumberInput size="sm" aria-label="Preço cotado" decimals={4} value={cotando.preco} onChange={(v) => setCotando({ ...cotando, preco: v })} prefix="R$" autoFocus />
            <Input size="sm" aria-label="Fonte da cotação" placeholder="Fonte: Loja X, 12/11/2026" value={cotando.fonte} onChange={(e) => setCotando({ ...cotando, fonte: e.target.value })} />
            <Button size="sm" onClick={() => setCotando(null)}>Cancelar</Button>
            <Button size="sm" variant="primary" loading={cotar.isPending} onClick={() => void salvarCotacao()}>Aplicar</Button>
          </div>
          <p className="mt-1.5 text-xs text-fg-subtle">A cotação substitui o preço da data-base em todas as composições do orçamento; o custo oficial da Caixa deixa de ser usado nas composições afetadas (§8.2).</p>
        </div>
      )}

      {porTipo.size > 0 && (
        <div>
          <Rotulo>Composição do custo</Rotulo>
          <ul className="mt-1.5 space-y-1">
            {[...porTipo].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <li key={k} className="grid grid-cols-[150px_1fr_80px] items-center gap-2 text-xs">
                <span className="text-fg-muted">{k}</span>
                <span className="h-1 overflow-hidden rounded-full bg-sunken"><span className="block h-full bg-brand" style={{ width: `${custo ? Math.min(100, (v / custo) * 100) : 0}%` }} /></span>
                <span className="num text-right">{formatMoeda(v)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
