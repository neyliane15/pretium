import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** `false` quando as variáveis de ambiente não foram configuradas (a UI mostra um aviso). */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured && import.meta.env.MODE !== 'test') {
  console.warn(
    '[Pretium] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes. Copie .env.example para .env.local.',
  );
}

export const supabase = createClient<Database>(
  url ?? 'http://127.0.0.1:54321',
  anonKey ?? 'public-anon-key-nao-configurada',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'pretium.auth',
    },
    global: { headers: { 'x-client-info': 'pretium-web' } },
  },
);

/** Buckets de Storage (docs/ARQUITETURA.md §11). */
export const BUCKETS = {
  logos: 'logos',
  avatares: 'avatares',
  sinapiArquivos: 'sinapi-arquivos',
} as const;

/**
 * Normaliza erros do PostgREST/RPC em mensagem pt-BR exibível.
 * As funções SQL já lançam mensagens em português (errcode P0001 / 42501).
 */
export function mensagemErro(err: unknown): string {
  if (!err) return 'Erro desconhecido.';
  if (typeof err === 'string') return err;
  const e = err as { message?: string; code?: string; details?: string };
  if (e.code === '42501') return e.message && !/permission denied/i.test(e.message) ? e.message : 'Você não tem permissão para esta ação.';
  if (e.code === '23505') return 'Registro duplicado: já existe um item com estes dados.';
  if (e.code === '23503') return 'Não é possível concluir: o registro está em uso ou referência inexistente.';
  if (e.code === 'PGRST116') return 'Registro não encontrado.';
  if (e.message === 'Failed to fetch') return 'Sem conexão com o servidor.';
  return e.message ?? 'Erro inesperado.';
}
