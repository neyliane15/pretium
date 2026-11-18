/**
 * Hooks de OBRAS (tabela do BACKEND-1, telas do FRONTEND-2).
 * Dono deste arquivo: FRONTEND-2 (exceção registrada em docs/DIVISAO_TRABALHO.md §3.1).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qkCore } from '@/api/core/keys';
import { ok, okVoid, useOrgId } from '@/api/orcamento/util';
import type { Obra, TablesInsert, TablesUpdate } from '@/types/database';

export interface ObraComCliente extends Obra {
  cliente: { id: string; nome: string } | null;
}

const SELECT_OBRA = '*, cliente:clientes(id, nome)';

export function useObras() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qkCore.obras(orgId),
    enabled: Boolean(orgId),
    queryFn: async (): Promise<ObraComCliente[]> => {
      const r = await supabase.from('obras').select(SELECT_OBRA).eq('organizacao_id', orgId).order('updated_at', { ascending: false });
      return ok(r) as unknown as ObraComCliente[];
    },
  });
}

export function useObra(id: string | undefined) {
  return useQuery({
    queryKey: qkCore.obra(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<ObraComCliente> => {
      const r = await supabase.from('obras').select(SELECT_OBRA).eq('id', id!).single();
      return ok(r) as unknown as ObraComCliente;
    },
  });
}

export type ObraInput = Omit<TablesInsert<'obras'>, 'organizacao_id'>;

/** Cria (sem `id`) ou atualiza (com `id`) uma obra da organização ativa. */
export function useSalvarObra() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ id, ...dados }: ObraInput & { id?: string }): Promise<Obra> => {
      if (id) {
        const r = await supabase.from('obras').update(dados as TablesUpdate<'obras'>).eq('id', id).select().single();
        return ok(r);
      }
      const r = await supabase.from('obras').insert({ ...dados, organizacao_id: orgId }).select().single();
      return ok(r);
    },
    onSuccess: (obra) => {
      void qc.invalidateQueries({ queryKey: qkCore.obras(orgId) });
      void qc.invalidateQueries({ queryKey: qkCore.obra(obra.id) });
      void qc.invalidateQueries({ queryKey: ['dash'] });
    },
  });
}

export function useExcluirObra() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (id: string) => okVoid(await supabase.from('obras').delete().eq('id', id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qkCore.obras(orgId) });
      void qc.invalidateQueries({ queryKey: ['dash'] });
    },
  });
}

/**
 * Lista enxuta de clientes para o seletor do formulário de obra.
 * (Os hooks completos de clientes são do FRONTEND-1; aqui só id/nome.)
 */
export function useClientesOpcoes() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [...qkCore.clientes(orgId), 'opcoes'] as const,
    enabled: Boolean(orgId),
    queryFn: async () => {
      const r = await supabase.from('clientes').select('id, nome').eq('organizacao_id', orgId).eq('ativo', true).order('nome');
      return ok(r);
    },
  });
}
