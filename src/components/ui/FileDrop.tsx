import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { FileUp } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface FileDropProps {
  /** extensões/MIME aceitos (ex.: ".xlsx,.xls,.csv") */
  accept?: string;
  onFile: (file: File) => void;
  hint?: ReactNode;
  disabled?: boolean;
  // — aditivos —
  /** texto principal (padrão "Arraste o arquivo aqui ou clique para escolher") */
  label?: ReactNode;
  /** arquivo atual (exibe nome/tamanho) */
  file?: File | null;
  className?: string;
}

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function aceita(file: File, accept?: string): boolean {
  if (!accept) return true;
  const nome = file.name.toLowerCase();
  return accept
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .some((a) => (a.startsWith('.') ? nome.endsWith(a) : a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1)) : file.type === a));
}

/** Área de soltar arquivo (importador SINAPI, logos). Teclado: Enter/Espaço abre o seletor. */
export function FileDrop({ accept, onFile, hint, disabled, label, file, className }: FileDropProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const receber = (f: File | undefined) => {
    if (!f) return;
    if (!aceita(f, accept)) {
      setErro(`Formato não aceito. Use: ${accept}`);
      return;
    }
    setErro(null);
    onFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setSobre(false);
    if (disabled) return;
    receber(e.dataTransfer.files?.[0]);
  };

  return (
    <div className={className}>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={onDrop}
        className={cn(
          'corner-marks group relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded border border-dashed px-6 py-7 text-center transition-colors',
          'blueprint-grid bg-surface-2',
          sobre ? 'corner-marks-brand border-brand bg-primary-soft/50' : 'border-border-strong hover:border-fg-subtle',
          'has-[:focus-visible]:border-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/30',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded border border-border bg-surface text-brand shadow-xs">
          <FileUp aria-hidden className="h-4 w-4" />
        </span>
        <span className="text-base font-medium text-fg">{label ?? 'Arraste o arquivo aqui ou clique para escolher'}</span>
        {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
        {file && (
          <span className="mt-1 inline-flex items-center gap-2 rounded-sm border border-border bg-surface px-2 py-0.5 font-mono text-xs text-fg">
            {file.name} <span className="text-fg-subtle">· {tamanho(file.size)}</span>
          </span>
        )}
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            receber(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      {erro && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}
