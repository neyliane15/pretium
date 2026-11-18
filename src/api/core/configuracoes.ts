/** Configurações globais (§5.2). Dono: FRONTEND-1. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Configuracao, DataBase, Json } from '@/types/database';
import { qkCore } from './keys';
import { ok, okVoid } from './util';

/** Configurações visíveis ao usuário (RLS devolve só as públicas para não-admin). */
export function useConfiguracoesPublicas() {
  const { session } = useAuth();
  return useQuery({
    queryKey: qkCore.configuracoes(),
    enabled: Boolean(session),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, Json>> => {
      const rows: Pick<Configuracao, 'chave' | 'valor'>[] = ok(await supabase.from('configuracoes').select('chave, valor').eq('publica', true));
      return Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
    },
  });
}

/** Aviso global (faixa no topo) — string não vazia ou null. */
export function useAvisoGlobal(): string | null {
  const { data } = useConfiguracoesPublicas();
  const v = data?.aviso_global;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Data-base publicada mais recente visível ao usuário (para a faixa "dados de exemplo"). */
export function useDataBaseMaisRecente() {
  const { session, profile } = useAuth();
  return useQuery({
    queryKey: qkCore.dataBaseRecente(),
    enabled: Boolean(session && profile?.status === 'active'),
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Pick<DataBase, 'id' | 'uf' | 'ano' | 'mes' | 'regime' | 'is_demo'> | null> => {
      const r = await supabase
        .from('datas_base')
        .select('id, uf, ano, mes, regime, is_demo')
        .eq('status', 'publicada')
        .order('ano', { ascending: false })
        .order('mes', { ascending: false })
        .order('is_demo', { ascending: true })
        .limit(1);
      if (r.error) return null; // tabela do B2 pode ainda não existir
      return r.data?.[0] ?? null;
    },
  });
}

export function useConfiguracoesAdmin() {
  return useQuery({
    queryKey: qkCore.admin.configuracoes(),
    queryFn: async (): Promise<Configuracao[]> => ok(await supabase.from('configuracoes').select('*').order('chave')),
  });
}

export function useDefinirConfiguracao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ chave, valor }: { chave: string; valor: Json }) =>
      okVoid(await supabase.rpc('admin_definir_configuracao', { p_chave: chave, p_valor: valor })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qkCore.admin.configuracoes() });
      void qc.invalidateQueries({ queryKey: qkCore.configuracoes() });
    },
  });
}
