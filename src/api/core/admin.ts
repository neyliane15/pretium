/** Painel administrativo global. Dono: FRONTEND-1. RPCs de §7.1 (B1) e datas-base/importações (B2). */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  AdminEstatisticas, AppRole, AuditoriaLog, DataBase, DataBaseStatus, Organizacao, OrgRole, OrgStatus, SinapiImportacao, UserStatus, UsuarioAdmin,
} from '@/types/database';
import { qkCore } from './keys';
import { ok, okVoid, termoIlike } from './util';

export function useAdminEstatisticas() {
  return useQuery({
    queryKey: qkCore.admin.estatisticas(),
    queryFn: async (): Promise<AdminEstatisticas> => ok(await supabase.rpc('admin_estatisticas')),
  });
}

// ─── Usuários ─────────────────────────────────────────────────────────────
export interface FiltrosUsuarios {
  busca: string;
  status: UserStatus | '';
  page: number;
  pageSize: number;
}

export function useAdminUsuarios(f: FiltrosUsuarios) {
  return useQuery({
    queryKey: qkCore.admin.usuarios(f),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ linhas: UsuarioAdmin[]; total: number }> => {
      const linhas: UsuarioAdmin[] = ok(
        await supabase.rpc('admin_listar_usuarios', {
          p_busca: f.busca.trim() || null,
          p_status: f.status || null,
          p_limite: f.pageSize,
          p_offset: (f.page - 1) * f.pageSize,
        }),
      );
      return { linhas, total: Number(linhas[0]?.total_count ?? 0) };
    },
  });
}

function useInvalidarAdmin() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['admin'] });
  };
}

export function useDefinirStatusUsuario() {
  const inv = useInvalidarAdmin();
  return useMutation({
    mutationFn: async (a: { userId: string; status: UserStatus; motivo?: string | null }) =>
      okVoid(await supabase.rpc('admin_definir_status_usuario', { p_user_id: a.userId, p_status: a.status, p_motivo: a.motivo ?? null })),
    onSuccess: inv,
  });
}

export function useDefinirPapelGlobal() {
  const inv = useInvalidarAdmin();
  return useMutation({
    mutationFn: async (a: { userId: string; papel: AppRole }) =>
      okVoid(await supabase.rpc('admin_definir_papel_global', { p_user_id: a.userId, p_papel: a.papel })),
    onSuccess: inv,
  });
}

// ─── Organizações ─────────────────────────────────────────────────────────
export interface OrganizacaoAdmin extends Organizacao {
  membros: { count: number }[];
}

export function useAdminOrganizacoes() {
  return useQuery({
    queryKey: qkCore.admin.organizacoes(),
    queryFn: async (): Promise<OrganizacaoAdmin[]> => {
      const r = await supabase.from('organizacoes').select('*, membros:organizacao_membros(count)').order('nome');
      return ok(r) as unknown as OrganizacaoAdmin[];
    },
  });
}

export function useDefinirStatusOrganizacao() {
  const inv = useInvalidarAdmin();
  return useMutation({
    mutationFn: async (a: { orgId: string; status: OrgStatus }) =>
      okVoid(await supabase.rpc('admin_definir_status_organizacao', { p_organizacao_id: a.orgId, p_status: a.status })),
    onSuccess: inv,
  });
}

export function useAdminAdicionarMembro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { orgId: string; userId: string; papel: OrgRole }) =>
      okVoid(await supabase.rpc('admin_adicionar_membro', { p_organizacao_id: a.orgId, p_user_id: a.userId, p_papel: a.papel })),
    onSuccess: (_d, a) => {
      void qc.invalidateQueries({ queryKey: qkCore.membros(a.orgId) });
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

// ─── Auditoria ────────────────────────────────────────────────────────────
export interface FiltrosAuditoria {
  de: string | null;
  ate: string | null;
  usuario: string;
  entidade: string;
  acao: string;
  page: number;
  pageSize: number;
}

export function useAuditoria(f: FiltrosAuditoria) {
  return useQuery({
    queryKey: qkCore.admin.auditoria(f),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ linhas: AuditoriaLog[]; total: number }> => {
      let q = supabase.from('auditoria_logs').select('*', { count: 'exact' });
      if (f.de) q = q.gte('created_at', `${f.de}T00:00:00`);
      if (f.ate) q = q.lte('created_at', `${f.ate}T23:59:59.999`);
      if (f.usuario.trim()) q = q.ilike('user_email', termoIlike(f.usuario));
      if (f.entidade) q = q.eq('entidade', f.entidade);
      if (f.acao) q = q.eq('acao', f.acao);
      const de = (f.page - 1) * f.pageSize;
      const r = await q.order('created_at', { ascending: false }).range(de, de + f.pageSize - 1);
      if (r.error) throw r.error;
      return { linhas: r.data ?? [], total: r.count ?? 0 };
    },
  });
}

// ─── SINAPI: datas-base e importações ─────────────────────────────────────
export function useDatasBaseAdmin() {
  return useQuery({
    queryKey: qkCore.admin.datasBase(),
    queryFn: async (): Promise<DataBase[]> =>
      ok(
        await supabase
          .from('datas_base')
          .select('*')
          .order('ano', { ascending: false })
          .order('mes', { ascending: false })
          .order('uf')
          .order('regime'),
      ),
  });
}

export function usePublicarDataBase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; status: DataBaseStatus }) =>
      ok(await supabase.rpc('fn_sinapi_publicar_data_base', { p_data_base_id: a.id, p_status: a.status })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qkCore.admin.datasBase() });
      void qc.invalidateQueries({ queryKey: qkCore.dataBaseRecente() });
    },
  });
}

export interface ImportacaoComDataBase extends SinapiImportacao {
  data_base: Pick<DataBase, 'uf' | 'ano' | 'mes' | 'regime' | 'is_demo'> | null;
}

export function useImportacoes() {
  return useQuery({
    queryKey: qkCore.admin.importacoes(),
    queryFn: async (): Promise<ImportacaoComDataBase[]> => {
      const r = await supabase
        .from('sinapi_importacoes')
        .select('*, data_base:datas_base(uf, ano, mes, regime, is_demo)')
        .order('iniciado_em', { ascending: false })
        .limit(100);
      return ok(r) as unknown as ImportacaoComDataBase[];
    },
  });
}
