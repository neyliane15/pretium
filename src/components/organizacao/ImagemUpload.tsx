import { useRef, type ReactNode } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { IMAGEM_TIPOS } from '@/api/core/util';

export interface ImagemUploadProps {
  src: string | null | undefined;
  /** conteúdo exibido sem imagem (iniciais, ícone) */
  vazio: ReactNode;
  onEscolher: (f: File) => void;
  onRemover?: () => void;
  enviando?: boolean;
  disabled?: boolean;
  /** `square` p/ logo; `round` p/ avatar */
  forma?: 'square' | 'round';
  rotulo: string;
  dica?: ReactNode;
}

/** Prévia + botões "Enviar" / "Remover" para logo e avatar (bucket privado, 2 MB). */
export function ImagemUpload({ src, vazio, onEscolher, onRemover, enviando, disabled, forma = 'square', rotulo, dica }: ImagemUploadProps) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          'corner-marks flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden border border-border-strong bg-surface-2',
          forma === 'round' ? 'rounded-full [&::after]:hidden [&::before]:hidden' : 'rounded-sm',
          'blueprint-grid',
        )}
      >
        {src ? <img src={src} alt={rotulo} className={cn('h-full w-full', forma === 'round' ? 'object-cover' : 'object-contain p-1.5')} /> : vazio}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <Button size="sm" leftIcon={<ImageUp />} loading={enviando} disabled={disabled} onClick={() => ref.current?.click()}>
            {src ? 'Trocar' : 'Enviar'} {rotulo.toLowerCase()}
          </Button>
          {src && onRemover && (
            <Button size="sm" variant="ghost" leftIcon={<Trash2 />} disabled={disabled || enviando} onClick={onRemover}>
              Remover
            </Button>
          )}
        </div>
        <p className="text-xs text-fg-subtle">{dica ?? 'PNG, JPG, SVG ou WEBP, até 2 MB.'}</p>
        <input
          ref={ref}
          type="file"
          accept={IMAGEM_TIPOS.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onEscolher(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
