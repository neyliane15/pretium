/** Utilitários da camada de dados do núcleo (FRONTEND-1). */
import { supabase } from '@/lib/supabase';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';

interface Resposta<T> {
  data: T | null;
  error: unknown;
}

/** Lança o erro do PostgREST/RPC ou devolve `data`. */
export function ok<T>(r: Resposta<T>): NonNullable<T> {
  if (r.error) throw r.error;
  return r.data as NonNullable<T>;
}

export function okVoid(r: { error: unknown }): void {
  if (r.error) throw r.error;
}

/** id da organização ativa ('' quando ausente — use `enabled: Boolean(orgId)`). */
export function useOrgIdCore(): string {
  return useOrganizacao().organizacao?.id ?? '';
}

/** Escapa curingas do `ilike` do PostgREST. */
export function termoIlike(t: string): string {
  return `%${t.trim().replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()]/g, ' ')}%`;
}

/** Extensão a partir do MIME/arquivo (png, jpg, svg, webp). */
export function extensaoImagem(file: File): string {
  const porMime: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp' };
  return porMime[file.type] ?? file.name.split('.').pop()?.toLowerCase() ?? 'png';
}

export const IMAGEM_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGEM_TIPOS = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

/** Valida imagem para os buckets `logos`/`avatares` (§11). Lança Error com mensagem pt-BR. */
export function validarImagem(file: File): void {
  if (!IMAGEM_TIPOS.includes(file.type)) throw new Error('Formato inválido. Use PNG, JPG, SVG ou WEBP.');
  if (file.size > IMAGEM_MAX_BYTES) throw new Error('Imagem maior que 2 MB.');
}

/** URL assinada (1 h) de um arquivo privado do Storage. */
export async function urlAssinada(bucket: string, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}
