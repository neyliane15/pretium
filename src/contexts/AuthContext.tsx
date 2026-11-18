import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

/**
 * CONTRATO (FRONTEND-1 é dono; FRONTEND-2 apenas consome):
 *   const { session, user, profile, loading, isAdmin, status, signOut, refreshProfile } = useAuth();
 */
export interface AuthApi {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** true até a sessão inicial e o perfil serem carregados */
  loading: boolean;
  isAdmin: boolean;
  status: Profile['status'] | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const carregarPerfil = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile(data ?? null);
  }, []);

  useEffect(() => {
    let ativo = true;
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!ativo) return;
        setSession(data.session);
        await carregarPerfil(data.session?.user.id);
      })
      .finally(() => ativo && setLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s);
      if (evento === 'SIGNED_IN' || evento === 'USER_UPDATED' || evento === 'SIGNED_OUT') {
        void carregarPerfil(s?.user.id);
      }
      if (evento === 'SIGNED_IN') void supabase.rpc('registrar_acesso');
    });
    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, [carregarPerfil]);

  const api = useMemo<AuthApi>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      isAdmin: profile?.papel_global === 'admin' && profile.status === 'active',
      status: profile?.status ?? null,
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
      },
      refreshProfile: () => carregarPerfil(session?.user.id),
    }),
    [session, profile, loading, carregarPerfil],
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return ctx;
}
