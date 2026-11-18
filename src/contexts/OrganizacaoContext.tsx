import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qkCore } from '@/api/core/keys';
import type { Organizacao, OrgRole } from '@/types/database';
import { useAuth } from './AuthContext';

/**
 * CONTRATO (FRONTEND-1 é dono; FRONTEND-2 apenas consome):
 *   const { organizacao, papel, podeEditar, isOwner, organizacoes, trocarOrganizacao, loading } = useOrganizacao();
 * Toda query de dados de organização deve filtrar por `organizacao.id`.
 */
export interface OrganizacaoComPapel {
  organizacao: Organizacao;
  papel: OrgRole;
}

export interface OrganizacaoApi {
  organizacao: Organizacao | null;
  papel: OrgRole | null;
  /** owner/editor (ou admin) em org ativa */
  podeEditar: boolean;
  isOwner: boolean;
  organizacoes: OrganizacaoComPapel[];
  trocarOrganizacao: (id: string) => Promise<void>;
  loading: boolean;
}

const OrganizacaoContext = createContext<OrganizacaoApi | null>(null);

export function OrganizacaoProvider({ children }: { children: ReactNode }) {
  const { user, profile, isAdmin, refreshProfile } = useAuth();
  const qc = useQueryClient();

  const { data: organizacoes = [], isLoading } = useQuery({
    queryKey: qkCore.minhasOrganizacoes(user?.id),
    enabled: Boolean(user && profile?.status === 'active'),
    queryFn: async (): Promise<OrganizacaoComPapel[]> => {
      const { data, error } = await supabase
        .from('organizacao_membros')
        .select('papel, organizacao:organizacoes(*)')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? [])
        .filter((m) => m.organizacao)
        .map((m) => ({ organizacao: m.organizacao as unknown as Organizacao, papel: m.papel }))
        .sort((a, b) => a.organizacao.nome.localeCompare(b.organizacao.nome, 'pt-BR'));
    },
  });

  const atual = organizacoes.find((o) => o.organizacao.id === profile?.organizacao_ativa_id) ?? organizacoes[0] ?? null;

  const trocarOrganizacao = useCallback(
    async (id: string) => {
      const { error } = await supabase.rpc('definir_organizacao_ativa', { p_organizacao_id: id });
      if (error) throw error;
      await refreshProfile();
      // dados de organização ficam em cache por org; invalida tudo para simplificar
      await qc.invalidateQueries();
    },
    [qc, refreshProfile],
  );

  const api = useMemo<OrganizacaoApi>(() => {
    const papel = atual?.papel ?? null;
    const ativa = atual?.organizacao.status === 'ativa';
    return {
      organizacao: atual?.organizacao ?? null,
      papel,
      podeEditar: isAdmin || (ativa && (papel === 'owner' || papel === 'editor')),
      isOwner: isAdmin || (ativa && papel === 'owner'),
      organizacoes,
      trocarOrganizacao,
      loading: isLoading,
    };
  }, [atual, isAdmin, organizacoes, trocarOrganizacao, isLoading]);

  return <OrganizacaoContext.Provider value={api}>{children}</OrganizacaoContext.Provider>;
}

export function useOrganizacao(): OrganizacaoApi {
  const ctx = useContext(OrganizacaoContext);
  if (!ctx) throw new Error('useOrganizacao precisa estar dentro de <OrganizacaoProvider>.');
  return ctx;
}
