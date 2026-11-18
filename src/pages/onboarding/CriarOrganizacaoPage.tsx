import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Field, Input } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { mensagemErro, supabase } from '@/lib/supabase';
import { rotas } from '@/routes';
import { AuthLayout } from '@/pages/auth/AuthLayout';

/** Dono: FRONTEND-1. Versão inicial funcional; F1 refina (CNPJ, convites pendentes, etc.). */
export default function CriarOrganizacaoPage() {
  const { refreshProfile, signOut } = useAuth();
  const { organizacao } = useOrganizacao();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (organizacao) return <Navigate to={rotas.dashboard} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (nome.trim().length < 2) return setErro('Informe o nome do escritório.');
    setEnviando(true);
    const { error } = await supabase.rpc('criar_organizacao', { p_nome: nome.trim() });
    setEnviando(false);
    if (error) return setErro(mensagemErro(error));
    await refreshProfile();
    await qc.invalidateQueries();
    nav(rotas.dashboard, { replace: true });
  };

  return (
    <AuthLayout titulo="Crie seu escritório" subtitulo="Orçamentos, obras e clientes ficam organizados por escritório." rodape={<button className="hover:underline" onClick={() => void signOut()}>Sair</button>}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field label="Nome do escritório" required error={erro}>
          {(p) => <Input {...p} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Silva Engenharia" />}
        </Field>
        <Button type="submit" variant="primary" block loading={enviando}>
          Criar e continuar
        </Button>
      </form>
    </AuthLayout>
  );
}
