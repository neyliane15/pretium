import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTipo = 'success' | 'error' | 'warning' | 'info';

export interface ToastInput {
  tipo?: ToastTipo;
  titulo: string;
  descricao?: string;
  /** ms; 0 = não fecha sozinho. Padrão 4500 (erros: 7000) */
  duracao?: number;
}

interface ToastItem extends Required<Omit<ToastInput, 'descricao'>> {
  id: number;
  descricao?: string;
}

interface ToastApi {
  toast: (t: ToastInput) => number;
  success: (titulo: string, descricao?: string) => number;
  error: (titulo: string, descricao?: string) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICON = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
const COLOR = { success: 'text-success', error: 'text-danger', warning: 'text-warning', info: 'text-info' };
const BAR = { success: 'bg-success', error: 'bg-danger', warning: 'bg-accent', info: 'bg-info' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      const tipo = t.tipo ?? 'info';
      const duracao = t.duracao ?? (tipo === 'error' ? 7000 : 4500);
      setItems((xs) => [...xs.slice(-4), { id, tipo, titulo: t.titulo, descricao: t.descricao, duracao }]);
      if (duracao > 0) window.setTimeout(() => dismiss(id), duracao);
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      dismiss,
      success: (titulo, descricao) => toast({ tipo: 'success', titulo, descricao }),
      error: (titulo, descricao) => toast({ tipo: 'error', titulo, descricao }),
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[340px] flex-col gap-2">
          {items.map((t) => {
            const Icon = ICON[t.tipo];
            return (
              <div
                key={t.id}
                role={t.tipo === 'error' ? 'alert' : 'status'}
                className="pointer-events-auto relative flex animate-slide-in gap-2.5 overflow-hidden rounded border border-border-strong bg-surface py-2.5 pl-3.5 pr-2 shadow-md"
              >
                <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px]', BAR[t.tipo])} />
                <Icon aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0', COLOR[t.tipo])} />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium text-fg">{t.titulo}</p>
                  {t.descricao && <p className="mt-0.5 text-sm text-fg-muted">{t.descricao}</p>}
                </div>
                <button type="button" aria-label="Fechar aviso" onClick={() => dismiss(t.id)} className="h-5 w-5 shrink-0 rounded-sm text-fg-subtle hover:bg-sunken hover:text-fg">
                  <X className="mx-auto h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>.');
  return ctx;
}
