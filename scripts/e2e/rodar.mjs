#!/usr/bin/env node
/**
 * E2E de navegador (agente TESTES): o app de produção (vite build + vite preview) contra o Supabase
 * LOCAL real, dirigido pelo Playwright (Chromium).
 *
 *  1. Semeia, via supabase-js, um admin e um usuário (ativados com a service_role), organização, cliente,
 *     obra, orçamento com EAP/itens/memória/BDI, cronograma, medição, equipe e honorário.
 *  2. Builda o app com VITE_SUPABASE_URL/ANON_KEY do stack local e sobe `vite preview`.
 *  3. Faz login pela tela (e testa senha errada), percorre as telas principais (claro/escuro), edita uma
 *     quantidade na planilha (confere gravação, trigger e total na tela), abre a impressão e gera PDF; registra erros de console, exceções, respostas
 *     HTTP ≥ 400, estouro horizontal em 390 px e telas com <EstadoErro>.
 *  4. Screenshots (deviceScaleFactor 1) e relatorio.json em test-results/e2e/.
 *
 * Sai com 0 (pulando) se o Supabase local ou o Playwright não estiverem disponíveis, exceto com
 * PRETIUM_E2E=obrigatorio. Opções: --sem-build (reaproveita o build anterior), --telas=<filtro>.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const saida = join(raiz, 'test-results', 'e2e');
const URL_API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PORTA = Number(process.env.PRETIUM_E2E_PORT ?? 4179);
const BASE = `http://127.0.0.1:${PORTA}`;
const obrigatorio = process.env.PRETIUM_E2E === 'obrigatorio';
const filtroTelas = (process.argv.find((a) => a.startsWith('--telas=')) ?? '').slice(8);
const SENHA = 'Senha-forte-123';

function pular(msg) {
  if (obrigatorio) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`⚠ ${msg}`);
  process.exit(0);
}

// ─── pré-requisitos ──────────────────────────────────────────────────────────
let chromium;
try {
  chromium = createRequire(join(raiz, 'package.json'))('playwright').chromium;
} catch {
  try {
    chromium = createRequire(import.meta.url)('playwright').chromium;
  } catch {
    pular('Playwright não encontrado: E2E de navegador NÃO executado.');
  }
}
try {
  const r = await fetch(`${URL_API}/auth/v1/health`, { signal: AbortSignal.timeout(3000) });
  if (r.status >= 500) throw new Error();
} catch {
  pular(`Supabase não responde em ${URL_API}: E2E de navegador NÃO executado (rode \`supabase start\`).`);
}

// ─── semeadura ───────────────────────────────────────────────────────────────
const rodada = Date.now().toString(36);
const email = (n) => `e2e-${n}.${rodada}@example.com`;
const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const svc = createClient(URL_API, SERVICE, opcoes);

function ok(r, oque) {
  if (r.error) throw new Error(`${oque}: ${r.error.message}`);
  return r.data;
}

async function usuario(nome, admin) {
  const c = createClient(URL_API, ANON, opcoes);
  const { data, error } = await c.auth.signUp({ email: email(nome), password: SENHA, options: { data: { nome } } });
  if (error) throw error;
  ok(await svc.from('profiles').update({ status: 'active', ...(admin ? { papel_global: 'admin' } : {}), nome: admin ? 'Admin E2E' : 'Ana Projetista' }).eq('id', data.user.id), 'ativar');
  const s = await c.auth.signInWithPassword({ email: email(nome), password: SENHA });
  if (s.error) throw s.error;
  return c;
}

console.log('→ semeando dados de E2E…');
const admin = await usuario('admin', true);
ok(await admin.rpc('criar_organizacao', { p_nome: 'Administração Pretium' }), 'org admin');
const c = await usuario('ana', false);
const orgId = ok(await c.rpc('criar_organizacao', { p_nome: 'Atelier Ana Engenharia', p_cnpj: '11222333000181' }), 'org');
ok(await c.from('organizacoes').update({ municipio: 'Rio de Janeiro', uf: 'RJ', responsavel_tecnico: 'Ana Projetista', crea_cau: 'CREA-RJ 123456' }).eq('id', orgId), 'org dados');
const cli = ok(await c.from('clientes').insert({ organizacao_id: orgId, tipo: 'PJ', nome: 'Construtora Horizonte Ltda.', documento: '11444777000161', email: 'contato@horizonte.example.com', municipio: 'Niterói', uf: 'RJ' }).select().single(), 'cliente');
ok(await c.from('clientes').insert({ organizacao_id: orgId, tipo: 'PF', nome: 'Maria da Silva', documento: '52998224725', municipio: 'Rio de Janeiro', uf: 'RJ' }), 'cliente PF');
const obra = ok(await c.from('obras').insert({ organizacao_id: orgId, cliente_id: cli.id, nome: 'Residência Alto da Boa Vista', codigo: 'OB-2026-014', status: 'orcamento', municipio: 'Rio de Janeiro', uf: 'RJ', area_construida_m2: 245.6, tipo_obra: 'Residencial unifamiliar' }).select().single(), 'obra');
ok(await c.from('obras').insert({ organizacao_id: orgId, nome: 'Reforma loja Centro', codigo: 'OB-2026-015', status: 'planejamento', municipio: 'Rio de Janeiro', uf: 'RJ' }), 'obra 2');
const db = ok(await c.from('datas_base').select('*').eq('status', 'publicada').eq('is_demo', true).eq('regime', 'nao_desonerado').limit(1).single(), 'data-base');
const bdi = { ac: 4, s: 0.4, r: 1.27, g: 0.4, df: 1.23, l: 7.4, pis: 0.65, cofins: 3, iss: 5, cprb: 0 };
const orcId = ok(await c.rpc('fn_orcamento_criar', { p_obra_id: obra.id, p_nome: 'Orçamento executivo', p_data_base_id: db.id, p_bdi_padrao: bdi }), 'orçamento');
const [e1] = ok(await c.from('orcamento_etapas').select('id').eq('orcamento_id', orcId), 'etapas');
const novaEtapa = async (nome, ordem, parent = null) =>
  ok(await c.from('orcamento_etapas').insert({ orcamento_id: orcId, nome, ordem, parent_id: parent }).select('id').single(), 'etapa').id;
const e2 = await novaEtapa('Infraestrutura', 2);
const e3 = await novaEtapa('Alvenaria e vedações', 3);
const e31 = await novaEtapa('Alvenaria de vedação', 1, e3);
ok(await c.rpc('fn_orcamento_renumerar', { p_orcamento_id: orcId }), 'renumerar');
const busca = async (t, tipo) => ok(await c.rpc('fn_buscar_referencias', { p_termo: t, p_data_base_id: db.id, p_organizacao_id: orgId, p_tipo: tipo, p_limite: 10 }), 'busca');
const comps = await busca('', 'composicao');
const insumos = await busca('', 'insumo');
const add = async (etapa, ref, q, extra = {}) =>
  ok(await c.rpc('fn_orcamento_adicionar_item', { p_etapa_id: etapa, p_referencia_tipo: ref ? ref.tipo : 'livre', p_referencia_id: ref?.id ?? null, p_quantidade: q, ...extra }), 'item');
await add(e1.id, null, 1, { p_descricao: 'Placa de obra em chapa galvanizada', p_unidade: 'M2', p_custo_unitario: 412.3 });
await add(e1.id, comps[0], 40);
await add(e2, comps[1] ?? comps[0], 18.5);
await add(e2, insumos[0], 120);
const itAlv = await add(e31, comps[2] ?? comps[0], 0);
await add(e31, comps[3] ?? comps[0], 96.4);
await add(e31, insumos[1] ?? insumos[0], 350);
ok(await c.from('orcamento_itens').update({ usa_memoria: true }).eq('id', itAlv.id), 'usa memória');
ok(await c.from('orcamento_item_memorias').insert([
  { item_id: itAlv.id, ordem: 1, descricao: 'Parede eixo A', expressao: '(4,5+3,2)*2,8', resultado: 21.56 },
  { item_id: itAlv.id, ordem: 2, descricao: 'Parede eixo B', expressao: '12*2,8', resultado: 33.6 },
]), 'memória');
ok(await c.rpc('fn_orcamento_recalcular', { p_orcamento_id: orcId }), 'recalcular');
ok(await c.rpc('fn_cronograma_salvar', {
  p_orcamento_id: orcId, p_data_inicio: '2026-12-01', p_periodicidade: 'mensal', p_num_periodos: 4,
  p_distribuicoes: [
    { etapa_id: e1.id, periodo: 1, percentual: 100 },
    { etapa_id: e2, periodo: 1, percentual: 30 }, { etapa_id: e2, periodo: 2, percentual: 70 },
    { etapa_id: e3, periodo: 3, percentual: 60 }, { etapa_id: e3, periodo: 4, percentual: 40 },
  ],
}), 'cronograma');
// cópia aprovada para a medição (o original segue editável)
const orcAprov = ok(await c.rpc('fn_orcamento_duplicar', { p_orcamento_id: orcId, p_nova_versao: true }), 'duplicar');
ok(await c.from('orcamentos').update({ status: 'aprovado' }).eq('id', orcAprov), 'aprovar');
const medId = ok(await c.rpc('fn_medicao_criar', { p_orcamento_id: orcAprov, p_periodo_inicio: '2026-12-01', p_periodo_fim: '2026-12-31' }), 'medição');
const itensAprov = ok(await c.from('orcamento_itens').select('id, quantidade').eq('orcamento_id', orcAprov).gt('quantidade', 0).limit(3), 'itens aprov');
for (const it of itensAprov) ok(await c.from('medicao_itens').insert({ medicao_id: medId, item_id: it.id, quantidade: Math.round(it.quantidade * 0.4 * 100) / 100 }), 'medir');
const eq = ok(await c.from('orcamento_equipes').insert({ orcamento_id: orcId, nome: 'Equipe de alvenaria', ordem: 1 }).select('id').single(), 'equipe');
ok(await c.from('orcamento_equipe_membros').insert([
  { equipe_id: eq.id, funcao: 'Pedreiro', salario_hora: 21.5, quantidade: 3, horas_dia: 8, dias: 22, ordem: 1 },
  { equipe_id: eq.id, funcao: 'Servente', salario_hora: 14.8, quantidade: 2, horas_dia: 8, dias: 22, ordem: 2 },
]), 'membros');
const hon = ok(await c.from('honorarios').insert({ organizacao_id: orgId, obra_id: obra.id, nome: 'Projetos executivos', area_m2: 245.6, impostos_percentual: 11.33 }).select('id').single(), 'honorário');
ok(await c.from('honorario_disciplinas').insert([
  { honorario_id: hon.id, disciplina: 'arquitetonico', metodo: 'area', valor_m2: 48, ordem: 1 },
  { honorario_id: hon.id, disciplina: 'estrutural', metodo: 'fixo', valor_fixo: 6800, ordem: 2 },
  { honorario_id: hon.id, disciplina: 'orcamento', metodo: 'horas', horas: 24, valor_hora: 180, ordem: 3 },
]), 'disciplinas');
ok(await c.rpc('fn_honorario_recalcular', { p_honorario_id: hon.id }), 'honorário recalcular');
const insProp = ok(await c.from('insumos').insert({ organizacao_id: orgId, fonte: 'propria', codigo: 'PR-001', descricao: 'Bloco de concreto aparente 14x19x39', unidade: 'UN', tipo: 'material', preco_proprio: 4.9 }).select('id').single(), 'insumo próprio');
const compProp = ok(await c.rpc('fn_composicao_propria_salvar', {
  p_id: null, p_cabecalho: { organizacao_id: orgId, codigo: 'CP-001', descricao: 'Alvenaria de bloco aparente', unidade: 'M2' },
  p_itens: [{ tipo_item: 'insumo', referencia_id: insProp.id, coeficiente: 13.5 }, { tipo_item: 'composicao', referencia_id: comps[0].id, coeficiente: 0.6 }],
}), 'composição própria');
const enc = ok(await c.from('encargos_sociais').select('id').is('organizacao_id', null).limit(1).single(), 'encargos');
const compSinapi = comps[0].id;
console.log(`  org ${orgId} · orçamento ${orcId} · aprovado ${orcAprov} · medição ${medId}`);

// ─── build + preview ─────────────────────────────────────────────────────────
const outDir = join(raiz, 'node_modules', '.e2e-dist');
const env = { ...process.env, VITE_SUPABASE_URL: URL_API, VITE_SUPABASE_ANON_KEY: ANON };
const vite = join(raiz, 'node_modules', '.bin', 'vite');
if (!process.argv.includes('--sem-build') || !existsSync(outDir)) {
  console.log('→ vite build (e2e)…');
  const b = spawnSync(vite, ['build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], { cwd: raiz, env, stdio: 'inherit' });
  if (b.status !== 0) process.exit(b.status ?? 1);
}
const preview = spawn(vite, ['preview', '--outDir', outDir, '--port', String(PORTA), '--strictPort', '--host', '127.0.0.1'], { cwd: raiz, env, stdio: 'ignore' });
const encerrar = () => preview.kill('SIGTERM');
process.on('exit', encerrar);
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    /* subindo */
  }
  await new Promise((r) => setTimeout(r, 250));
}

// ─── navegador ───────────────────────────────────────────────────────────────
rmSync(saida, { recursive: true, force: true });
mkdirSync(saida, { recursive: true });
const browser = await chromium.launch();
const relatorio = { base: BASE, telas: [], interacoes: [], problemas: [] };
const problema = (tela, tipo, detalhe) => relatorio.problemas.push({ tela, tipo, detalhe: String(detalhe).slice(0, 400) });

async function novoContexto(esquema, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: esquema, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  return ctx;
}

function vigiar(page, nomeRef) {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      const t = m.text();
      if (/React Router Future Flag|Download the React DevTools/.test(t)) return;
      problema(nomeRef.atual, `console.${m.type()}`, t);
    }
  });
  page.on('pageerror', (e) => problema(nomeRef.atual, 'pageerror', e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(URL_API)) problema(nomeRef.atual, `http ${r.status()}`, `${r.request().method()} ${r.url().replace(URL_API, '')}`);
  });
  page.on('requestfailed', (r) => {
    if (!/favicon/.test(r.url()) && r.failure()?.errorText !== 'net::ERR_ABORTED') problema(nomeRef.atual, 'requestfailed', `${r.url()} ${r.failure()?.errorText}`);
  });
}

async function login(page, mail) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('E-mail').fill(mail);
  await page.locator('input[autocomplete="current-password"]').fill(SENHA);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
}

async function estabilizar(page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('.animate-pulse, [aria-busy="true"]'), null, { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(250);
}

const TELAS_USUARIO = [
  ['dashboard', '/'],
  ['obras', '/obras'],
  ['obra-detalhe', `/obras/${obra.id}`],
  ['orcamentos', '/orcamentos'],
  ['orc-analitico', `/orcamentos/${orcId}`],
  ['orc-sintetico', `/orcamentos/${orcId}/sintetico`],
  ['orc-dados', `/orcamentos/${orcId}/dados`],
  ['orc-bdi', `/orcamentos/${orcId}/bdi`],
  ['orc-cronograma', `/orcamentos/${orcId}/cronograma`],
  ['orc-curva-abc', `/orcamentos/${orcId}/curva-abc`],
  ['orc-mao-de-obra', `/orcamentos/${orcId}/mao-de-obra`],
  ['orc-medicoes', `/orcamentos/${orcAprov}/medicoes`],
  ['orc-medicao', `/orcamentos/${orcAprov}/medicoes/${medId}`],
  ['orc-relatorios', `/orcamentos/${orcId}/relatorios`],
  ['sinapi', '/referencias/sinapi'],
  ['composicao', `/referencias/composicoes/${compSinapi}`],
  ['composicoes-proprias', '/referencias/composicoes-proprias'],
  ['composicao-propria', `/referencias/composicoes-proprias/${compProp}`],
  ['composicao-propria-nova', '/referencias/composicoes-proprias/nova'],
  ['insumos-proprios', '/referencias/insumos-proprios'],
  ['encargos', '/referencias/encargos'],
  ['encargos-detalhe', `/referencias/encargos/${enc.id}`],
  ['honorarios', '/honorarios'],
  ['honorario', `/honorarios/${hon.id}`],
  ['clientes', '/clientes'],
  ['cliente', `/clientes/${cli.id}`],
  ['organizacao', '/organizacao'],
  ['organizacao-membros', '/organizacao/membros'],
  ['perfil', '/perfil'],
  ['nao-encontrada', '/rota-inexistente'],
];
const TELAS_ADMIN = [
  ['admin', '/admin'],
  ['admin-usuarios', '/admin/usuarios'],
  ['admin-organizacoes', '/admin/organizacoes'],
  ['admin-sinapi', '/admin/sinapi'],
  ['admin-sinapi-importar', '/admin/sinapi/importar'],
  ['admin-auditoria', '/admin/auditoria'],
  ['admin-configuracoes', '/admin/configuracoes'],
];
const RELATORIOS = ['sintetico', 'analitico', 'composicoes', 'curva-abc-servicos', 'curva-abc-insumos', 'cronograma', 'memoria'];
const COM_SCREENSHOT = new Set(['dashboard', 'obras', 'orc-analitico', 'orc-sintetico', 'orc-bdi', 'orc-cronograma', 'orc-curva-abc', 'orc-medicao', 'sinapi', 'composicao', 'honorario', 'clientes', 'organizacao-membros', 'admin', 'admin-usuarios', 'admin-sinapi-importar']);

async function percorrer(esquema, mail, telas, prefixo) {
  const ctx = await novoContexto(esquema);
  const page = await ctx.newPage();
  const ref = { atual: `${prefixo}login` };
  vigiar(page, ref);
  await login(page, mail);
  for (const [nome, caminho] of telas) {
    if (filtroTelas && !nome.includes(filtroTelas)) continue;
    ref.atual = `${prefixo}${nome}`;
    const t0 = Date.now();
    await page.goto(`${BASE}${caminho}`);
    await estabilizar(page);
    const info = await page.evaluate(() => ({
      titulo: document.querySelector('h1')?.textContent?.trim() ?? null,
      erro: [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent?.trim()).filter((t) => t && /não foi possível|erro|permissão/i.test(t)),
      url: location.pathname,
    }));
    relatorio.telas.push({ tela: ref.atual, caminho, ms: Date.now() - t0, ...info });
    if (info.erro.length) problema(ref.atual, 'estado-erro', info.erro.join(' | '));
    if (info.url !== caminho && nome !== 'nao-encontrada') problema(ref.atual, 'redirecionada', `${caminho} → ${info.url}`);
    if (COM_SCREENSHOT.has(nome)) await page.screenshot({ path: join(saida, `${prefixo}${nome}-${esquema}.png`) });
  }
  await ctx.close();
}

// 1. telas (usuário e admin), claro e escuro
for (const esquema of ['light', 'dark']) {
  await percorrer(esquema, email('ana'), TELAS_USUARIO, '');
  await percorrer(esquema, email('admin'), TELAS_ADMIN, '');
}

// 2. interações reais no editor e impressão
{
  const ctx = await novoContexto('light');
  const page = await ctx.newPage();
  const ref = { atual: 'interacao-senha-errada' };
  vigiar(page, ref);
  await page.goto(`${BASE}/login`);
  await page.getByLabel('E-mail').fill(email('ana'));
  await page.locator('input[autocomplete="current-password"]').fill('senha-errada-123');
  await page.getByRole('button', { name: /entrar/i }).click();
  const msgErro = await page.getByText('E-mail ou senha incorretos.').waitFor({ timeout: 10_000 }).then(() => true, () => false);
  relatorio.interacoes.push({ nome: ref.atual, ok: msgErro });
  if (!msgErro) problema(ref.atual, 'interacao', 'mensagem de credenciais inválidas não apareceu');
  // o 400 do GoTrue para senha errada é esperado
  relatorio.problemas = relatorio.problemas.filter((p) => !(p.tela === ref.atual && /http 400|console.error/.test(p.tipo)));
  ref.atual = 'interacao-login';
  await login(page, email('ana'));

  ref.atual = 'interacao-editar-quantidade';
  const escritas = [];
  page.on('request', (r) => { if (r.method() !== 'GET' && r.url().startsWith(URL_API)) escritas.push(`${r.method()} ${r.url().replace(URL_API, '').split('?')[0]} ${r.postData() ?? ''}`.slice(0, 160)); });
  await page.goto(`${BASE}/orcamentos/${orcId}`);
  await estabilizar(page);
  const alvo = (await c.from('orcamento_itens').select('id, codigo, quantidade, total').eq('orcamento_id', orcId).eq('usa_memoria', false).gt('quantidade', 0).order('codigo').limit(1).single()).data;
  const campo = page.getByLabel(`Quantidade do item ${alvo.codigo}`);
  // Uma única tentativa, logo que o campo aparece (sem espera artificial): o Enter grava e move o
  // foco para a linha seguinte. Antes da correção do NumberInput, o blur dessa troca de foco
  // reenviava o valor ANTIGO e desfazia a edição (instabilidade relatada na 1ª rodada).
  await campo.waitFor({ state: 'visible' });
  await campo.click();
  await campo.fill('');
  await campo.pressSequentially('12,5');
  await campo.press('Enter');
  let gravado = null;
  for (let i = 0; i < 40 && Number(gravado?.quantidade) !== 12.5; i++) {
    await page.waitForTimeout(250);
    gravado = (await c.from('orcamento_itens').select('quantidade, total, preco_unitario').eq('id', alvo.id).single()).data;
  }
  await page.waitForTimeout(1500); // nenhuma escrita posterior pode desfazer o valor
  gravado = (await c.from('orcamento_itens').select('quantidade, total, preco_unitario').eq('id', alvo.id).single()).data;
  const patchesQtd = escritas.filter((e) => e.startsWith('PATCH /rest/v1/orcamento_itens'));
  if (patchesQtd.length !== 1) problema(ref.atual, 'interacao', `esperado 1 PATCH da quantidade, houve ${patchesQtd.length}: ${patchesQtd.join(' | ')}`);
  await page.waitForTimeout(1200); // recálculo consolidado (debounce 600 ms)
  const orcDepois = (await c.from('orcamentos').select('total').eq('id', orcId).single()).data;
  const okQtd = Number(gravado?.quantidade) === 12.5 && Math.abs(gravado.total - Math.round(12.5 * gravado.preco_unitario * 100) / 100) < 0.005;
  relatorio.interacoes.push({ nome: ref.atual, ok: okQtd, antes: alvo, depois: gravado, total_orcamento: orcDepois?.total });
  if (!okQtd) problema(ref.atual, 'interacao', `quantidade não persistiu: ${JSON.stringify(gravado)}`);
  const textoTotal = await page.locator('body').innerText();
  const fmt = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (orcDepois && !textoTotal.includes(fmt(orcDepois.total))) problema(ref.atual, 'interacao', `total ${fmt(orcDepois.total)} não aparece na tela após o recálculo`);
  await page.screenshot({ path: join(saida, 'interacao-editar-quantidade.png') });

  // sem preço / visual da planilha em tela estreita
  for (const [nome, caminho] of [['mobile-dashboard', '/'], ['mobile-orc-analitico', `/orcamentos/${orcId}`], ['mobile-obras', '/obras'], ['mobile-orc-bdi', `/orcamentos/${orcId}/bdi`], ['mobile-clientes', '/clientes']]) {
    ref.atual = nome;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}${caminho}`);
    await estabilizar(page);
    // documento, <main> (overflow-y:auto ⇒ também rola em x) e <header>: nada pode estourar a largura
    const largura = await page.evaluate(() =>
      ['html', 'main', 'header'].map((sel) => {
        const e = sel === 'html' ? document.documentElement : document.querySelector(sel);
        return e ? { sel, sw: e.scrollWidth, cw: e.clientWidth } : null;
      }).filter(Boolean),
    );
    relatorio.telas.push({ tela: nome, caminho, largura });
    for (const l of largura) if (l.sw > l.cw + 1) problema(nome, 'overflow-horizontal', `${l.sel}: scrollWidth ${l.sw} > ${l.cw}`);
    await page.screenshot({ path: join(saida, `${nome}.png`) });
  }
  await page.setViewportSize({ width: 1366, height: 900 });

  // impressão: cada relatório na rota /imprimir e PDF do sintético
  for (const rel of [...RELATORIOS, 'medicao']) {
    ref.atual = `imprimir-${rel}`;
    const id = rel === 'medicao' ? orcAprov : orcId;
    await page.goto(`${BASE}/imprimir/orcamentos/${id}/${rel}${rel === 'medicao' ? `?medicao=${medId}` : ''}`);
    await estabilizar(page);
    await page.emulateMedia({ media: 'print' });
    const info = await page.evaluate(() => ({ altura: document.body.scrollHeight, texto: document.body.innerText.length, erro: !!document.querySelector('[role="alert"]') }));
    relatorio.telas.push({ tela: ref.atual, ...info });
    if (info.texto < 200 || info.erro) problema(ref.atual, 'impressao', `conteúdo insuficiente/erro: ${JSON.stringify(info)}`);
    if (rel === 'sintetico' || rel === 'cronograma' || rel === 'medicao') {
      await page.pdf({ path: join(saida, `imprimir-${rel}.pdf`), preferCSSPageSize: true, printBackground: true });
      await page.screenshot({ path: join(saida, `imprimir-${rel}.png`), fullPage: false });
    }
    await page.emulateMedia({ media: 'screen' });
  }
  await ctx.close();
}

await browser.close();
encerrar();

writeFileSync(join(saida, 'relatorio.json'), JSON.stringify(relatorio, null, 2));
const telasOk = relatorio.telas.length;
console.log(`\nE2E: ${telasOk} telas/visitas, ${relatorio.interacoes.length} interação(ões), ${relatorio.problemas.length} problema(s). Screenshots e relatorio.json em ${saida}`);
for (const p of relatorio.problemas) console.log(`  ✗ [${p.tela}] ${p.tipo}: ${p.detalhe}`);
process.exit(relatorio.problemas.length ? 1 : 0);
