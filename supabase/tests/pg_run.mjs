#!/usr/bin/env node
/**
 * Roda as MESMAS suítes SQL (supabase/tests/core/core_*.test.sql e orcamento/orc_*.test.sql) num
 * Postgres REAL (ex.: o Postgres 15 do `supabase start`) via `psql`, em vez do PGlite (agente TESTES).
 *
 * Para cada arquivo cria um banco descartável `pretium_t_<n>` no servidor de PRETIUM_PG_URL
 * (padrão postgresql://postgres:postgres@127.0.0.1:54322/postgres) e aplica, na MESMA sessão psql:
 *   core_stub_supabase.sql → migrations/* → [seed.sql (orc)] → core_helpers.sql → [orc_helpers.sql] → teste
 * Depois lê tests.resultados. Os bancos são removidos ao final (PRETIUM_MANTER_DB=1 mantém).
 *
 * Sai com 0 (pulando) se psql ou o servidor não estiverem disponíveis, salvo PRETIUM_PG=obrigatorio.
 * Filtro: PRETIUM_TEST=<padrão>.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..', '..');
const URL_PG = process.env.PRETIUM_PG_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const obrigatorio = process.env.PRETIUM_PG === 'obrigatorio';
const filtro = process.env.PRETIUM_TEST ?? '';

const psql = (url, args, input) => spawnSync('psql', [url, '-X', '-v', 'ON_ERROR_STOP=1', '-q', ...args], { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });
const comDb = (db) => URL_PG.replace(/\/[^/?]*(\?|$)/, `/${db}$1`);

function pular(msg) {
  if (obrigatorio) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`⚠ ${msg}`);
  process.exit(0);
}

const versao = psql(URL_PG, ['-At', '-c', 'show server_version']);
if (versao.error) pular('psql não encontrado: suítes SQL em Postgres real NÃO executadas.');
if (versao.status !== 0) pular(`Postgres indisponível em ${URL_PG}: suítes SQL em Postgres real NÃO executadas.`);
console.log(`Postgres ${versao.stdout.trim()} em ${URL_PG.replace(/:[^:@/]*@/, ':***@')}`);

const dirMig = join(raiz, 'supabase', 'migrations');
const migracoes = readdirSync(dirMig).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort().map((f) => join(dirMig, f));
const stub = join(raiz, 'supabase', 'tests', 'core', 'core_stub_supabase.sql');
const helpersCore = join(raiz, 'supabase', 'tests', 'core', 'core_helpers.sql');
const helpersOrc = join(raiz, 'supabase', 'tests', 'orcamento', 'orc_helpers.sql');
const seed = join(raiz, 'supabase', 'seed.sql');

// valores de paridade calculados por src/lib/calc.ts (mesmos do orc_run.mjs)
let calc = {};
try {
  const c = await import(pathToFileURL(join(raiz, 'src', 'lib', 'calc.ts')).href);
  const bdiTcu = { ac: 4, s: 0.4, r: 1.27, g: 0.4, df: 1.23, l: 7.4, pis: 0.65, cofins: 3, iss: 5, cprb: 0 };
  calc = {
    bdi_tcu_iss5: c.calcularBdi(bdiTcu),
    bdi_tcu_iss3: c.calcularBdi({ ...bdiTcu, iss: 3 }),
    bdi_quartil1: c.calcularBdi({ ac: 3, s: 0.4, r: 0.97, g: 0.4, df: 0.59, l: 6.16, pis: 0.65, cofins: 3, iss: 2.5, cprb: 0 }),
    bdi_desonerado: c.calcularBdi({ ...bdiTcu, cprb: 4.5 }),
    custo_comp_9_04: c.custoComposicao([{ coeficiente: 0.5, preco: 10.333 }, { coeficiente: 1.25, preco: 3.1 }, { coeficiente: 2, preco: null }]),
    item: JSON.stringify(c.calcularItem({ quantidade: 12.345, custo_unitario: 57.89, bdi_percentual: 22.12 })),
    membro: JSON.stringify(c.custoMembro({ quantidade: 2, horas_dia: 8, dias: 10, preco_insumo_hora: null, salario_hora: 10, aplicar_encargos: true }, 100)),
    honorarios_total: c.totalHonorarios([5460, 5000], 10, 10).total,
    periodos_mensal: JSON.stringify(c.gerarPeriodos('2026-01-31', 'mensal', 3)),
    periodos_quinzenal: JSON.stringify(c.gerarPeriodos('2026-11-02', 'quinzenal', 3)),
  };
} catch (e) {
  console.warn(`aviso: calc.ts não importado (${e.message}); paridade TS desativada`);
}

const suites = [
  ...readdirSync(join(aqui, 'core')).filter((f) => /^core_.+\.test\.sql$/.test(f)).map((f) => ({ arq: join(aqui, 'core', f), nome: f, orc: false })),
  ...readdirSync(join(aqui, 'orcamento')).filter((f) => /^orc_.+\.test\.sql$/.test(f)).map((f) => ({ arq: join(aqui, 'orcamento', f), nome: f, orc: true })),
].filter((s) => s.nome.includes(filtro)).sort((a, b) => a.nome.localeCompare(b.nome));

const tmp = mkdtempSync(join(tmpdir(), 'pretium-pg-'));
let total = 0;
let falhas = 0;
for (const [i, s] of suites.entries()) {
  const db = `pretium_t_${process.pid}_${i}`;
  psql(URL_PG, ['-c', `drop database if exists ${db}`]);
  const cria = psql(URL_PG, ['-c', `create database ${db}`]);
  if (cria.status !== 0) {
    console.error(cria.stderr);
    process.exit(1);
  }
  const ctx = join(tmp, `ctx_${i}.sql`);
  writeFileSync(ctx, Object.entries(s.orc ? calc : {}).map(([k, v]) => `select tests.set('calc:${k}', $v$${v}$v$);`).join('\n') + '\n');
  const arquivos = [stub, ...migracoes, ...(s.orc ? [seed] : []), helpersCore, ...(s.orc ? [helpersOrc, ctx] : []), s.arq];
  const t0 = Date.now();
  console.log(`\n=== ${s.nome} ===`);
  const r = psql(comDb(db), arquivos.flatMap((f) => ['-f', f]));
  if (r.status !== 0) {
    console.error(`✗ erro ao aplicar: ${r.stderr.split('\n').filter(Boolean).slice(-4).join('\n  ')}`);
    falhas += 1;
    total += 1;
  } else {
    const res = psql(comDb(db), ['-At', '-F', '\t', '-c', 'select n, ok, descricao, coalesce(detalhe, \'\') from tests.resultados order by n']);
    for (const linha of res.stdout.split('\n').filter(Boolean)) {
      const [n, ok, desc, det] = linha.split('\t');
      total += 1;
      if (ok !== 't') falhas += 1;
      console.log(`${ok === 't' ? 'ok  ' : 'FALHA'} ${n.padStart(3)} ${desc}${ok !== 't' && det ? `   [${det}]` : ''}`);
    }
    console.log(`(${Date.now() - t0} ms)`);
  }
  if (!process.env.PRETIUM_MANTER_DB) psql(URL_PG, ['-c', `drop database if exists ${db} with (force)`]);
}
rmSync(tmp, { recursive: true, force: true });
console.log(`\nPostgres ${versao.stdout.trim()}: ${total - falhas}/${total} casos passaram${falhas ? `, ${falhas} falha(s)` : ''}.`);
process.exit(falhas ? 1 : 0);
