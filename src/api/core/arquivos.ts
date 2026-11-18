/** Storage: URLs assinadas e upload de imagens (logos, avatares). Dono: FRONTEND-1. */
import { useQuery } from '@tanstack/react-query';
import { supabase, type BUCKETS } from '@/lib/supabase';
import { qkCore } from './keys';
import { extensaoImagem, urlAssinada, validarImagem } from './util';

/** URL assinada (cache 50 min) de um caminho no bucket; null enquanto não houver arquivo. */
export function useArquivoUrl(bucket: string, path: string | null | undefined) {
  return useQuery({
    queryKey: qkCore.arquivoUrl(bucket, path),
    enabled: Boolean(path),
    staleTime: 50 * 60_000,
    queryFn: () => urlAssinada(bucket, path!),
  });
}

/** Envia imagem para `{pasta}/{nome}.{ext}` com upsert; devolve o caminho gravado. */
export async function enviarImagem(bucket: (typeof BUCKETS)[keyof typeof BUCKETS], pasta: string, nome: string, file: File): Promise<string> {
  validarImagem(file);
  const path = `${pasta}/${nome}.${extensaoImagem(file)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type, cacheControl: '60' });
  if (error) throw error;
  return path;
}
