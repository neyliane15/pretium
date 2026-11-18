/**
 * Análises e módulos do orçamento: curva ABC, cronograma, medições, mão de obra, honorários,
 * dashboard. Dono: FRONTEND-2. Contrato: ARQUITETURA §7.2.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qkOrc } from './keys';
import { invalidarOrcamento } from './orcamentos';
import { ok, okVoid, useOrgId } from './util';
import type {
  Cronograma, CronogramaPeriodicidade, DashboardResumo, EncargosSociais, Honorario, HonorarioDisciplina, Json, Medicao, MedicaoItem,
  MedicaoStatus, OrcamentoEquipe, OrcamentoEquipeMembro, TablesInsert, TablesUpdate,
} from '@/types/database';

// ─── Curva ABC ────────────────────────────────────────────────────────────

export function useCurvaAbcServicos(orcamentoId: string | undefined) {
  return useQuery({
    queryKey: qkOrc.curvaAbcServicos(orcamentoId ?? ''),
    enabled: Boolean(orcamentoId),
    queryFn: async () => ok(await supabase.rpc('fn_curva_abc_servicos', { p_orcamento_id: orcamentoId! })) ?? [],
  });
}

export function useCurvaAbcInsumos(orcamentoId: string | undefined) {
  return useQuery({
    queryKey: qkOrc.curvaAbcInsumos(orcamentoId ?? ''),
    enabled: Boolean(orcamentoId),
    queryFn: async () => ok(await supabase.rpc('fn_curva_abc_insumos', { p_orcamento_id: orcamentoId! })) ?? [],
  });
}

// ─── Cronograma ───────────────────────────────────────────────────────────

export interface CronogramaCompleto {
  cronograma: Cronograma | null;
  distribuicoes: { etapa_id: string; periodo: number; percentual: number }[];
}

export function useCronograma(orcamentoId: string | undefined) {
  return useQuery({
    queryKey: qkOrc.cronograma(orcamentoId ?? ''),
    enabled: Boolean(orcamentoId),
    queryFn: async (): Promise<CronogramaCompleto> => {
      const c = ok(await supabase.from('cronogramas').select('*').eq('orcamento_id', orcamentoId!).maybeSingle()) as Cronograma | null;
      if (!c) return { cronograma: null, distribuicoes: [] };
      const d = ok(await supabase.from('cronograma_distribuicoes').select('etapa_id, periodo, percentual').eq('cronograma_id', c.id));
      return { cronograma: c, distribuicoes: d };
    },
  });
}

export function useCronogramaFisicoFinanceiro(orcamentoId: string | undefined, habilitado = true) {
  return useQuery({
    queryKey: [...qkOrc.cronograma(orcamentoId ?? ''), 'ff'] as const,
    enabled: Boolean(orcamentoId) && habilitado,
    queryFn: async () => ok(await supabase.rpc('fn_cronograma_fisico_financeiro', { p_orcamento_id: orcamentoId! })) ?? [],
  });
}

export function useSalvarCronograma(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: {
      dataInicio: string;
      periodicidade: CronogramaPeriodicidade;
      numPeriodos: number;
      distribuicoes: { etapa_id: string; periodo: number; percentual: number }[];
    }) =>
      ok(
        await supabase.rpc('fn_cronograma_salvar', {
          p_orcamento_id: orcamentoId,
          p_data_inicio: a.dataInicio,
          p_periodicidade: a.periodicidade,
          p_num_periodos: a.numPeriodos,
          p_distribuicoes: a.distribuicoes as unknown as Json,
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qkOrc.cronograma(orcamentoId) }),
  });
}

// ─── Medições ─────────────────────────────────────────────────────────────

export function useMedicoes(orcamentoId: string | undefined) {
  return useQuery({
    queryKey: qkOrc.medicoes(orcamentoId ?? ''),
    enabled: Boolean(orcamentoId),
    queryFn: async (): Promise<Medicao[]> =>
      ok(await supabase.from('medicoes').select('*').eq('orcamento_id', orcamentoId!).order('numero')),
  });
}

export function useMedicao(medicaoId: string | undefined) {
  return useQuery({
    queryKey: qkOrc.medicao(medicaoId ?? ''),
    enabled: Boolean(medicaoId),
    queryFn: async (): Promise<Medicao> => ok(await supabase.from('medicoes').select('*').eq('id', medicaoId!).single()),
  });
}

export function useMedicaoResumo(medicaoId: string | undefined) {
  return useQuery({
    queryKey: [...qkOrc.medicao(medicaoId ?? ''), 'resumo'] as const,
    enabled: Boolean(medicaoId),
    queryFn: async () => ok(await supabase.rpc('fn_medicao_resumo', { p_medicao_id: medicaoId! })) ?? [],
  });
}

export function useMedicaoItens(medicaoId: string | undefined) {
  return useQuery({
    queryKey: [...qkOrc.medicao(medicaoId ?? ''), 'itens'] as const,
    enabled: Boolean(medicaoId),
    queryFn: async (): Promise<MedicaoItem[]> => ok(await supabase.from('medicao_itens').select('*').eq('medicao_id', medicaoId!)),
  });
}

export function useCriarMedicao(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { inicio: string; fim: string }) =>
      ok(await supabase.rpc('fn_medicao_criar', { p_orcamento_id: orcamentoId, p_periodo_inicio: a.inicio, p_periodo_fim: a.fim })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qkOrc.medicoes(orcamentoId) });
      void qc.invalidateQueries({ queryKey: ['dash'] });
    },
  });
}

/** Grava a quantidade medida de um item (upsert por medicao_id + item_id; 0 remove). */
export function useSalvarMedicaoItem(medicaoId: string, orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { itemId: string; quantidade: number }) => {
      if (a.quantidade <= 0) {
        okVoid(await supabase.from('medicao_itens').delete().eq('medicao_id', medicaoId).eq('item_id', a.itemId));
        return;
      }
      okVoid(
        await supabase
          .from('medicao_itens')
          .upsert({ medicao_id: medicaoId, item_id: a.itemId, quantidade: a.quantidade }, { onConflict: 'medicao_id,item_id' }),
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qkOrc.medicao(medicaoId) });
      void qc.invalidateQueries({ queryKey: qkOrc.medicoes(orcamentoId) });
    },
  });
}

export function useAtualizarMedicao(medicaoId: string, orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { status?: MedicaoStatus; observacoes?: string | null; data_medicao?: string }) =>
      okVoid(await supabase.from('medicoes').update(d).eq('id', medicaoId)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qkOrc.medicao(medicaoId) });
      void qc.invalidateQueries({ queryKey: qkOrc.medicoes(orcamentoId) });
      void qc.invalidateQueries({ queryKey: ['dash'] });
    },
  });
}

export function useExcluirMedicao(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => okVoid(await supabase.from('medicoes').delete().eq('id', id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qkOrc.medicoes(orcamentoId) }),
  });
}

// ─── Mão de obra ──────────────────────────────────────────────────────────

export interface EquipeComMembros extends OrcamentoEquipe {
  membros: OrcamentoEquipeMembro[];
}

export function useEquipes(orcamentoId: string | undefined) {
  return useQuery({
    queryKey: [...qkOrc.maoObra(orcamentoId ?? ''), 'equipes'] as const,
    enabled: Boolean(orcamentoId),
    queryFn: async (): Promise<EquipeComMembros[]> => {
      const r = await supabase
        .from('orcamento_equipes')
        .select('*, membros:orcamento_equipe_membros!orcamento_equipe_membros_equipe_id_fkey(*)')
        .eq('orcamento_id', orcamentoId!)
        .order('ordem');
      const eqs = ok(r) as unknown as EquipeComMembros[];
      return eqs.map((e) => ({ ...e, membros: [...(e.membros ?? [])].sort((a, b) => a.ordem - b.ordem) }));
    },
  });
}

export function useMaoObraResumo(orcamentoId: string | undefined) {
  return useQuery({
    queryKey: [...qkOrc.maoObra(orcamentoId ?? ''), 'resumo'] as const,
    enabled: Boolean(orcamentoId),
    queryFn: async () => ok(await supabase.rpc('fn_mao_obra_resumo', { p_orcamento_id: orcamentoId! })) ?? [],
  });
}

export function useMaoObraHoras(orcamentoId: string | undefined) {
  return useQuery({
    queryKey: [...qkOrc.maoObra(orcamentoId ?? ''), 'horas'] as const,
    enabled: Boolean(orcamentoId),
    queryFn: async () => ok(await supabase.rpc('fn_mao_obra_horas_orcamento', { p_orcamento_id: orcamentoId! })) ?? [],
  });
}

export function useSalvarEquipe(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...d }: { id?: string; nome: string; descricao?: string | null; ordem?: number }) => {
      if (id) okVoid(await supabase.from('orcamento_equipes').update(d).eq('id', id));
      else okVoid(await supabase.from('orcamento_equipes').insert({ ...d, orcamento_id: orcamentoId }));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qkOrc.maoObra(orcamentoId) }),
  });
}

export function useExcluirEquipe(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => okVoid(await supabase.from('orcamento_equipes').delete().eq('id', id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qkOrc.maoObra(orcamentoId) }),
  });
}

export function useSalvarMembro(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...d }: Omit<TablesInsert<'orcamento_equipe_membros'>, 'id'> & { id?: string }) => {
      if (id) okVoid(await supabase.from('orcamento_equipe_membros').update(d as TablesUpdate<'orcamento_equipe_membros'>).eq('id', id));
      else okVoid(await supabase.from('orcamento_equipe_membros').insert(d));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qkOrc.maoObra(orcamentoId) }),
  });
}

export function useExcluirMembro(orcamentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => okVoid(await supabase.from('orcamento_equipe_membros').delete().eq('id', id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qkOrc.maoObra(orcamentoId) }),
  });
}

/** Encargos (total horista) do orçamento — usado no custo-hora de membros sem insumo. */
export function useEncargosDoOrcamento(encargosId: string | null | undefined) {
  return useQuery({
    queryKey: ['ref', 'encargos', 'cab', encargosId ?? ''],
    enabled: Boolean(encargosId),
    queryFn: async (): Promise<EncargosSociais> => ok(await supabase.from('encargos_sociais').select('*').eq('id', encargosId!).single()) as EncargosSociais,
  });
}

// ─── Honorários ───────────────────────────────────────────────────────────

export interface HonorarioLista extends Honorario {
  obra: { id: string; nome: string } | null;
}

export function useHonorarios(obraId?: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [...qkOrc.honorarios(orgId), obraId ?? null] as const,
    enabled: Boolean(orgId),
    queryFn: async (): Promise<HonorarioLista[]> => {
      let q = supabase.from('honorarios').select('*, obra:obras!honorarios_obra_id_fkey(id, nome)').eq('organizacao_id', orgId);
      if (obraId) q = q.eq('obra_id', obraId);
      return ok(await q.order('updated_at', { ascending: false })) as unknown as HonorarioLista[];
    },
  });
}

export function useHonorario(id: string | undefined) {
  return useQuery({
    queryKey: qkOrc.honorario(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<{ honorario: HonorarioLista; disciplinas: HonorarioDisciplina[] }> => {
      const [h, d] = await Promise.all([
        supabase.from('honorarios').select('*, obra:obras!honorarios_obra_id_fkey(id, nome)').eq('id', id!).single(),
        supabase.from('honorario_disciplinas').select('*').eq('honorario_id', id!).order('ordem'),
      ]);
      return { honorario: ok(h) as unknown as HonorarioLista, disciplinas: ok(d) };
    },
  });
}

export function useCriarHonorario() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (d: { obra_id: string; nome: string; area_m2?: number | null; orcamento_id?: string | null }) =>
      (ok(await supabase.from('honorarios').insert({ ...d, organizacao_id: orgId }).select('id').single()) as { id: string }).id,
    onSuccess: () => void qc.invalidateQueries({ queryKey: qkOrc.honorarios(orgId) }),
  });
}

export type DisciplinaInput = Omit<TablesInsert<'honorario_disciplinas'>, 'honorario_id' | 'valor'> & { id?: string };

/** Salva cabeçalho + disciplinas e chama `fn_honorario_recalcular` (valores oficiais pelo SQL). */
export function useSalvarHonorario(id: string) {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (a: { cabecalho: TablesUpdate<'honorarios'>; disciplinas: DisciplinaInput[]; removidas: string[] }) => {
      okVoid(await supabase.from('honorarios').update(a.cabecalho).eq('id', id));
      if (a.removidas.length) okVoid(await supabase.from('honorario_disciplinas').delete().in('id', a.removidas));
      for (const [i, d] of a.disciplinas.entries()) {
        const { id: did, ...dados } = d;
        const row = { ...dados, ordem: i + 1 };
        if (did) okVoid(await supabase.from('honorario_disciplinas').update(row).eq('id', did));
        else okVoid(await supabase.from('honorario_disciplinas').insert({ ...row, honorario_id: id }));
      }
      return ok(await supabase.rpc('fn_honorario_recalcular', { p_honorario_id: id }));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qkOrc.honorario(id) });
      void qc.invalidateQueries({ queryKey: qkOrc.honorarios(orgId) });
    },
  });
}

export function useExcluirHonorario() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (id: string) => okVoid(await supabase.from('honorarios').delete().eq('id', id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qkOrc.honorarios(orgId) }),
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────

export function useDashboard() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qkOrc.dashboard(orgId),
    enabled: Boolean(orgId),
    queryFn: async (): Promise<DashboardResumo> => ok(await supabase.rpc('fn_dashboard_resumo', { p_organizacao_id: orgId })),
  });
}

export { invalidarOrcamento };
