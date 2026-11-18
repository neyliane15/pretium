import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { rotas } from '@/routes';

/** Dono: FRONTEND-1. */
export default function NotFoundPage() {
  return (
    <div className="blueprint-grid flex min-h-screen flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
      <Logo variant="mark" height={40} />
      <div className="font-mono text-2xs uppercase tracking-[0.12em] text-fg-subtle">Erro 404</div>
      <h1 className="font-display text-2xl font-semibold">Página não encontrada</h1>
      <Link to={rotas.dashboard} className="text-primary hover:underline">
        Voltar ao painel
      </Link>
    </div>
  );
}
