import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { EnviarPacoteSinapiModal } from '@/components/admin/EnviarPacoteSinapiModal';
import { Button, Modal } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';

/**
 * "Atualizar tabela SINAPI": para o admin, os 3 passos (baixar da Caixa → enviar → importar);
 * para os demais, um aviso curto de que quem atualiza é o administrador.
 * (A Caixa recusa downloads automáticos de servidor; a rotina diária continua tentando em segundo plano.)
 */
export function BuscarSinapiCaixaModal({ open, onClose }: { open: boolean; onClose: () => void; ufInicial?: string }) {
  const { isAdmin } = useAuth();
  if (isAdmin) return <EnviarPacoteSinapiModal open={open} onClose={onClose} />;
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Atualizar tabela SINAPI" footer={<Button variant="primary" onClick={onClose}>Entendi</Button>}>
      <p className="text-base text-fg">Quem atualiza a tabela SINAPI é o administrador do sistema.</p>
      <p className="mt-2 text-sm text-fg-muted">Peça a ele para importar o mês e o estado que você precisa. Depois disso, a tabela aparece aqui automaticamente.</p>
    </Modal>
  );
}

/** Botão que abre o fluxo. */
export function BotaoBuscarSinapiCaixa({ size, variant }: { ufInicial?: string; size?: 'sm' | 'md'; variant?: 'primary' | 'secondary' }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} leftIcon={<RefreshCw />} onClick={() => setAberto(true)}>
        Atualizar tabela SINAPI
      </Button>
      <BuscarSinapiCaixaModal open={aberto} onClose={() => setAberto(false)} />
    </>
  );
}
