/** Ações de autenticação (Supabase Auth). Dono: FRONTEND-1. */
import { supabase } from '@/lib/supabase';
import { rotas } from '@/routes';

const traduzir = (msg: string): string => {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar (verifique a caixa de entrada).';
  if (/user already registered/i.test(msg)) return 'Já existe uma conta com este e-mail.';
  if (/password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (/signups not allowed|signup.*disabled/i.test(msg)) return 'O cadastro de novas contas está desativado.';
  if (/same.*password|different from the old/i.test(msg)) return 'A nova senha precisa ser diferente da atual.';
  if (/failed to fetch/i.test(msg)) return 'Sem conexão com o servidor.';
  if (/session.*missing|auth session/i.test(msg)) return 'Link expirado ou inválido. Solicite um novo e-mail.';
  return msg;
};

async function run(p: Promise<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await p;
  if (error) throw new Error(traduzir(error.message));
}

export const authApi = {
  entrar: (email: string, senha: string) => run(supabase.auth.signInWithPassword({ email: email.trim(), password: senha })),

  cadastrar: (nome: string, email: string, senha: string) =>
    run(
      supabase.auth.signUp({
        email: email.trim(),
        password: senha,
        options: { data: { nome: nome.trim() }, emailRedirectTo: `${window.location.origin}${rotas.login}` },
      }),
    ),

  recuperarSenha: (email: string) =>
    run(supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}${rotas.redefinirSenha}` })),

  redefinirSenha: (senha: string) => run(supabase.auth.updateUser({ password: senha })),

  /** Troca de senha com sessão ativa: confirma a senha atual antes. */
  trocarSenha: async (email: string, atual: string, nova: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: atual });
    if (error) throw new Error('Senha atual incorreta.');
    await run(supabase.auth.updateUser({ password: nova }));
  },
};
