#!/usr/bin/env node
/**
 * Runner dos testes SQL de REFERÊNCIAS/ORÇAMENTO (BACKEND-2) sobre PGlite (Postgres em WASM).
 *
 * Usa @electric-sql/pglite (devDependency do projeto: `npm run test:db`). Alternativa fora do projeto:
 *     mkdir -p /tmp/pglite && cd /tmp/pglite && npm init -y && npm i @electric-sql/pglite
 *     PGLITE_DIR=/tmp/pglite/node_modules node supabase/tests/orcamento/orc_run.mjs
 *
 * Para cada arquivo orc_*.test.sql cria um banco novo e aplica:
 *   supabase/tests/core/core_stub_supabase.sql (stub do Supabase mantido pelo B1)
 *   → supabase/migrations/0001..N (todas, inclusive as correções 0030+)
 *   → supabase/.temp/orc_stub_lacunas.sql (opcional, não versionado: objetos do B1 ainda ausentes)
 *   → supabase/seed.sql (se PRETIUM_SEED != '0')
 *   → supabase/tests/core/core_helpers.sql (schema tests.*) → orc_helpers.sql → teste
 * e imprime tests.resultados. Código de saída 1 se algum caso falhar.
 *
 * Variáveis: PRETIUM_TEST=<padrão> filtra arquivos; PRETIUM_SEED=0 não carrega o seed.
 * Também exporta, para os testes de paridade, os resultados de src/lib/calc.ts (Node ≥ 22.6 com
 * type stripping) em tests.ctx com chave 'calc:<nome>'.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..', '..', '..');
const dirMig = join(raiz, 'supabase', 'migrations');

async function importar(pkg) {
  const base = process.env.PGLITE_DIR;
  if (base) {
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

// ─── valores de referência calculados por src/lib/calc.ts (paridade SQL × TS) ─
let calcValores = {};
try {
  const calc = await import(pathToFileURL(join(raiz, 'src', 'lib', 'calc.ts')).href);
  const bdiTcu = { ac: 4, s: 0.4, r: 1.27, g: 0.4, df: 1.23, l: 7.4, pis: 0.65, cofins: 3, iss: 5, cprb: 0 };
  calcValores = {
    bdi_tcu_iss5: calc.calcularBdi(bdiTcu),
    bdi_tcu_iss3: calc.calcularBdi({ ...bdiTcu, iss: 3 }),
    bdi_quartil1: calc.calcularBdi({ ac: 3, s: 0.4, r: 0.97, g: 0.4, df: 0.59, l: 6.16, pis: 0.65, cofins: 3, iss: 2.5, cprb: 0 }),
    bdi_desonerado: calc.calcularBdi({ ...bdiTcu, cprb: 4.5 }),
    custo_comp_9_04: calc.custoComposicao([{ coeficiente: 0.5, preco: 10.333 }, { coeficiente: 1.25, preco: 3.1 }, { coeficiente: 2, preco: null }]),
    item: JSON.stringify(calc.calcularItem({ quantidade: 12.345, custo_unitario: 57.89, bdi_percentual: 22.12 })),
    membro: JSON.stringify(calc.custoMembro({ quantidade: 2, horas_dia: 8, dias: 10, preco_insumo_hora: null, salario_hora: 10, aplicar_encargos: true }, 100)),
    honorarios_total: calc.totalHonorarios([5460, 5000], 10, 10).total,
    periodos_mensal: JSON.stringify(calc.gerarPeriodos('2026-01-31', 'mensal', 3)),
    periodos_quinzenal: JSON.stringify(calc.gerarPeriodos('2026-11-02', 'quinzenal', 3)),
  };
} catch (e) {
  console.warn(`aviso: não foi possível importar src/lib/calc.ts (${e.message}); paridade TS desativada`);
}

const migracoes = readdirSync(dirMig).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
const filtro = process.env.PRETIUM_TEST ?? '';
const testes = readdirSync(aqui).filter((f) => /^orc_.+\.test\.sql$/.test(f) && f.includes(filtro)).sort();
const ler = (p) => readFileSync(p, 'utf8');
const stub = join(raiz, 'supabase', 'tests', 'core', 'core_stub_supabase.sql');
const lacunas = join(raiz, 'supabase', '.temp', 'orc_stub_lacunas.sql');
const seed = join(raiz, 'supabase', 'seed.sql');
const helpersCore = join(raiz, 'supabase', 'tests', 'core', 'core_helpers.sql');

let falhas = 0;
let total = 0;
for (const arquivo of testes) {
  const db = await PGlite.create({ extensions: { citext, pg_trgm, unaccent, pgcrypto } });
  const etapa = async (nome, sql) => {
    try {
      await db.exec(sql);
    } catch (e) {
      console.error(`\n✗ erro ao aplicar ${nome}: ${e.message}`);
      if (e.position) console.error(`  posição ${e.position}: …${sql.slice(Math.max(0, e.position - 120), Number(e.position) + 60)}…`);
      if (e.where) console.error(`  ${e.where}`);
      throw e;
    }
  };
  console.log(`\n=== ${arquivo} ===`);
  const t0 = Date.now();
  try {
    await etapa('core_stub_supabase.sql', ler(stub));
    for (const m of migracoes) {
      if (Number(m.slice(0, 4)) === 10 && existsSync(lacunas)) await etapa('orc_stub_lacunas.sql', ler(lacunas));
      await etapa(m, ler(join(dirMig, m)));
    }
    if (process.env.PRETIUM_SEED !== '0') await etapa('seed.sql', ler(seed));
    await etapa('core_helpers.sql', ler(helpersCore));
    await etapa('orc_helpers.sql', ler(join(aqui, 'orc_helpers.sql')));
    for (const [k, v] of Object.entries(calcValores)) {
      await db.query(`select tests.set($1, $2)`, [`calc:${k}`, String(v)]);
    }
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
    const extra = r.detalhe && (!r.ok || process.env.PRETIUM_VERBOSE) ? `   [${r.detalhe}]` : '';
    console.log(`${r.ok ? 'ok  ' : 'FALHA'} ${String(r.n).padStart(3)} ${r.descricao}${extra}`);
  }
  console.log(`(${Date.now() - t0} ms)`);
  await db.close();
}

console.log(`\nmigrações: ${migracoes.join(', ')}`);
console.log(`${total - falhas}/${total} casos passaram${falhas ? `, ${falhas} falha(s)` : ''}.`);
process.exit(falhas ? 1 : 0);
