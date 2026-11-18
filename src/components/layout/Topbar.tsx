import { Link } from 'react-router-dom';
import { LogOut, Moon, Sun, UserRound } from 'lucide-react';
import { IconButton, Select } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { useTheme } from '@/contexts/ThemeContext';
import { LABEL_ORG_ROLE } from '@/lib/labels';
import { rotas } from '@/routes';

/** Barra superior: seletor de organização, tema, usuário. Dono: FRONTEND-1. */
export function Topbar() {
  const { profile, signOut } = useAuth();
  const { organizacao, organizacoes, papel, trocarOrganizacao } = useOrganizacao();
  const { temaEfetivo, alternar } = useTheme();

  return (
    <header className="no-print flex h-topbar shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      <div className="flex min-w-0 items-center gap-2">
        {organizacoes.length > 1 ? (
          <div className="w-60">
            <Select
              size="sm"
              aria-label="Organização ativa"
              value={organizacao?.id ?? ''}
              onChange={(e) => void trocarOrganizacao(e.target.value)}
              options={organizacoes.map((o) => ({ value: o.organizacao.id, label: o.organizacao.nome }))}
            />
          </div>
        ) : (
          <span className="truncate font-display text-md font-semibold">{organizacao?.nome ?? 'Sem organização'}</span>
        )}
        {papel && <span className="font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle">{LABEL_ORG_ROLE[papel]}</span>}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <IconButton label={temaEfetivo === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} icon={temaEfetivo === 'dark' ? <Sun /> : <Moon />} onClick={alternar} />
        <Link
          to={rotas.perfil}
          className="flex h-control items-center gap-2 rounded px-2 text-base text-fg-muted hover:bg-sunken hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <UserRound aria-hidden className="h-4 w-4" />
          <span className="max-w-[160px] truncate">{profile?.nome || profile?.email}</span>
        </Link>
        <IconButton label="Sair" icon={<LogOut />} onClick={() => void signOut()} />
      </div>
    </header>
  );
}
