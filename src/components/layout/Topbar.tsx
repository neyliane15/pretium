import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Check, ChevronsUpDown, LogOut, Menu, Monitor, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { Avatar, Badge, Combobox, DropdownMenu, IconButton, Kbd, useToast, type DropdownMenuEntry } from '@/components/ui';
import { useArquivoUrl } from '@/api/core/arquivos';
import { salvarTemaPerfil } from '@/api/core/perfil';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/cn';
import { LABEL_ORG_ROLE } from '@/lib/labels';
import { BUCKETS, mensagemErro } from '@/lib/supabase';
import { normalizarTexto } from '@/lib/sinapi/parser';
import type { Tema } from '@/types/database';
import { rotas } from '@/routes';
import { NAV, type NavItem } from './nav';

function SeletorOrganizacao() {
  const { organizacao, organizacoes, papel, trocarOrganizacao } = useOrganizacao();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { data: logo } = useArquivoUrl(BUCKETS.logos, organizacao?.logo_path);

  const conteudo = (
    <>
      <Avatar square size="sm" name={organizacao?.nome ?? '—'} src={logo} />
      <span className="flex min-w-0 flex-col items-start leading-tight">
        <span className="max-w-[220px] truncate font-display text-base font-semibold text-fg">{organizacao?.nome ?? 'Sem organização'}</span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-fg-subtle">
          {papel ? LABEL_ORG_ROLE[papel] : isAdmin ? 'Administrador' : '—'}
          {organizacao?.status === 'bloqueada' && ' · bloqueada'}
        </span>
      </span>
    </>
  );

  if (organizacoes.length <= 1) return <div className="flex min-w-0 items-center gap-2 px-1">{conteudo}</div>;

  const itens: DropdownMenuEntry[] = [
    ...organizacoes.map((o) => ({
      label: o.organizacao.nome,
      hint: LABEL_ORG_ROLE[o.papel],
      icon: o.organizacao.id === organizacao?.id ? <Check className="text-brand" /> : <Building2 />,
      onSelect: () => {
        if (o.organizacao.id === organizacao?.id) return;
        trocarOrganizacao(o.organizacao.id)
          .then(() => {
            nav(rotas.dashboard);
            toast.success('Organização alterada', o.organizacao.nome);
          })
          .catch((e) => toast.error('Não foi possível trocar de organização', mensagemErro(e)));
      },
    })),
    'separator',
    { label: 'Criar nova organização', icon: <Building2 />, onSelect: () => nav(rotas.onboardingOrganizacao) },
  ];

  return (
    <DropdownMenu
      aria-label="Organizações"
      minWidth={260}
      header={<div className="font-mono text-2xs uppercase tracking-[0.1em] text-fg-subtle">Trocar organização</div>}
      items={itens}
      trigger={
        <button
          type="button"
          aria-label={`Organização ativa: ${organizacao?.nome ?? 'nenhuma'}. Trocar`}
          className="flex h-9 min-w-0 items-center gap-2 rounded border border-transparent px-1.5 hover:border-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {conteudo}
          <ChevronsUpDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
        </button>
      }
    />
  );
}

interface Destino extends NavItem {
  grupo: string;
}

function BuscaRapida() {
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const [termo, setTermo] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const todos = useMemo<Destino[]>(
    () =>
      NAV.filter((g) => !g.admin || isAdmin).flatMap((g) => g.itens.map((i) => ({ ...i, grupo: g.titulo }))).concat([
        { to: rotas.perfil, label: 'Meu perfil', icon: UserRound, grupo: 'Conta', termos: 'senha avatar tema' },
      ]),
    [isAdmin],
  );
  const itens = useMemo(() => {
    const t = normalizarTexto(termo);
    if (!t) return todos;
    return todos.filter((d) => normalizarTexto(`${d.label} ${d.grupo} ${d.termos ?? ''}`).includes(t));
  }, [termo, todos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        wrap.current?.querySelector('input')?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={wrap} className="group relative hidden w-full max-w-[340px] md:block">
      <Combobox<Destino>
        aria-label="Ir para…"
        size="sm"
        placeholder="Ir para…"
        value={null}
        items={itens}
        debounceMs={0}
        clearOnSelect
        onSearch={setTermo}
        onChange={(d) => {
          if (!d) return;
          nav(d.to);
          (document.activeElement as HTMLElement | null)?.blur();
        }}
        getKey={(d) => d.to}
        getLabel={(d) => d.label}
        emptyText="Nenhuma tela encontrada"
        renderItem={(d, ativo) => (
          <span className="flex items-center gap-2">
            <d.icon aria-hidden className={cn('h-3.5 w-3.5', ativo ? 'text-brand' : 'text-fg-subtle')} />
            <span className="flex-1 truncate">{d.label}</span>
            <span className="font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle">{d.grupo}</span>
          </span>
        )}
      />
      <span aria-hidden className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 gap-0.5 group-focus-within:!hidden lg:flex">
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </span>
    </div>
  );
}

const TEMAS: { value: Tema; label: string; icon: JSX.Element }[] = [
  { value: 'light', label: 'Tema claro', icon: <Sun /> },
  { value: 'dark', label: 'Tema escuro', icon: <Moon /> },
  { value: 'system', label: 'Seguir o sistema', icon: <Monitor /> },
];

function MenuUsuario() {
  const { profile, user, isAdmin, signOut } = useAuth();
  const { tema, setTema } = useTheme();
  const nav = useNavigate();
  const { data: avatar } = useArquivoUrl(BUCKETS.avatares, profile?.avatar_path);
  const nome = profile?.nome || profile?.email || 'Usuário';

  const escolherTema = (t: Tema) => {
    setTema(t);
    if (user) void salvarTemaPerfil(user.id, t);
  };

  const itens: DropdownMenuEntry[] = [
    { label: 'Meu perfil', icon: <UserRound />, onSelect: () => nav(rotas.perfil) },
    { label: 'Dados do escritório', icon: <Building2 />, onSelect: () => nav(rotas.organizacao) },
    ...(isAdmin ? [{ label: 'Administração', icon: <ShieldCheck />, onSelect: () => nav(rotas.admin) }] : []),
    'separator',
    ...TEMAS.map((t) => ({
      label: t.label,
      icon: t.icon,
      hint: tema === t.value ? <Check className="h-3 w-3 text-brand" /> : undefined,
      onSelect: () => escolherTema(t.value),
    })),
    'separator',
    { label: 'Sair', icon: <LogOut />, danger: true, onSelect: () => void signOut().then(() => nav(rotas.login)) },
  ];

  return (
    <DropdownMenu
      align="end"
      aria-label="Menu do usuário"
      minWidth={240}
      header={
        <div className="flex items-center gap-2.5">
          <Avatar name={nome} src={avatar} size="md" />
          <div className="min-w-0">
            <div className="truncate text-base font-medium text-fg">{nome}</div>
            <div className="truncate text-xs text-fg-subtle">{profile?.email}</div>
            {isAdmin && (
              <Badge variant="brand" className="mt-1">
                Admin global
              </Badge>
            )}
          </div>
        </div>
      }
      items={itens}
      trigger={
        <button
          type="button"
          aria-label={`Menu do usuário ${nome}`}
          className="flex h-8 items-center gap-2 rounded pl-1 pr-2 text-base text-fg-muted hover:bg-sunken hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar name={nome} src={avatar} size="sm" />
          <span className="hidden max-w-[150px] truncate lg:inline">{nome}</span>
        </button>
      }
    />
  );
}

/**
 * Barra superior: organização, busca rápida, tema, usuário. Dono: FRONTEND-1.
 * `onMenu` (telas estreitas): mostra o botão que abre a navegação lateral como gaveta.
 */
export function Topbar({ onMenu }: { onMenu?: () => void } = {}) {
  const { temaEfetivo, setTema } = useTheme();
  const { user } = useAuth();
  const alternar = () => {
    const t = temaEfetivo === 'dark' ? 'light' : 'dark';
    setTema(t);
    if (user) void salvarTemaPerfil(user.id, t);
  };
  return (
    <header className="no-print relative flex h-topbar shrink-0 items-center gap-2 border-b border-border bg-surface px-2 sm:gap-3 sm:px-3">
      {onMenu && <IconButton label="Abrir menu" icon={<Menu />} onClick={onMenu} className="shrink-0" />}
      <div className="flex min-w-0 shrink items-center">
        <SeletorOrganizacao />
      </div>
      <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
      <div className="hidden min-w-0 flex-1 items-center sm:flex">
        <BuscaRapida />
      </div>
      <div className="flex-1 sm:hidden" />
      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton label={temaEfetivo === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} icon={temaEfetivo === 'dark' ? <Sun /> : <Moon />} onClick={alternar} />
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        <MenuUsuario />
      </div>
    </header>
  );
}
