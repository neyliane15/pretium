/**
 * Orçamento: cabeçalho, EAP (etapas/itens), BDI, memória de cálculo, cotações e RPCs de
 * criação/recálculo/duplicação/movimentação. Dono: FRONTEND-2. Contrato: ARQUITETURA §5.4, §7.2.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qkOrc } from './keys';
import { ok, okVoid, useOrgId } from './util';
import type {
  BdiParametros, DataBase, ItemReferenciaTipo, Json, Orcamento, OrcamentoBdi, OrcamentoEtapa, OrcamentoInsumoPreco,
  OrcamentoItem, OrcamentoItemMemoria, OrcamentoStatus, TablesInsert, TablesUpdate,
} from '@/types/database';

export interface OrcamentoLista extends Orcamento {
  obra: { id: string; nome: string; codigo: string | null } | null;
  data_base: Pick<DataBase, 'id' | 'uf' | 'ano' | 'mes' | 'regime' | 'is_demo'> | null;
}

const SELECT_LISTA =
  '*, obra:obras!orcamentos_obra_id_fkey(id, nome, codigo), data_base:datas_base!orcamentos_data_base_id_fkey(id, uf, ano, mes, regime, is_demo)';

/** Invalida tudo que depende do conteúdo do orçamento. */
export function invalidarOrcamento(qc: QueryClient, id: string) {
  void qc.invalidateQueries({ queryKey: ['orc', id] });
  void qc.invalidateQueries({ queryKey: ['orc', 'lista'] });
  void qc.invalidateQueries({ queryKey: ['dash'] });
}

// ─── Cabeçalho ────────────────────────────────────────────────────────────

export function useOrcamentos(obraId?: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qkOrc.orcamentos(orgId, obraId),
    enabled: Boolean(orgId),
    queryFn: async (): Promise<OrcamentoLista[]> => {
      let q = supabase.from('orcamentos').select(SELECT_LISTA).eq('organizacao_id', orgId);
      if (obraId) q = q.eq('obra_id', obraId);
      return ok(await q.order('updated_at', { ascending: false })) as unknown as OrcamentoLista[];
    },
  });
}

export function useOrcamento(id: string | undefined) {
  return useQuery({
    queryKey: qkOrc.orcamento(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<OrcamentoLista> =>
      ok(await supabase.from('orcamentos').select(SELECT_LISTA).eq('id', id!).single()) as unknown as OrcamentoLista,
  });
}

export function useCriarOrcamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { obraId: string; nome: string; dataBaseId: string; bdi: BdiParametros | null }) =>
      ok(
        await supabase.rpc('fn_orcamento_criar', {
          p_obra_id: a.obraId,
          p_nome: a.nome,
          p_data_base_id: a.dataBaseId,
          p_bdi_padrao: a.bdi as unknown as Json,
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orc', 'lista'] });
      void qc.invalidateQueries({ queryKey: ['dash'] });
    },
  });
}

export function useAtualizarOrcamento(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: TablesUpdate<'orcamentos'>) => ok(await supabase.from('orcamentos').update(d).eq('id', id).select().single()),
    onSuccess: () => invalidarOrcamento(qc, id),
  });
}

export function useAlterarStatusOrcamento(id: string) {
  const atualizar = useAtualizarOrcamento(id);
  return { ...atualizar, mutate: (status: OrcamentoStatus) => atualizar.mutate({ status }), mutateAsync: (status: OrcamentoStatus) => atualizar.mutateAsync({ status }) };
}

export function useExcluirOrcamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => okVoid(await supabase.from('orcamentos').delete().eq('id', id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orc', 'lista'] });
      void qc.invalidateQueries({ queryKey: ['dash'] });
    },
  });
}

export function useDuplicarOrcamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; nome?: string | null; novaVersao?: boolean }) =>
      ok(await supabase.rpc('fn_orcamento_duplicar', { p_orcamento_id: a.id, p_nome: a.nome ?? null, p_nova_versao: a.novaVersao ?? true })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['orc', 'lista'] }),
  });
}

export function useTrocarDataBase(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dataBaseId: string) => ok(await supabase.rpc('fn_orcamento_trocar_data_base', { p_orcamento_id: id, p_data_base_id: dataBaseId })),
    onSuccess: () => invalidarOrcamento(qc, id),
  });
}

export function useRecalcularOrcamento(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => ok(await supabase.rpc('fn_orcamento_recalcular', { p_orcamento_id: id })),
    onSuccess: () => invalidarOrcamento(qc, id),
  });
}

// ─── EAP ──────────────────────────────────────────────────────────────────

export function useEtapas(orcamentoId: string | undefined) {
  return useQuery({
    queryKey: qkOrc.etapas(orcamentoId ?? ''),
    enabled: Boolean(orcamentoId),
    queryFn: async (): Promise<OrcamentoEtapa[]> =>
      ok(await supabase.from('orcamento_etapas').select('*').eq('orcamento_id', orcamentoId!).order('ordem')),
  });
}

export function useItens(orcamentoId: string | undefined) {
  return useQuery({
    queryKey: qkOrc.itens(orcamentoId ?? ''),
    enabled: Boolean(orcamentoId),
    queryFn: async (): Promise<OrcamentoItem[]> =>
      ok(await supabase.from('orcamento_itens').select('*').eq('orcamento_id', orcamentoId!).order('ordem')),
  });
}

export function useResumoOrcamento(orcamentoId: string | undefined) {
  return useQuery({
    queryKey: qkOrc.resumo(orcamentoId ?? ''),
    enabled: Boolean(orcamentoId),
    queryFn: async () => {
      const r = ok(await supabase.rpc('fn_orcamento_resumo', { p_orcamento_id: orcamentoId! })) ?? [];
      return [...r].sort((a, b) => a.ordem_path.localeCompare(b.ordem_path, 'pt-BR', { numeric: true }));
    },
  });
}

async function renumerar(orcamentoId: string) {
  okVoid(await supabase.rpc('fn_orcamento_renumerar', { p_orcamento_id: orcamentoId }));
}

export function useCriarEtapa(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { nome: string; parentId: string | null; ordem: number }) => {
      const r = ok(
        await supabase
          .from('orcamento_etapas')
          .insert({ orcamento_id: orcamentoId, nome: a.nome, parent_id: a.parentId, ordem: a.ordem })
          .select()
          .single(),
      );
      await renumerar(orcamentoId);
      return r;
    },
    onSuccess: () => invalidarOrcamento(qc, orcamentoId),
  });
}

export function useAtualizarEtapa(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...d }: TablesUpdate<'orcamento_etapas'> & { id: string }) =>
      okVoid(await supabase.from('orcamento_etapas').update(d).eq('id', id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qkOrc.etapas(orcamentoId) }),
  });
}

export function useExcluirEtapa(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      okVoid(await supabase.from('orcamento_etapas').delete().eq('id', id));
      await renumerar(orcamentoId);
    },
    onSuccess: () => invalidarOrcamento(qc, orcamentoId),
  });
}

export interface AdicionarItemArgs {
  etapaId: string;
  referenciaTipo: ItemReferenciaTipo;
  referenciaId?: string | null;
  quantidade?: number;
  descricao?: string | null;
  unidade?: string | null;
  custoUnitario?: number | null;
}

export function useAdicionarItem(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: AdicionarItemArgs): Promise<OrcamentoItem> =>
      ok(
        await supabase.rpc('fn_orcamento_adicionar_item', {
          p_etapa_id: a.etapaId,
          p_referencia_tipo: a.referenciaTipo,
          p_referencia_id: a.referenciaId ?? null,
          p_quantidade: a.quantidade ?? 0,
          p_descricao: a.descricao ?? null,
          p_unidade: a.unidade ?? null,
          p_custo_unitario: a.custoUnitario ?? null,
        }),
      ),
    onSuccess: () => invalidarOrcamento(qc, orcamentoId),
  });
}

export type ItemPatch = Pick<
  TablesUpdate<'orcamento_itens'>,
  'descricao' | 'unidade' | 'quantidade' | 'custo_unitario' | 'custo_manual' | 'bdi_id' | 'usa_memoria' | 'observacao'
>;

/**
 * Atualiza um item com atualização otimista (valores do trigger reproduzidos por `calcularItem`
 * no chamador). O recálculo consolidado (totais de etapa/orçamento) é feito pelo editor via RPC.
 */
export function useAtualizarItem(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ItemPatch; otimista?: Partial<OrcamentoItem> }): Promise<OrcamentoItem> =>
      ok(await supabase.from('orcamento_itens').update(patch).eq('id', id).select().single()) as OrcamentoItem,
    onMutate: async ({ id, patch, otimista }) => {
      await qc.cancelQueries({ queryKey: qkOrc.itens(orcamentoId) });
      const anterior = qc.getQueryData<OrcamentoItem[]>(qkOrc.itens(orcamentoId));
      qc.setQueryData<OrcamentoItem[]>(qkOrc.itens(orcamentoId), (xs) =>
        xs?.map((x) => (x.id === id ? ({ ...x, ...patch, ...otimista } as OrcamentoItem) : x)),
      );
      return { anterior };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(qkOrc.itens(orcamentoId), ctx.anterior);
    },
    onSuccess: (item) => {
      qc.setQueryData<OrcamentoItem[]>(qkOrc.itens(orcamentoId), (xs) => xs?.map((x) => (x.id === item.id ? item : x)));
    },
  });
}

export function useExcluirItens(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      okVoid(await supabase.from('orcamento_itens').delete().in('id', ids));
      await renumerar(orcamentoId);
    },
    onSuccess: () => invalidarOrcamento(qc, orcamentoId),
  });
}

export function useMoverEap(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { tipo: 'etapa' | 'item'; id: string; novoPaiId: string | null; novaOrdem: number }) =>
      okVoid(await supabase.rpc('fn_orcamento_mover', { p_tipo: a.tipo, p_id: a.id, p_novo_pai_id: a.novoPaiId, p_nova_ordem: a.novaOrdem })),
    onSuccess: () => invalidarOrcamento(qc, orcamentoId),
  });
}

// ─── BDI ──────────────────────────────────────────────────────────────────

export function useBdis(orcamentoId: string | undefined) {
  return useQuery({
    queryKey: qkOrc.bdis(orcamentoId ?? ''),
    enabled: Boolean(orcamentoId),
    queryFn: async (): Promise<OrcamentoBdi[]> =>
      ok(await supabase.from('orcamento_bdis').select('*').eq('orcamento_id', orcamentoId!).order('is_padrao', { ascending: false }).order('nome')),
  });
}

export function useSalvarBdi(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...d }: Partial<BdiParametros> & { id?: string; nome?: string }) => {
      if (id) okVoid(await supabase.from('orcamento_bdis').update(d).eq('id', id));
      else okVoid(await supabase.from('orcamento_bdis').insert({ ...d, orcamento_id: orcamentoId }));
      // BDI muda bdi_percentual dos itens → recálculo consolidado
      return ok(await supabase.rpc('fn_orcamento_recalcular', { p_orcamento_id: orcamentoId }));
    },
    onSuccess: () => invalidarOrcamento(qc, orcamentoId),
  });
}

export function useExcluirBdi(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      okVoid(await supabase.from('orcamento_bdis').delete().eq('id', id));
      return ok(await supabase.rpc('fn_orcamento_recalcular', { p_orcamento_id: orcamentoId }));
    },
    onSuccess: () => invalidarOrcamento(qc, orcamentoId),
  });
}

// ─── Memória de cálculo ───────────────────────────────────────────────────

export function useMemorias(itemId: string | null | undefined) {
  return useQuery({
    queryKey: qkOrc.memorias(itemId ?? ''),
    enabled: Boolean(itemId),
    queryFn: async (): Promise<OrcamentoItemMemoria[]> =>
      ok(await supabase.from('orcamento_item_memorias').select('*').eq('item_id', itemId!).order('ordem')),
  });
}

/** Todas as memórias do orçamento (relatório de memória de cálculo). */
export function useMemoriasOrcamento(orcamentoId: string | undefined) {
  return useQuery({
    queryKey: ['orc', orcamentoId ?? '', 'memorias'],
    enabled: Boolean(orcamentoId),
    queryFn: async (): Promise<OrcamentoItemMemoria[]> => {
      const r = await supabase
        .from('orcamento_item_memorias')
        .select('*, item:orcamento_itens!orcamento_item_memorias_item_id_fkey!inner(orcamento_id)')
        .eq('item.orcamento_id', orcamentoId!)
        .order('ordem');
      return (ok(r) as unknown as (OrcamentoItemMemoria & { item?: unknown })[]).map(({ item: _i, ...m }) => m);
    },
  });
}

export interface MemoriaLinha {
  id?: string;
  descricao: string;
  expressao: string;
  resultado: number;
}

/** Substitui as linhas de memória do item e liga `usa_memoria` (o trigger soma a quantidade). */
export function useSalvarMemorias(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { itemId: string; linhas: MemoriaLinha[]; usaMemoria: boolean }) => {
      okVoid(await supabase.from('orcamento_itens').update({ usa_memoria: a.usaMemoria }).eq('id', a.itemId));
      okVoid(await supabase.from('orcamento_item_memorias').delete().eq('item_id', a.itemId));
      if (a.linhas.length) {
        const rows: TablesInsert<'orcamento_item_memorias'>[] = a.linhas.map((l, i) => ({
          item_id: a.itemId,
          ordem: i + 1,
          descricao: l.descricao,
          expressao: l.expressao,
          resultado: l.resultado,
        }));
        okVoid(await supabase.from('orcamento_item_memorias').insert(rows));
      }
      return ok(await supabase.rpc('fn_orcamento_recalcular', { p_orcamento_id: orcamentoId }));
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: qkOrc.memorias(v.itemId) });
      invalidarOrcamento(qc, orcamentoId);
    },
  });
}

// ─── Cotações (orcamento_insumo_precos) ───────────────────────────────────

export interface CotacaoDetalhe extends OrcamentoInsumoPreco {
  insumo: { id: string; codigo: string; descricao: string; unidade: string; fonte: string } | null;
}

export function useCotacoes(orcamentoId: string | undefined) {
  return useQuery({
    queryKey: ['orc', orcamentoId ?? '', 'cotacoes'],
    enabled: Boolean(orcamentoId),
    queryFn: async (): Promise<CotacaoDetalhe[]> =>
      ok(
        await supabase
          .from('orcamento_insumo_precos')
          .select('*, insumo:insumos!orcamento_insumo_precos_insumo_id_fkey(id, codigo, descricao, unidade, fonte)')
          .eq('orcamento_id', orcamentoId!),
      ) as unknown as CotacaoDetalhe[],
  });
}

export function useSalvarCotacao(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { insumoId: string; preco: number; fonte: string | null }) => {
      okVoid(
        await supabase
          .from('orcamento_insumo_precos')
          .upsert({ orcamento_id: orcamentoId, insumo_id: a.insumoId, preco: a.preco, fonte: a.fonte }, { onConflict: 'orcamento_id,insumo_id' }),
      );
      return ok(await supabase.rpc('fn_orcamento_recalcular', { p_orcamento_id: orcamentoId }));
    },
    onSuccess: () => {
      invalidarOrcamento(qc, orcamentoId);
      void qc.invalidateQueries({ queryKey: ['ref', 'composicao-analitica'] });
    },
  });
}

export function useExcluirCotacao(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (insumoId: string) => {
      okVoid(await supabase.from('orcamento_insumo_precos').delete().eq('orcamento_id', orcamentoId).eq('insumo_id', insumoId));
      return ok(await supabase.rpc('fn_orcamento_recalcular', { p_orcamento_id: orcamentoId }));
    },
    onSuccess: () => {
      invalidarOrcamento(qc, orcamentoId);
      void qc.invalidateQueries({ queryKey: ['ref', 'composicao-analitica'] });
    },
  });
}

/** Mantém o id da org disponível para chamadas que precisam (reexport conveniente). */
export { useOrgId };
