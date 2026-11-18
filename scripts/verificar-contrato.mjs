#!/usr/bin/env node
/**
 * Verificador estático/semântico do contrato frontend × banco (agente TESTES).
 *
 * 1. Extrai de src/** todas as chamadas supabase-js (tabelas, colunas do select, embeds com dica de
 *    FK, filtros/ordenação, chaves literais de insert/update/upsert, onConflict, RPCs e nomes de
 *    parâmetros, buckets do Storage) — ver scripts/contrato/extrair.mjs.
 * 2. Aplica stub do Supabase + supabase/migrations/* num Postgres em memória (PGlite) e lê o catálogo
 *    (information_schema, pg_constraint, pg_proc, pg_index, privilégios, RLS).
 * 3. Valida cada chamada contra o catálogo:
 *    - tabela existe, tem RLS ligada e `authenticated` tem o privilégio da operação;
 *    - colunas do select/filtros/escritas existem; embeds têm FK entre as tabelas, a dica `!fk`
 *      é um nome de constraint (ou coluna) válido e embeds sem dica não são ambíguos (PGRST201);
 *    - `onConflict` corresponde a uma constraint/índice único;
 *    - RPC existe, `authenticated` tem EXECUTE, todo parâmetro enviado existe e todo parâmetro
 *      obrigatório (sem default) é enviado;
 *    - bucket existe em storage.buckets.
 *
 * Uso: node scripts/verificar-contrato.mjs [--json]     (código de saída 1 se houver erro)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { extrair, parseSelect, RAIZ } from './contrato/extrair.mjs';

const { PGlite } = await import('@electric-sql/pglite');
const { citext } = await import('@electric-sql/pglite/contrib/citext');
const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
const { unaccent } = await import('@electric-sql/pglite/contrib/unaccent');
const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');

const dirMig = join(RAIZ, 'supabase', 'migrations');
const db = await PGlite.create({ extensions: { citext, pg_trgm, unaccent, pgcrypto } });
await db.exec(readFileSync(join(RAIZ, 'supabase/tests/core/core_stub_supabase.sql'), 'utf8'));
for (const m of readdirSync(dirMig).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()) {
  try {
    await db.exec(readFileSync(join(dirMig, m), 'utf8'));
  } catch (e) {
    console.error(`erro ao aplicar ${m}: ${e.message}`);
    process.exit(1);
  }
}

// ─── catálogo ─────────────────────────────────────────────────────────────────
const q = async (sql) => (await db.query(sql)).rows;
const colunas = new Map();
for (const r of await q(`select table_name t, column_name c from information_schema.columns where table_schema = 'public'`)) {
  if (!colunas.has(r.t)) colunas.set(r.t, new Set());
  colunas.get(r.t).add(r.c);
}
const tabelas = new Map(
  (await q(`select c.relname nome, c.relkind kind, c.relrowsecurity rls,
                   has_table_privilege('authenticated', c.oid, 'SELECT') sel,
                   has_table_privilege('authenticated', c.oid, 'INSERT') ins,
                   has_table_privilege('authenticated', c.oid, 'UPDATE') upd,
                   has_table_privilege('authenticated', c.oid, 'DELETE') del
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relkind in ('r','v','m','p')`)).map((r) => [r.nome, r]),
);
const fks = await q(`select con.conname nome, src.relname origem, dst.relname destino,
                            array(select a.attname from unnest(con.conkey) k join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k) colunas
                       from pg_constraint con
                       join pg_class src on src.oid = con.conrelid join pg_namespace ns on ns.oid = src.relnamespace
                       join pg_class dst on dst.oid = con.confrelid join pg_namespace nd on nd.oid = dst.relnamespace
                      where con.contype = 'f' and ns.nspname = 'public' and nd.nspname = 'public'`);
const unicos = await q(`select t.relname tabela, array(select a.attname from unnest(i.indkey) k join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k) colunas,
                               i.indpred is not null parcial
                          from pg_index i join pg_class t on t.oid = i.indrelid join pg_namespace n on n.oid = t.relnamespace
                         where n.nspname = 'public' and i.indisunique`);
const funcoes = new Map();
for (const r of await q(`select p.proname nome, p.proargnames nomes, p.proargmodes modos, p.pronargs nargs, p.pronargdefaults ndef,
                                has_function_privilege('authenticated', p.oid, 'EXECUTE') exec,
                                has_function_privilege('anon', p.oid, 'EXECUTE') exec_anon
                           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)) {
  const modos = r.modos ?? Array(r.nargs).fill('i');
  const entrada = (r.nomes ?? []).filter((_, i) => ['i', 'b', 'v'].includes(modos[i] ?? 'i'));
  const obrigatorios = entrada.slice(0, entrada.length - r.ndef);
  if (!funcoes.has(r.nome)) funcoes.set(r.nome, []);
  funcoes.get(r.nome).push({ entrada, obrigatorios, exec: r.exec, execAnon: r.exec_anon });
}
const buckets = new Set((await q(`select id from storage.buckets`)).map((r) => r.id));

// RPCs chamadas antes de haver sessão (nenhuma hoje: /convite/:token fica atrás de RequireAuth).
const RPC_ANON = new Set([]);

// ─── validação ────────────────────────────────────────────────────────────────
const chamadas = extrair();
const erros = [];
const avisos = [];
const err = (c, msg) => erros.push(`${c.arquivo}:${c.linha ?? ''} ${msg}`);

function relacoes(pai, filho) {
  // many-to-one (pai.fk → filho) e one-to-many (filho.fk → pai)
  return fks.filter((f) => (f.origem === pai && f.destino === filho) || (f.origem === filho && f.destino === pai));
}

function validarSelect(c, tabela, itens, caminho = tabela) {
  const cols = colunas.get(tabela);
  if (!cols) return err(c, `tabela/visão inexistente no select: ${caminho}`);
  const aliases = new Map();
  for (const it of itens) {
    if (it.tipo === 'coluna' && !cols.has(it.coluna)) err(c, `coluna inexistente: ${caminho}.${it.coluna}`);
    if (it.tipo === 'embed') {
      if (!colunas.has(it.tabela)) {
        err(c, `embed de tabela inexistente: ${caminho} → ${it.tabela}`);
        continue;
      }
      const rels = relacoes(tabela, it.tabela);
      const dicas = it.dicas.filter((d) => d !== 'inner' && d !== 'left');
      if (!rels.length) err(c, `sem FK entre ${tabela} e ${it.tabela} (embed ${it.alias ?? it.tabela})`);
      else if (dicas.length) {
        for (const d of dicas) {
          const okDica = rels.some((r) => r.nome === d || r.colunas.includes(d));
          if (!okDica) err(c, `dica de FK inválida "!${d}" entre ${tabela} e ${it.tabela}; existentes: ${rels.map((r) => r.nome).join(', ')}`);
        }
      } else if (rels.length > 1) err(c, `embed ambíguo ${tabela} → ${it.tabela} (PGRST201): use !${rels.map((r) => r.nome).join(' ou !')}`);
      if (tabela === it.tabela && !dicas.length) err(c, `auto-embed sem dica: ${tabela}`);
      validarSelect(c, it.tabela, it.filhos, `${caminho}.${it.alias ?? it.tabela}`);
      aliases.set(it.alias ?? it.tabela, it.tabela);
    }
  }
  return aliases;
}

const ESCRITA_PRIV = { insert: 'ins', update: 'upd', upsert: 'ins', delete: 'del' };
let nFrom = 0;
let nRpc = 0;
let nStorage = 0;
const tabelasUsadas = new Set();
const rpcsUsadas = new Set();

for (const c of chamadas) {
  if (c.tipo === 'storage') {
    nStorage++;
    if (c.bucket !== '<dinâmico>' && !buckets.has(c.bucket)) err(c, `bucket inexistente: ${c.bucket}`);
    continue;
  }
  if (c.tipo === 'rpc') {
    nRpc++;
    if (c.funcao === '<dinâmico>') {
      avisos.push(`${c.arquivo}:${c.linha} rpc com nome dinâmico não verificado`);
      continue;
    }
    rpcsUsadas.add(c.funcao);
    const sobrecargas = funcoes.get(c.funcao);
    if (!sobrecargas) {
      err(c, `RPC inexistente: ${c.funcao}`);
      continue;
    }
    if (c.params == null || c.spread) {
      avisos.push(`${c.arquivo}:${c.linha} parâmetros de ${c.funcao} não literais`);
      continue;
    }
    const casa = sobrecargas.find((f) => c.params.every((p) => f.entrada.includes(p)) && f.obrigatorios.every((p) => c.params.includes(p)));
    if (!casa) {
      const f = sobrecargas[0];
      err(c, `parâmetros de ${c.funcao} não casam: enviados [${c.params}] × função (${f.entrada.join(', ')}; obrigatórios ${f.obrigatorios.join(', ') || '—'})`);
    } else if (!casa.exec) err(c, `authenticated sem EXECUTE em ${c.funcao}`);
    else if (RPC_ANON.has(c.funcao) && !casa.execAnon) err(c, `anon sem EXECUTE em ${c.funcao} (chamada antes do login)`);
    continue;
  }
  nFrom++;
  const t = tabelas.get(c.tabela);
  if (!c.tabela || !t) {
    err(c, `tabela inexistente: ${c.tabela}`);
    continue;
  }
  tabelasUsadas.add(c.tabela);
  if (t.kind === 'r' && !t.rls) err(c, `tabela ${c.tabela} sem RLS`);
  const cols = colunas.get(c.tabela);
  let aliases = new Map();
  for (const s of c.select) {
    if (s === '<dinâmico>') {
      avisos.push(`${c.arquivo}:${c.linha} select dinâmico não verificado`);
      continue;
    }
    if (!t.sel) err(c, `authenticated sem SELECT em ${c.tabela}`);
    aliases = new Map([...aliases, ...(validarSelect(c, c.tabela, parseSelect(s)) ?? [])]);
  }
  if (c.escritas.length === 0 && c.select.length === 0) avisos.push(`${c.arquivo}:${c.linha} from('${c.tabela}') sem select/escrita reconhecível`);
  for (const f of c.filtros) {
    if (!f.coluna) continue;
    if (f.coluna.includes('.')) {
      const [a, col] = f.coluna.split('.');
      const alvo = aliases.get(a);
      if (!alvo) err(c, `filtro em embed desconhecido: ${f.coluna}`);
      else if (!colunas.get(alvo)?.has(col)) err(c, `coluna inexistente no filtro: ${alvo}.${col}`);
    } else if (!cols.has(f.coluna)) err(c, `coluna inexistente no .${f.metodo}(): ${c.tabela}.${f.coluna}`);
  }
  for (const e of c.escritas) {
    const priv = ESCRITA_PRIV[e.op];
    if (!t[priv]) err(c, `authenticated sem ${e.op.toUpperCase()} em ${c.tabela}`);
    if (e.op === 'upsert' && !t.upd) err(c, `upsert exige UPDATE em ${c.tabela}`);
    for (const k of e.chaves ?? []) if (!cols.has(k)) err(c, `coluna inexistente no ${e.op}: ${c.tabela}.${k}`);
  }
  if (c.onConflict) {
    const alvo = c.onConflict.split(',').map((x) => x.trim()).sort().join(',');
    const casa = unicos.some((u) => u.tabela === c.tabela && !u.parcial && [...u.colunas].sort().join(',') === alvo);
    if (!casa) err(c, `onConflict(${c.onConflict}) sem constraint única em ${c.tabela}`);
  }
}

// Toda tabela do schema public precisa ter RLS (mesmo as não usadas pelo front).
for (const [nome, t] of tabelas) if (t.kind === 'r' && !t.rls) erros.push(`schema: tabela public.${nome} sem RLS`);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ chamadas, erros, avisos }, null, 2));
} else {
  console.log(`Chamadas analisadas: ${nFrom} from() · ${nRpc} rpc() · ${nStorage} storage.from()`);
  console.log(`Tabelas usadas: ${tabelasUsadas.size} · RPCs usadas: ${rpcsUsadas.size} · buckets: ${[...buckets].join(', ')}`);
  for (const a of avisos) console.log(`aviso  ${a}`);
  for (const e of erros) console.log(`ERRO   ${e}`);
  console.log(erros.length ? `\n${erros.length} erro(s) de contrato.` : '\nContrato frontend × banco: OK.');
}
await db.close();
process.exit(erros.length ? 1 : 0);
