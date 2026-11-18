import { Database, ExternalLink, KeyRound, Terminal } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Alert } from '@/components/ui';

const PASSOS = [
  {
    icon: Terminal,
    titulo: 'Suba o Supabase local (ou use um projeto na nuvem)',
    codigo: 'npx supabase start\nnpx supabase db reset',
  },
  {
    icon: KeyRound,
    titulo: 'Crie o arquivo .env.local na raiz do projeto',
    codigo: 'VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_ANON_KEY=<anon key exibida pelo supabase start>',
  },
  {
    icon: Database,
    titulo: 'Reinicie o servidor de desenvolvimento',
    codigo: 'npm run dev',
  },
];

/** Exibida quando VITE_SUPABASE_URL/ANON_KEY não estão definidos (em vez de quebrar). Dono: FRONTEND-1. */
export function ConfiguracaoNecessaria() {
  return (
    <div className="blueprint-grid flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-[620px]">
        <div className="mb-6 flex items-center justify-between text-fg">
          <Logo height={28} />
          <span className="font-mono text-2xs uppercase tracking-[0.12em] text-fg-subtle">Folha 00 · Configuração</span>
        </div>
        <div className="corner-marks corner-marks-brand relative rounded border border-border-strong bg-surface shadow-md">
          <span aria-hidden className="absolute left-0 top-0 h-[2px] w-12 bg-brand" />
          <div className="border-b border-border px-6 py-4">
            <div className="font-mono text-2xs uppercase tracking-[0.1em] text-fg-subtle">Conexão com o banco</div>
            <h1 className="mt-0.5 font-display text-xl font-semibold">Configure o Supabase para continuar</h1>
            <p className="mt-1 text-sm text-fg-muted">
              O Pretium conversa diretamente com o Supabase (Auth, banco e Storage). As variáveis de ambiente de conexão não foram encontradas neste build.
            </p>
          </div>
          <ol className="divide-y divide-grid">
            {PASSOS.map((p, i) => (
              <li key={i} className="flex gap-4 px-6 py-4">
                <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface-2 text-xs font-semibold text-fg">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-base font-medium">
                    <p.icon aria-hidden className="h-3.5 w-3.5 text-brand" />
                    {p.titulo}
                  </div>
                  <pre className="mt-2 overflow-x-auto rounded-sm border border-border bg-sunken px-3 py-2 font-mono text-xs leading-5 text-fg">{p.codigo}</pre>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-border bg-surface-2 px-6 py-3">
            <Alert variant="info" icon={null} className="bg-transparent">
              O primeiro usuário cadastrado vira administrador. Em produção, defina <code className="font-mono text-xs">admin_emails</code> antes de abrir o
              cadastro (veja o README). Depois de editar o <code className="font-mono text-xs">.env.local</code>, reinicie o servidor e recarregue esta página.
            </Alert>
          </div>
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-fg-subtle">
          <ExternalLink aria-hidden className="h-3 w-3" /> Painel Supabase → Project Settings → API
        </p>
      </div>
    </div>
  );
}
