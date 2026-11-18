import { RotateCw } from 'lucide-react';
import { Alert, Button } from '@/components/ui';
import { mensagemErro } from '@/lib/supabase';

/** Erro de carregamento padrão das páginas (com "tentar novamente"). */
export function EstadoErro({ erro, onRetry, titulo = 'Não foi possível carregar os dados' }: { erro: unknown; onRetry?: () => void; titulo?: string }) {
  return (
    <Alert
      variant="danger"
      title={titulo}
      action={
        onRetry && (
          <Button size="sm" leftIcon={<RotateCw />} onClick={onRetry}>
            Tentar novamente
          </Button>
        )
      }
    >
      {mensagemErro(erro)}
    </Alert>
  );
}
