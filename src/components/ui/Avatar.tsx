import { useState } from 'react';
import { cn } from '@/lib/cn';

export interface AvatarProps {
  /** nome usado para as iniciais e o texto alternativo */
  name?: string | null;
  /** URL da imagem (assinada) */
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  /** quadrado com cantos de 3px (organizações/logos) em vez de círculo */
  square?: boolean;
}

const SIZES = { xs: 'h-5 w-5 text-[9px]', sm: 'h-6 w-6 text-2xs', md: 'h-8 w-8 text-xs', lg: 'h-14 w-14 text-lg' };

export function iniciais(nome?: string | null): string {
  const partes = (nome ?? '').replace(/[@.].*$/, '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const a = partes[0]![0] ?? '';
  const b = partes.length > 1 ? (partes[partes.length - 1]![0] ?? '') : (partes[0]![1] ?? '');
  return (a + b).toUpperCase();
}

/** Avatar com imagem ou iniciais (fundo petróleo, texto claro). */
export function Avatar({ name, src, size = 'md', className, square }: AvatarProps) {
  const [falhou, setFalhou] = useState(false);
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden border border-black/10 bg-petrol-2 font-mono font-semibold tracking-tight text-sidebar-fg',
        square ? 'rounded-sm' : 'rounded-full',
        SIZES[size],
        className,
      )}
      title={name ?? undefined}
    >
      {src && !falhou ? (
        <img src={src} alt={name ? `Foto de ${name}` : ''} className="h-full w-full object-cover" onError={() => setFalhou(true)} />
      ) : (
        <span aria-hidden={!name}>{iniciais(name)}</span>
      )}
    </span>
  );
}

/** Tecla de atalho (ex.: <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>). */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border border-border-strong border-b-2 bg-surface px-1 font-mono text-2xs font-medium text-fg-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
