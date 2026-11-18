/** Peças pequenas reutilizadas pelas telas do FRONTEND-2. */
import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { Alert, Badge, Button, DemoBadge, Tooltip } from '@/components/ui';
import { mensagemErro } from '@/lib/supabase';
import { formatMesAno } from '@/lib/format';
import { BADGE_OBRA_STATUS, BADGE_ORCAMENTO_STATUS, LABEL_OBRA_STATUS, LABEL_ORCAMENTO_STATUS } from '@/lib/labels';
import { cn } from '@/lib/cn';
import type { ObraStatus, OrcamentoStatus } from '@/types/database';

export function ErroCarregamento({ erro, onRetry, titulo = 'Não foi possível carregar os dados' }: { erro: unknown; onRetry?: () => void; titulo?: string }) {
  return (
    <Alert
      variant="danger"
      title={titulo}
      action={onRetry && <Button size="sm" leftIcon={<RefreshCw />} onClick={onRetry}>Tentar novamente</Button>}
    >
      {mensagemErro(erro)}
    </Alert>
  );
}

import type { DataBaseResumo } from './dataBase';

export { type DataBaseResumo };

/** "SINAPI RJ 09/2026 · Não desonerado" em mono + selo Exemplo quando demo. */
export function DataBaseTag({ db, className }: { db: DataBaseResumo | null | undefined; className?: string }) {
  if (!db) return <span className="text-fg-subtle">—</span>;
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span className="font-mono text-xs text-fg-muted">
        SINAPI {db.uf} <span className="text-fg">{formatMesAno(db.ano, db.mes)}</span>
      </span>
      <Badge variant={db.regime === 'desonerado' ? 'info' : 'outline'}>{db.regime === 'desonerado' ? 'Desonerado' : 'Não deson.'}</Badge>
      {db.is_demo && <DemoBadge />}
    </span>
  );
}

export const StatusOrcamento = ({ status }: { status: OrcamentoStatus }) => (
  <Badge variant={BADGE_ORCAMENTO_STATUS[status]} dot>{LABEL_ORCAMENTO_STATUS[status]}</Badge>
);

export const StatusObra = ({ status }: { status: ObraStatus }) => (
  <Badge variant={BADGE_OBRA_STATUS[status]} dot>{LABEL_OBRA_STATUS[status]}</Badge>
);

/** Rótulo técnico (caixa-alta mono 10px). */
export function Rotulo({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle', className)}>{children}</span>;
}

/** Par rótulo/valor em ficha técnica. */
export function Dado({ rotulo, children, mono }: { rotulo: ReactNode; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt><Rotulo>{rotulo}</Rotulo></dt>
      <dd className={cn('mt-0.5 truncate text-base text-fg', mono && 'num')}>{children ?? '—'}</dd>
    </div>
  );
}

/** Indicador compacto de célula com explicação ao passar o mouse. */
export function Dica({ conteudo, children }: { conteudo: ReactNode; children: React.ReactElement }) {
  return <Tooltip content={conteudo}>{children}</Tooltip>;
}

/** Barra fina de participação percentual (0–100), usada em tabelas. */
export function BarraPercentual({ valor, cor = 'bg-brand', className }: { valor: number; cor?: string; className?: string }) {
  const v = Math.max(0, Math.min(100, valor));
  return (
    <span aria-hidden className={cn('relative block h-1 w-full overflow-hidden rounded-full bg-sunken', className)}>
      <span className={cn('absolute inset-y-0 left-0 rounded-full', cor)} style={{ width: `${v}%` }} />
    </span>
  );
}
