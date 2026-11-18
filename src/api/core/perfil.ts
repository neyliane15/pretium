/** Perfil do usuário logado. Dono: FRONTEND-1. */
import { useMutation } from '@tanstack/react-query';
import { BUCKETS, supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Tema, TablesUpdate } from '@/types/database';
import { enviarImagem } from './arquivos';
import { okVoid } from './util';

export type PerfilInput = Pick<TablesUpdate<'profiles'>, 'nome' | 'telefone' | 'crea_cau' | 'tema'>;

export function useAtualizarPerfil() {
  const { user, refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (dados: PerfilInput) => okVoid(await supabase.from('profiles').update(dados).eq('id', user!.id)),
    onSuccess: () => refreshProfile(),
  });
}

export function useEnviarAvatar() {
  const { user, refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (file: File | null) => {
      let path: string | null = null;
      if (file) path = await enviarImagem(BUCKETS.avatares, user!.id, 'avatar', file);
      okVoid(await supabase.from('profiles').update({ avatar_path: path }).eq('id', user!.id));
    },
    onSuccess: () => refreshProfile(),
  });
}

/** Persiste a preferência de tema no perfil (best-effort, sem bloquear a UI). */
export async function salvarTemaPerfil(userId: string, tema: Tema): Promise<void> {
  await supabase.from('profiles').update({ tema }).eq('id', userId);
}
