#!/usr/bin/env node
/**
 * Testes de integração contra um Supabase REAL (agente TESTES).
 *
 * 1. Verifica se o stack responde em SUPABASE_URL (padrão http://127.0.0.1:54321, `supabase start`).
 *    Se não responder: avisa e sai com 0 (ou 1 com PRETIUM_INTEGRACAO=obrigatorio).
 * 2. Com --reset (ou PRETIUM_DB_RESET=1) roda `supabase db reset` (migrações 0001..N + seed no
 *    Postgres 15 do container) usando o CLI em $SUPABASE_CLI, no PATH ou via npx.
 * 3. Roda vitest com vitest.integracao.config.ts (hooks reais de src/api/** contra o PostgREST/GoTrue).
 *
 * Subir o stack: `supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,postgres-meta,supavisor,mailpit`
 * (em ambientes sem acesso ao ECR: SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const obrigatorio = process.env.PRETIUM_INTEGRACAO === 'obrigatorio';
const reset = process.argv.includes('--reset') || process.env.PRETIUM_DB_RESET === '1';

async function vivo() {
  try {
    const r = await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(3000) });
    return r.status < 500;
  } catch {
    return false;
  }
}

if (!(await vivo())) {
  const msg = `Supabase não responde em ${url}: testes de integração NÃO executados (rode \`supabase start\`).`;
  if (obrigatorio) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`⚠ ${msg}`);
  process.exit(0);
}

const rodar = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: raiz, stdio: 'inherit', ...opts });

if (reset) {
  const cli = process.env.SUPABASE_CLI ?? (spawnSync('supabase', ['--version']).status === 0 ? 'supabase' : null);
  const [cmd, base] = cli ? [cli, []] : ['npx', ['--yes', 'supabase']];
  console.log(`→ ${[cmd, ...base].join(' ')} db reset`);
  const r = rodar(cmd, [...base, 'db', 'reset']);
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const vitest = join(raiz, 'node_modules', '.bin', existsSync(join(raiz, 'node_modules', '.bin', 'vitest')) ? 'vitest' : 'vitest.cmd');
const extra = process.argv.slice(2).filter((a) => a !== '--reset');
const r = rodar(vitest, ['run', '--config', 'vitest.integracao.config.ts', ...extra]);
process.exit(r.status ?? 1);
