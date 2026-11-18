#!/usr/bin/env node
/**
 * Runner dos testes SQL do NÚCLEO (BACKEND-1) sobre PGlite (Postgres em WASM).
 *
 * Requer o pacote @electric-sql/pglite, que NÃO está no package.json do projeto.
 * Instale onde preferir, por exemplo fora do projeto:
 *     mkdir -p /tmp/pglite && cd /tmp/pglite && npm init -y && npm i @electric-sql/pglite
 * e rode:
 *     PGLITE_DIR=/tmp/pglite/node_modules node supabase/tests/core/core_run.mjs
 * (sem PGLITE_DIR, tenta resolver @electric-sql/pglite a partir do projeto).
 *
 * Para cada arquivo core_*.test.sql: cria um banco novo, aplica
 *   core_stub_supabase.sql → supabase/migrations/0001..0009 → core_helpers.sql → teste
 * e imprime tests.resultados. Código de saída 1 se algum caso falhar.
 *
 * Variáveis:
 *   PRETIUM_MIGRATIONS=all   aplica TODAS as migrações (0001..N), não só o núcleo.
 *   PRETIUM_TEST=<padrão>    roda só os arquivos de teste cujo nome contém o padrão.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..', '..', '..');
const dirMigracoes = join(raiz, 'supabase', 'migrations');

async function importar(pkg) {
  const base = process.env.PGLITE_DIR;
  if (base) {
    // Resolve a partir do node_modules informado (condição "require" ⇒ arquivos .cjs).
    const req = createRequire(join(resolve(base), '_resolver.cjs'));
    return import(pathToFileURL(req.resolve(pkg)).href);
  }
  return import(pkg);
}

const { PGlite } = await importar('@electric-sql/pglite');
const { citext } = await importar('@electric-sql/pglite/contrib/citext');
const { pg_trgm } = await importar('@electric-sql/pglite/contrib/pg_trgm');
const { unaccent } = await importar('@electric-sql/pglite/contrib/unaccent');
const { pgcrypto } = await importar('@electric-sql/pglite/contrib/pgcrypto');

const todas = process.env.PRETIUM_MIGRATIONS === 'all';
const migracoes = readdirSync(dirMigracoes)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .filter((f) => todas || Number(f.slice(0, 4)) <= 9)
  .sort();

const filtro = process.env.PRETIUM_TEST ?? '';
const testes = readdirSync(aqui).filter((f) => /^core_.+\.test\.sql$/.test(f) && f.includes(filtro)).sort();

const ler = (p) => readFileSync(p, 'utf8');
let falhas = 0;
let total = 0;

for (const arquivo of testes) {
  const db = await PGlite.create({ extensions: { citext, pg_trgm, unaccent, pgcrypto } });
  const etapa = async (nome, sql) => {
    try {
      await db.exec(sql);
    } catch (e) {
      console.error(`\n✗ erro ao aplicar ${nome}: ${e.message}`);
      if (e.position) console.error(`  posição ${e.position}`);
      if (e.where) console.error(`  ${e.where}`);
      throw e;
    }
  };
  console.log(`\n=== ${arquivo} ===`);
  try {
    await etapa('core_stub_supabase.sql', ler(join(aqui, 'core_stub_supabase.sql')));
    for (const m of migracoes) await etapa(m, ler(join(dirMigracoes, m)));
    console.log(`migrações aplicadas: ${migracoes.join(', ')}`);
    await etapa('core_helpers.sql', ler(join(aqui, 'core_helpers.sql')));
    await etapa(arquivo, ler(join(aqui, arquivo)));
    await db.exec(`select tests.logout()`);
  } catch {
    falhas += 1;
    total += 1;
    await db.close();
    continue;
  }
  const { rows } = await db.query('select n, ok, descricao, detalhe from tests.resultados order by n');
  for (const r of rows) {
    total += 1;
    if (!r.ok) falhas += 1;
    const extra = !r.ok && r.detalhe ? `   [${r.detalhe}]` : '';
    console.log(`${r.ok ? 'ok  ' : 'FALHA'} ${String(r.n).padStart(3)} ${r.descricao}${extra}`);
  }
  await db.close();
}

console.log(`\n${total - falhas}/${total} casos passaram${falhas ? `, ${falhas} falha(s)` : ''}.`);
process.exit(falhas ? 1 : 0);
