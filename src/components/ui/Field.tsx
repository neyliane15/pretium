import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface FieldProps {
  label?: ReactNode;
  /** texto auxiliar abaixo do campo */
  hint?: ReactNode;
  /** mensagem de erro (substitui o hint e marca o campo inválido) */
  error?: string | null;
  required?: boolean;
  className?: string;
  /** render-prop recebe id e aria-describedby para ligar ao controle */
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
  /** conteúdo à direita do rótulo (ex.: link "Esqueci a senha") */
  labelAside?: ReactNode;
}

/** Rótulo + controle + hint/erro, com ligações ARIA corretas. */
export function Field({ label, hint, error, required, className, children, labelAside }: FieldProps) {
  const id = useId();
  const descId = `${id}-desc`;
  const hasDesc = Boolean(error || hint);
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {(label || labelAside) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && (
            <label htmlFor={id} className="text-xs font-medium text-fg-muted">
              {label}
              {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
            </label>
          )}
          {labelAside}
        </div>
      )}
      {children({ id, 'aria-describedby': hasDesc ? descId : undefined, 'aria-invalid': error ? true : undefined })}
      {hasDesc && (
        <p id={descId} className={cn('text-xs', error ? 'text-danger' : 'text-fg-subtle')} role={error ? 'alert' : undefined}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function Label({ className, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-medium text-fg-muted', className)} {...rest} />;
}
