// @vitest-environment node
/**
 * Storage real (bucket `logos`, políticas de 0008) com as funções do front `enviarImagem`/`urlAssinada`.
 * Ambiente `node` porque o fetch do Node não serializa o Blob/File do jsdom.
 */
import { describe, expect, it } from 'vitest';
import { supabase } from '@/lib/supabase';
import { enviarImagem } from '@/api/core/arquivos';
import { urlAssinada } from '@/api/core/util';
import { SENHA, cadastrar, clientDe, clientServico, emailDe } from './ambiente';

describe('storage', () => {
  it('owner envia logo em logos/{org}/ e gera URL assinada; membro de outra org não escreve nem lê', async () => {
    const svc = clientServico();
    expect(svc, 'SUPABASE_SERVICE_ROLE_KEY necessário').not.toBeNull();
    const [dona, outra] = [emailDe('st-dona'), emailDe('st-outra')];
    for (const e of [dona, outra]) {
      const id = await cadastrar(e.split('@')[0]!, e);
      const r = await svc!.from('profiles').update({ status: 'active' }).eq('id', id);
      expect(r.error).toBeNull();
    }
    const { error } = await supabase.auth.signInWithPassword({ email: dona, password: SENHA });
    expect(error).toBeNull();
    const org = (await supabase.rpc('criar_organizacao', { p_nome: 'Org Storage' })).data!;

    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (ch) => ch.charCodeAt(0));
    const file = new File([png], 'logo.png', { type: 'image/png' });
    const path = await enviarImagem('logos', org, 'logo', file);
    expect(path).toBe(`${org}/logo.png`);
    const url = await urlAssinada('logos', path);
    expect(url).toMatch(/^http.*token=/);
    const baixado = await fetch(url!);
    expect(baixado.status).toBe(200);
    expect(new Uint8Array(await baixado.arrayBuffer())).toEqual(png);
    // regravar (upsert) funciona
    await expect(enviarImagem('logos', org, 'logo', file)).resolves.toBe(path);

    const c = await clientDe(outra);
    const up = await c.storage.from('logos').upload(`${org}/intruso.png`, file);
    expect(up.error).not.toBeNull();
    const ass = await c.storage.from('logos').createSignedUrl(path, 60);
    expect(ass.error).not.toBeNull();
    // formato inválido é barrado no front antes do upload
    await expect(enviarImagem('logos', org, 'logo', new File(['x'], 'a.txt', { type: 'text/plain' }))).rejects.toThrow(/Formato inválido/);
    await supabase.auth.signOut();
  });
});
