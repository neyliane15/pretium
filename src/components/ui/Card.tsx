import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** cantoneiras de prancha técnica nos cantos superior-esquerdo e inferior-direito */
  cornerMarks?: boolean | 'brand';
  /** filete laranja curto no topo (destaque de seção) */
  accent?: boolean;
  /** sem padding interno (para tabelas que encostam nas bordas) */
  flush?: boolean;
  as?: 'div' | 'section' | 'article';
}

/**
 * Superfície base: fundo surface, borda 1px, raio 4px, sombra xs.
 * Use `cornerMarks` com moderação (painéis de destaque, KPIs, cabeçalhos de documento).
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { cornerMarks, accent, flush, as: Tag = 'div', className, children, ...rest },
  ref,
) {
  return (
    <Tag
      ref={ref}
      className={cn(
        'relative rounded border border-border bg-surface shadow-xs',
        cornerMarks && 'corner-marks',
        cornerMarks === 'brand' && 'corner-marks-brand',
        accent && 'accent-rule',
        !flush && 'p-4',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
});

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  /** ações à direita (botões) */
  actions?: ReactNode;
  /** rótulo técnico em caixa-alta acima do título (ex.: "ETAPA 02") */
  eyebrow?: ReactNode;
}

export function CardHeader({ title, description, actions, eyebrow, className, children, ...rest }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-border px-4 py-2.5', className)} {...rest}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-0.5 font-mono text-2xs uppercase text-fg-subtle">{eyebrow}</div>}
        {title && <h3 className="truncate font-display text-md font-semibold leading-5">{title}</h3>}
        {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-4 py-2.5', className)} {...rest} />;
}
