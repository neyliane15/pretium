/** Clientes da organização ativa. Dono: FRONTEND-1. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Cliente, Obra, PessoaTipo, TablesInsert, TablesUpdate } from '@/types/database';
import { qkCore } from './keys';
import { ok, okVoid, termoIlike, useOrgIdCore } from './util';

export interface FiltrosClientes {
  busca?: string;
  tipo?: PessoaTipo | '';
  /** 'ativos' (padrão) | 'inativos' | 'todos' */
  situacao?: 'ativos' | 'inativos' | 'todos';
  page?: number;
  pageSize?: number;
}

export function useClientes(f: FiltrosClientes = {}) {
  const orgId = useOrgIdCore();
  const { busca = '', tipo = '', situacao = 'ativos', page = 1, pageSize = 50 } = f;
  return useQuery({
    queryKey: [...qkCore.clientes(orgId), { busca, tipo, situacao, page, pageSize }] as const,
    enabled: Boolean(orgId),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ linhas: Cliente[]; total: number }> => {
      let q = supabase.from('clientes').select('*', { count: 'exact' }).eq('organizacao_id', orgId);
      if (busca.trim()) {
        const t = termoIlike(busca);
        const dig = busca.replace(/\D/g, '');
        q = q.or(`nome.ilike.${t},nome_fantasia.ilike.${t},email.ilike.${t}${dig.length >= 3 ? `,documento.ilike.%${dig}%` : ''}`);
      }
      if (tipo) q = q.eq('tipo', tipo);
      if (situacao === 'ativos') q = q.eq('ativo', true);
      if (situacao === 'inativos') q = q.eq('ativo', false);
      const de = (page - 1) * pageSize;
      const r = await q.order('nome').range(de, de + pageSize - 1);
      if (r.error) throw r.error;
      return { linhas: r.data ?? [], total: r.count ?? 0 };
    },
  });
}

export function useCliente(id: string | undefined) {
  return useQuery({
    queryKey: qkCore.cliente(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Cliente> => ok(await supabase.from('clientes').select('*').eq('id', id!).single()),
  });
}

export function useObrasDoCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: qkCore.obrasDoCliente(clienteId ?? ''),
    enabled: Boolean(clienteId),
    queryFn: async (): Promise<Pick<Obra, 'id' | 'codigo' | 'nome' | 'status' | 'municipio' | 'uf' | 'updated_at'>[]> =>
      ok(
        await supabase
          .from('obras')
          .select('id, codigo, nome, status, municipio, uf, updated_at')
          .eq('cliente_id', clienteId!)
          .order('updated_at', { ascending: false }),
      ),
  });
}

export type ClienteInput = Omit<TablesInsert<'clientes'>, 'organizacao_id'>;

export function useSalvarCliente() {
  const qc = useQueryClient();
  const orgId = useOrgIdCore();
  return useMutation({
    mutationFn: async ({ id, ...dados }: ClienteInput & { id?: string }): Promise<Cliente> => {
      if (id) return ok(await supabase.from('clientes').update(dados as TablesUpdate<'clientes'>).eq('id', id).select().single());
      return ok(await supabase.from('clientes').insert({ ...dados, organizacao_id: orgId }).select().single());
    },
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: qkCore.clientes(orgId) });
      qc.setQueryData(qkCore.cliente(c.id), c);
    },
  });
}

export function useExcluirCliente() {
  const qc = useQueryClient();
  const orgId = useOrgIdCore();
  return useMutation({
    mutationFn: async (id: string) => okVoid(await supabase.from('clientes').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkCore.clientes(orgId) }),
  });
}
