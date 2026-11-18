import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Campo de senha com botão mostrar/ocultar. */
export const SenhaInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(function SenhaInput({ className, ...rest }, ref) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} {...rest} type={ver ? 'text' : 'password'} className={cn('pr-8', className)} />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
        className="absolute inset-y-0 right-1 my-auto flex h-6 w-6 items-center justify-center rounded-sm text-fg-subtle hover:bg-sunken hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {ver ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
});

/** Medidor simples de força de senha (comprimento + variedade). */
export function ForcaSenha({ senha }: { senha: string }) {
  let pts = 0;
  if (senha.length >= 8) pts++;
  if (senha.length >= 12) pts++;
  if (/[a-z]/.test(senha) && /[A-Z]/.test(senha)) pts++;
  if (/\d/.test(senha)) pts++;
  if (/[^A-Za-z0-9]/.test(senha)) pts++;
  const nivel = senha.length < 8 ? 0 : pts <= 2 ? 1 : pts <= 3 ? 2 : 3;
  const rotulo = ['Muito curta', 'Fraca', 'Razoável', 'Forte'][nivel];
  const cor = ['bg-danger', 'bg-danger', 'bg-accent', 'bg-success'][nivel];
  if (!senha) return null;
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-xs', i < Math.max(1, nivel) ? cor : 'bg-sunken')} />
        ))}
      </div>
      <span className="w-20 text-right font-mono text-2xs uppercase tracking-[0.06em] text-fg-subtle">{rotulo}</span>
    </div>
  );
}
