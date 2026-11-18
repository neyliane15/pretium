/**
 * Referências: datas-base, busca SINAPI/próprias, composições (analítica), composições e insumos
 * próprios, encargos sociais. Dono: FRONTEND-2. Contrato: ARQUITETURA §5.3, §7.2.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qkOrc } from './keys';
import { ok, okVoid, useOrgId } from './util';
import type {
  Composicao, ComposicaoItemTipo, DataBase, EncargosSociais, EncargosSociaisItem, Insumo, InsumoTipo,
  ReferenciaBusca, TablesInsert, TablesUpdate,
} from '@/types/database';

// ─── Datas-base ───────────────────────────────────────────────────────────

/** Datas-base publicadas (RLS já restringe), mais recentes primeiro. */
export function useDatasBase(filtros?: { uf?: string }) {
  return useQuery({
    queryKey: qkOrc.datasBase(filtros),
    queryFn: async (): Promise<DataBase[]> => {
      let q = supabase.from('datas_base').select('*').eq('status', 'publicada');
      if (filtros?.uf) q = q.eq('uf', filtros.uf);
      const r = await q.order('ano', { ascending: false }).order('mes', { ascending: false }).order('regime');
      return ok(r);
    },
    staleTime: 5 * 60_000,
  });
}

export function useDataBase(id: string | null | undefined) {
  const lista = useDatasBase();
  return { ...lista, data: lista.data?.find((d) => d.id === id) ?? null };
}

// ─── Busca ────────────────────────────────────────────────────────────────

export type TipoBusca = 'insumo' | 'composicao' | null;

export async function buscarReferencias(termo: string, dataBaseId: string, orgId: string | null, tipo: TipoBusca, limite = 50): Promise<ReferenciaBusca[]> {
  const r = await supabase.rpc('fn_buscar_referencias', {
    p_termo: termo,
    p_data_base_id: dataBaseId,
    p_organizacao_id: orgId,
    p_tipo: tipo,
    p_limite: limite,
  });
  return ok(r) ?? [];
}

export function useBuscarReferencias(termo: string, dataBaseId: string | null | undefined, tipo: TipoBusca, limite = 50) {
  const orgId = useOrgId();
  const t = termo.trim();
  return useQuery({
    queryKey: qkOrc.buscaReferencias(dataBaseId ?? '', t, tipo),
    enabled: Boolean(dataBaseId) && t.length >= 2,
    placeholderData: keepPreviousData,
    queryFn: () => buscarReferencias(t, dataBaseId!, orgId || null, tipo, limite),
    staleTime: 60_000,
  });
}

// ─── Composições ──────────────────────────────────────────────────────────

export function useComposicao(id: string | undefined) {
  return useQuery({
    queryKey: qkOrc.composicao(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Composicao> => ok(await supabase.from('composicoes').select('*').eq('id', id!).single()),
  });
}

export function useComposicaoAnalitica(id: string | null | undefined, dataBaseId: string | null | undefined, orcamentoId?: string | null) {
  return useQuery({
    queryKey: qkOrc.composicaoAnalitica(id ?? '', dataBaseId ?? '', orcamentoId),
    enabled: Boolean(id && dataBaseId),
    queryFn: async () => {
      const r = await supabase.rpc('fn_composicao_analitica', { p_composicao_id: id!, p_data_base_id: dataBaseId!, p_orcamento_id: orcamentoId ?? null });
      return ok(r) ?? [];
    },
  });
}

/** Custo oficial publicado (composicao_precos) na data-base, quando existir. */
export function useComposicaoPrecoOficial(id: string | undefined, dataBaseId: string | null | undefined) {
  return useQuery({
    queryKey: ['ref', 'composicao-preco', id ?? '', dataBaseId ?? ''],
    enabled: Boolean(id && dataBaseId),
    queryFn: async () => {
      const r = await supabase.from('composicao_precos').select('*').eq('composicao_id', id!).eq('data_base_id', dataBaseId!).maybeSingle();
      return ok(r);
    },
  });
}

export function useComposicoesProprias() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qkOrc.composicoesProprias(orgId),
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Composicao[]> =>
      ok(await supabase.from('composicoes').select('*').eq('organizacao_id', orgId).order('codigo')),
  });
}

export interface ComposicaoItemDetalhe {
  id: string;
  composicao_id: string;
  tipo_item: ComposicaoItemTipo;
  insumo_id: string | null;
  subcomposicao_id: string | null;
  coeficiente: number;
  ordem: number;
  insumo: Pick<Insumo, 'id' | 'codigo' | 'descricao' | 'unidade' | 'tipo' | 'fonte' | 'is_demo'> | null;
  subcomposicao: Pick<Composicao, 'id' | 'codigo' | 'descricao' | 'unidade' | 'fonte' | 'is_demo'> | null;
}

export function useComposicaoItens(composicaoId: string | undefined) {
  return useQuery({
    queryKey: [...qkOrc.composicao(composicaoId ?? ''), 'itens'] as const,
    enabled: Boolean(composicaoId),
    queryFn: async (): Promise<ComposicaoItemDetalhe[]> => {
      const r = await supabase
        .from('composicao_itens')
        .select(
          'id, composicao_id, tipo_item, insumo_id, subcomposicao_id, coeficiente, ordem, ' +
            'insumo:insumos!composicao_itens_insumo_id_fkey(id, codigo, descricao, unidade, tipo, fonte, is_demo), ' +
            'subcomposicao:composicoes!composicao_itens_subcomposicao_id_fkey(id, codigo, descricao, unidade, fonte, is_demo)',
        )
        .eq('composicao_id', composicaoId!)
        .order('ordem');
      return ok(r) as unknown as ComposicaoItemDetalhe[];
    },
  });
}

export interface ComposicaoPropriaInput {
  id?: string;
  codigo: string;
  descricao: string;
  unidade: string;
  grupo: string | null;
  observacao: string | null;
  itens: { tipo_item: ComposicaoItemTipo; referencia_id: string; coeficiente: number }[];
}

/**
 * Salva cabeçalho + substitui itens da composição própria.
 * (Sem RPC dedicada no contrato: upsert do cabeçalho e troca dos itens via tabela, protegida por RLS.)
 */
export function useSalvarComposicaoPropria() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (input: ComposicaoPropriaInput): Promise<string> => {
      const cab = {
        codigo: input.codigo.trim(),
        descricao: input.descricao.trim(),
        unidade: input.unidade.trim().toUpperCase(),
        grupo: input.grupo,
        observacao: input.observacao,
      };
      let id = input.id;
      if (id) {
        okVoid(await supabase.from('composicoes').update(cab).eq('id', id));
        okVoid(await supabase.from('composicao_itens').delete().eq('composicao_id', id));
      } else {
        const r = await supabase.from('composicoes').insert({ ...cab, organizacao_id: orgId, fonte: 'propria' }).select('id').single();
        id = ok(r).id;
      }
      if (input.itens.length) {
        const linhas: TablesInsert<'composicao_itens'>[] = input.itens.map((it, i) => ({
          composicao_id: id!,
          tipo_item: it.tipo_item,
          insumo_id: it.tipo_item === 'insumo' ? it.referencia_id : null,
          subcomposicao_id: it.tipo_item === 'composicao' ? it.referencia_id : null,
          coeficiente: it.coeficiente,
          ordem: i + 1,
        }));
        okVoid(await supabase.from('composicao_itens').insert(linhas));
      }
      return id!;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: qkOrc.composicoesProprias(orgId) });
      void qc.invalidateQueries({ queryKey: qkOrc.composicao(id) });
      void qc.invalidateQueries({ queryKey: ['ref', 'composicao-analitica', id] });
    },
  });
}

export function useExcluirComposicaoPropria() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (id: string) => okVoid(await supabase.from('composicoes').delete().eq('id', id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qkOrc.composicoesProprias(orgId) }),
  });
}

// ─── Insumos próprios ─────────────────────────────────────────────────────

export function useInsumosProprios() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qkOrc.insumosProprios(orgId),
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Insumo[]> => ok(await supabase.from('insumos').select('*').eq('organizacao_id', orgId).order('codigo')),
  });
}

export interface InsumoPropioInput {
  id?: string;
  codigo: string;
  descricao: string;
  unidade: string;
  tipo: InsumoTipo;
  classificacao: string | null;
  preco_proprio: number | null;
  preco_proprio_data: string | null;
  ativo: boolean;
}

export function useSalvarInsumoProprio() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ id, ...d }: InsumoPropioInput) => {
      const dados = { ...d, codigo: d.codigo.trim(), unidade: d.unidade.trim().toUpperCase() };
      if (id) return ok(await supabase.from('insumos').update(dados as TablesUpdate<'insumos'>).eq('id', id).select().single());
      return ok(await supabase.from('insumos').insert({ ...dados, organizacao_id: orgId, fonte: 'propria' }).select().single());
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qkOrc.insumosProprios(orgId) }),
  });
}

export function useExcluirInsumoProprio() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (id: string) => okVoid(await supabase.from('insumos').delete().eq('id', id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qkOrc.insumosProprios(orgId) }),
  });
}

// ─── Encargos sociais ─────────────────────────────────────────────────────

/** Tabelas globais (organizacao_id null) + da organização ativa. */
export function useEncargos() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qkOrc.encargos(orgId || null),
    queryFn: async (): Promise<EncargosSociais[]> => {
      let q = supabase.from('encargos_sociais').select('*');
      q = orgId ? q.or(`organizacao_id.is.null,organizacao_id.eq.${orgId}`) : q.is('organizacao_id', null);
      return ok(await q.order('nome'));
    },
  });
}

export function useEncargosDetalhe(id: string | null | undefined) {
  return useQuery({
    queryKey: qkOrc.encargosDetalhe(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<{ encargos: EncargosSociais; itens: EncargosSociaisItem[] }> => {
      const [e, i] = await Promise.all([
        supabase.from('encargos_sociais').select('*').eq('id', id!).single(),
        supabase.from('encargos_sociais_itens').select('*').eq('encargos_sociais_id', id!).order('grupo').order('ordem'),
      ]);
      return { encargos: ok(e), itens: ok(i) };
    },
  });
}

export function useDuplicarEncargos() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ encargosId, nome }: { encargosId: string; nome: string }) =>
      ok(await supabase.rpc('fn_encargos_duplicar', { p_encargos_id: encargosId, p_organizacao_id: orgId, p_nome: nome })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qkOrc.encargos(orgId || null) }),
  });
}

export function useSalvarEncargos() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      cabecalho: TablesUpdate<'encargos_sociais'>;
      itens: (Omit<TablesInsert<'encargos_sociais_itens'>, 'encargos_sociais_id'> & { id?: string })[];
      removidos: string[];
    }) => {
      okVoid(await supabase.from('encargos_sociais').update(input.cabecalho).eq('id', input.id));
      if (input.removidos.length) okVoid(await supabase.from('encargos_sociais_itens').delete().in('id', input.removidos));
      for (const it of input.itens) {
        const { id, ...d } = it;
        if (id) okVoid(await supabase.from('encargos_sociais_itens').update(d).eq('id', id));
        else okVoid(await supabase.from('encargos_sociais_itens').insert({ ...d, encargos_sociais_id: input.id }));
      }
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: qkOrc.encargosDetalhe(v.id) });
      void qc.invalidateQueries({ queryKey: qkOrc.encargos(orgId || null) });
    },
  });
}

export function useExcluirEncargos() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (id: string) => okVoid(await supabase.from('encargos_sociais').delete().eq('id', id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qkOrc.encargos(orgId || null) }),
  });
}
