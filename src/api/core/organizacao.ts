/** Organização ativa: dados, logo, membros, convites. Dono: FRONTEND-1. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BUCKETS, supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Convite, ConviteDetalhe, MembroListado, Organizacao, OrgRole, TablesUpdate } from '@/types/database';
import { enviarImagem } from './arquivos';
import { qkCore } from './keys';
import { ok, okVoid, useOrgIdCore } from './util';

export type OrganizacaoInput = Omit<TablesUpdate<'organizacoes'>, 'id' | 'status' | 'created_by' | 'created_at' | 'updated_at' | 'logo_path'>;

function useInvalidarMinhas() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return () => qc.invalidateQueries({ queryKey: qkCore.minhasOrganizacoes(user?.id) });
}

export function useSalvarOrganizacao() {
  const orgId = useOrgIdCore();
  const invalidar = useInvalidarMinhas();
  return useMutation({
    mutationFn: async (dados: OrganizacaoInput): Promise<Organizacao> =>
      ok(await supabase.from('organizacoes').update(dados).eq('id', orgId).select().single()),
    onSuccess: () => invalidar(),
  });
}

export function useEnviarLogo() {
  const orgId = useOrgIdCore();
  const qc = useQueryClient();
  const invalidar = useInvalidarMinhas();
  return useMutation({
    mutationFn: async (file: File | null) => {
      let path: string | null = null;
      if (file) path = await enviarImagem(BUCKETS.logos, orgId, 'logo', file);
      okVoid(await supabase.from('organizacoes').update({ logo_path: path }).eq('id', orgId));
      return path;
    },
    onSuccess: async () => {
      await invalidar();
      await qc.invalidateQueries({ queryKey: ['core', 'arquivo-url', BUCKETS.logos] });
    },
  });
}

export function useCriarOrganizacao() {
  const { refreshProfile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nome, cnpj }: { nome: string; cnpj?: string | null }) =>
      ok(await supabase.rpc('criar_organizacao', { p_nome: nome, p_cnpj: cnpj || null })),
    onSuccess: async () => {
      await refreshProfile();
      await qc.invalidateQueries();
    },
  });
}

// ─── Membros ──────────────────────────────────────────────────────────────
export function useMembros(orgId?: string) {
  const ativa = useOrgIdCore();
  const id = orgId ?? ativa;
  return useQuery({
    queryKey: qkCore.membros(id),
    enabled: Boolean(id),
    queryFn: async (): Promise<MembroListado[]> => ok(await supabase.rpc('listar_membros', { p_organizacao_id: id })),
  });
}

export function useAlterarPapelMembro() {
  const orgId = useOrgIdCore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, papel }: { userId: string; papel: OrgRole }) =>
      okVoid(await supabase.rpc('alterar_papel_membro', { p_organizacao_id: orgId, p_user_id: userId, p_papel: papel })),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkCore.membros(orgId) }),
  });
}

export function useRemoverMembro() {
  const orgId = useOrgIdCore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => okVoid(await supabase.rpc('remover_membro', { p_organizacao_id: orgId, p_user_id: userId })),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkCore.membros(orgId) }),
  });
}

// ─── Convites ─────────────────────────────────────────────────────────────
export function useConvites() {
  const orgId = useOrgIdCore();
  return useQuery({
    queryKey: qkCore.convites(orgId),
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Convite[]> =>
      ok(await supabase.from('convites').select('*').eq('organizacao_id', orgId).eq('status', 'pending').order('created_at', { ascending: false })),
  });
}

export function useConvidarMembro() {
  const orgId = useOrgIdCore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, papel }: { email: string; papel: OrgRole }) =>
      ok(await supabase.rpc('convidar_membro', { p_organizacao_id: orgId, p_email: email.trim().toLowerCase(), p_papel: papel })),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkCore.convites(orgId) }),
  });
}

export function useRevogarConvite() {
  const orgId = useOrgIdCore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conviteId: string) => okVoid(await supabase.rpc('revogar_convite', { p_convite_id: conviteId })),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkCore.convites(orgId) }),
  });
}

export type ConvitePendente = ConviteDetalhe & { token: string };

/** Convites pendentes para o e-mail do usuário logado, com o nome da organização. */
export function useMeusConvites() {
  const { user, profile } = useAuth();
  return useQuery({
    queryKey: qkCore.meusConvites(user?.id),
    enabled: Boolean(user && profile?.status === 'active'),
    queryFn: async (): Promise<ConvitePendente[]> => {
      const convites: Convite[] = ok(await supabase.rpc('meus_convites'));
      const detalhes = await Promise.all(
        convites.map(async (c) => {
          const r = await supabase.rpc('obter_convite', { p_token: c.token });
          return r.data?.[0] ? { ...r.data[0], token: c.token } : null;
        }),
      );
      return detalhes.filter((d): d is ConvitePendente => d !== null);
    },
  });
}

export function useConvite(token: string | undefined) {
  return useQuery({
    queryKey: qkCore.convite(token ?? ''),
    enabled: Boolean(token),
    retry: false,
    queryFn: async (): Promise<ConviteDetalhe | null> => {
      const r = await supabase.rpc('obter_convite', { p_token: token! });
      return ok(r)[0] ?? null;
    },
  });
}

export function useAceitarConvite() {
  const { refreshProfile, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const orgId = ok(await supabase.rpc('aceitar_convite', { p_token: token }));
      // torna a organização recém-aceita a ativa
      await supabase.rpc('definir_organizacao_ativa', { p_organizacao_id: orgId });
      return orgId;
    },
    onSuccess: async () => {
      await refreshProfile();
      await qc.invalidateQueries({ queryKey: qkCore.minhasOrganizacoes(user?.id) });
      await qc.invalidateQueries({ queryKey: qkCore.meusConvites(user?.id) });
    },
  });
}
