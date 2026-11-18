import { cn } from '@/lib/cn';

/**
 * Logomarca Pretium: pilar sobre sapata (haste) + viga em perfil chanfrado (bojo do "P").
 * Usa `currentColor` para haste/letras (herda a cor do texto: funciona em claro, escuro e na
 * sidebar petróleo) e o token `brand` para a viga.
 * Arquivos estáticos equivalentes: public/logo.svg, logo-dark.svg, logo-mark.svg, logo-mark-dark.svg, favicon.svg.
 */
export interface LogoProps {
  /** `full` = símbolo + wordmark; `mark` = só o símbolo */
  variant?: 'full' | 'mark';
  /** altura em px (largura proporcional) */
  height?: number;
  className?: string;
  title?: string;
  /** mostra o filete separador entre símbolo e wordmark */
  divider?: boolean;
}

const VIGA = 'M13 4H21L27 10V14L21 20H13ZM13 9.5V14.5H19.2L21.5 12.2V11.8L19.2 9.5Z';

export function Logo({ variant = 'full', height = 24, className, title = 'Pretium', divider = true }: LogoProps) {
  const full = variant === 'full';
  const vbW = full ? 132 : 32;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${vbW} 32`}
      height={height}
      width={(height * vbW) / 32}
      role="img"
      aria-label={title}
      className={cn('shrink-0', className)}
    >
      <title>{title}</title>
      <rect x="5" y="4" width="6" height="24" fill="currentColor" />
      <path d={VIGA} fillRule="evenodd" style={{ fill: 'rgb(var(--c-brand))' }} />
      <rect x="3" y="26" width="10" height="2" fill="currentColor" />
      {full && (
        <>
          {divider && <rect x="36" y="4" width="1" height="24" fill="currentColor" opacity={0.25} />}
          <g fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="square" strokeLinejoin="miter" strokeMiterlimit={1.5}>
            <path d="M44 23V9H50L53 12V14L50 17H44" />
            <path d="M58 23V9H64L67 12V14L64 17H58M63 17L67 23" />
            <path d="M80 9H72V23H80M72 16H78.5" />
            <path d="M85 9H94M89.5 9V23" />
            <path d="M99 9V23" />
            <path d="M104 9V20L107 23H110L113 20V9" />
            <path d="M118 23V9L123 17L128 9V23" />
          </g>
        </>
      )}
    </svg>
  );
}

export default Logo;
