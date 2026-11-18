/**
 * Extrai de src/** (exceto testes e tipos) todas as chamadas do supabase-js:
 *   supabase.from('<tabela>') … .select('<colunas>') / .eq('<col>') / .order('<col>') / .insert({…}) / .update({…}) / .upsert({…}, { onConflict })
 *   supabase.rpc('<função>', { p_… })
 *   supabase.storage.from('<bucket>')
 * usando a API do compilador TypeScript (sem executar o código).
 *
 * Usado por scripts/verificar-contrato.mjs (catálogo do banco migrado) e pelos testes de integração
 * (src/test/integracao), que repetem cada select contra o PostgREST real.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const aqui = dirname(fileURLToPath(import.meta.url));
export const RAIZ = resolve(aqui, '..', '..');

function listar(dir) {
  const out = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome === 'test' || nome === 'types') continue;
      out.push(...listar(p));
    } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome) && !nome.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** Resolve um nó para string literal: literal, template sem substituição, concatenação ou const do mesmo arquivo. */
function texto(no, consts) {
  if (!no) return null;
  if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) return no.text;
  if (ts.isParenthesizedExpression(no)) return texto(no.expression, consts);
  if (ts.isBinaryExpression(no) && no.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = texto(no.left, consts);
    const b = texto(no.right, consts);
    return a != null && b != null ? a + b : null;
  }
  if (ts.isIdentifier(no) && consts.has(no.text)) return texto(consts.get(no.text), consts);
  return null;
}

/** Literais possíveis de um identificador cujo tipo declarado é união de strings ('a' | 'b'). */
function uniaoLiterais(no, checker) {
  if (!checker) return null;
  const t = checker.getTypeAtLocation(no);
  const tipos = t.isUnion() ? t.types : [t];
  const v = tipos.map((x) => (x.isStringLiteral() ? x.value : null));
  return v.every((x) => x != null) ? v : null;
}

function chavesObjeto(no) {
  if (!no) return null;
  if (ts.isArrayLiteralExpression(no)) return no.elements.length ? chavesObjeto(no.elements[0]) : [];
  if (!ts.isObjectLiteralExpression(no)) return null;
  const ks = [];
  let spread = false;
  for (const p of no.properties) {
    if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
      const n = p.name;
      if (ts.isIdentifier(n) || ts.isStringLiteral(n)) ks.push(n.text);
    } else if (ts.isSpreadAssignment(p)) spread = true;
  }
  return { chaves: ks, spread };
}

const FILTROS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'order', 'textSearch', 'match', 'not']);

/** Sobe a cadeia `.a().b().c()` a partir do `.from(...)`. */
function cadeia(call) {
  const passos = [];
  let n = call;
  while (n.parent && ts.isPropertyAccessExpression(n.parent) && n.parent.parent && ts.isCallExpression(n.parent.parent)) {
    const metodo = n.parent.name.text;
    n = n.parent.parent;
    passos.push({ metodo, args: n.arguments });
  }
  return passos;
}

/** Atribuições posteriores `q = q.eq(...)` sobre a variável que guardou a query. */
function cadeiaVariavel(call, consts) {
  const decl = call.parent?.parent;
  // let q = supabase.from(...).select(...)
  let alvo = call;
  while (alvo.parent && (ts.isPropertyAccessExpression(alvo.parent) || ts.isCallExpression(alvo.parent))) alvo = alvo.parent;
  const v = alvo.parent;
  if (!v || !ts.isVariableDeclaration(v) || !ts.isIdentifier(v.name)) return [];
  const nome = v.name.text;
  const bloco = v.parent?.parent?.parent;
  const passos = [];
  const visitar = (no) => {
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression)) {
      // sobe até a raiz e confere se começa em `nome`
      let raiz = no;
      const metodos = [];
      while (ts.isCallExpression(raiz) && ts.isPropertyAccessExpression(raiz.expression)) {
        metodos.unshift({ metodo: raiz.expression.name.text, args: raiz.arguments });
        raiz = raiz.expression.expression;
      }
      if (ts.isIdentifier(raiz) && raiz.text === nome) {
        passos.push(...metodos);
        return;
      }
    }
    ts.forEachChild(no, visitar);
  };
  if (bloco) ts.forEachChild(bloco, visitar);
  void decl;
  void consts;
  return passos;
}

export function extrair({ comChecker = true } = {}) {
  const arquivos = listar(join(RAIZ, 'src'));
  let checker = null;
  if (comChecker) {
    const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(join(RAIZ, 'tsconfig.app.json'), ts.sys.readFile).config, ts.sys, RAIZ);
    const prog = ts.createProgram(arquivos, { ...cfg.options, noEmit: true });
    checker = prog.getTypeChecker();
    var obterFonte = (p) => prog.getSourceFile(p);
  } else {
    obterFonte = (p) => ts.createSourceFile(p, readFileSync(p, 'utf8'), ts.ScriptTarget.Latest, true, p.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  }
  const chamadas = [];
  for (const arq of arquivos) {
    const sf = obterFonte(arq);
    if (!sf) continue;
    const consts = new Map();
    const coletarConsts = (no) => {
      if (ts.isVariableDeclaration(no) && ts.isIdentifier(no.name) && no.initializer && (no.parent.flags & ts.NodeFlags.Const)) consts.set(no.name.text, no.initializer);
      ts.forEachChild(no, coletarConsts);
    };
    coletarConsts(sf);
    const rel = relative(RAIZ, arq);
    const visitar = (no) => {
      if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression)) {
        const met = no.expression.name.text;
        const obj = no.expression.expression;
        const objTxt = obj.getText(sf);
        const linha = sf.getLineAndCharacterOfPosition(no.getStart(sf)).line + 1;
        if (met === 'from' && /(^|\.)supabase$/.test(objTxt)) {
          const tabela = texto(no.arguments[0], consts);
          const passos = [...cadeia(no), ...cadeiaVariavel(no, consts)];
          const reg = { arquivo: rel, linha, tipo: 'from', tabela, select: [], filtros: [], escritas: [], onConflict: null };
          for (const p of passos) {
            if (p.metodo === 'select') {
              const s = p.args.length ? texto(p.args[0], consts) : '*';
              reg.select.push(s ?? '<dinâmico>');
            } else if (FILTROS.has(p.metodo)) {
              const c = texto(p.args[0], consts);
              if (c) reg.filtros.push({ metodo: p.metodo, coluna: c });
            } else if (['insert', 'update', 'upsert', 'delete'].includes(p.metodo)) {
              const ch = p.metodo === 'delete' ? { chaves: [], spread: false } : chavesObjeto(p.args[0]);
              reg.escritas.push({ op: p.metodo, ...(ch ?? { chaves: null, spread: true }) });
              if (p.metodo === 'upsert' && p.args[1] && ts.isObjectLiteralExpression(p.args[1])) {
                for (const pr of p.args[1].properties) if (ts.isPropertyAssignment(pr) && pr.name.getText(sf) === 'onConflict') reg.onConflict = texto(pr.initializer, consts);
              }
            } else if (p.metodo === 'or') {
              reg.filtros.push({ metodo: 'or', expr: texto(p.args[0], consts) });
            }
          }
          chamadas.push(reg);
        } else if (met === 'from' && /(^|\.)supabase\.storage$/.test(objTxt)) {
          chamadas.push({ arquivo: rel, linha, tipo: 'storage', bucket: texto(no.arguments[0], consts) ?? '<dinâmico>' });
        } else if (met === 'rpc' && /(^|\.)supabase$/.test(objTxt)) {
          let nomes = texto(no.arguments[0], consts);
          nomes = nomes ? [nomes] : no.arguments[0] ? uniaoLiterais(no.arguments[0], checker) : null;
          const ch = no.arguments[1] ? chavesObjeto(no.arguments[1]) : { chaves: [], spread: false };
          for (const nome of nomes ?? ['<dinâmico>']) {
            chamadas.push({ arquivo: rel, linha, tipo: 'rpc', funcao: nome, params: ch?.chaves ?? null, spread: ch?.spread ?? true });
          }
        }
      }
      ts.forEachChild(no, visitar);
    };
    visitar(sf);
  }
  return chamadas;
}

// ─── Parser do parâmetro `select` do PostgREST ────────────────────────────────

/** Divide por vírgula no nível 0 de parênteses. */
function dividir(s) {
  const partes = [];
  let prof = 0;
  let atual = '';
  for (const ch of s) {
    if (ch === '(') prof++;
    if (ch === ')') prof--;
    if (ch === ',' && prof === 0) {
      partes.push(atual.trim());
      atual = '';
    } else atual += ch;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

/**
 * Converte `'*, obra:obras!fk(id, nome), membros:organizacao_membros(count)'` em
 * `[{tipo:'estrela'}, {tipo:'embed', alias:'obra', tabela:'obras', dicas:['fk'], filhos:[…]}, …]`.
 */
export function parseSelect(s) {
  return dividir(s.replace(/\s+/g, ' ')).map((parte) => {
    const m = /^([^()]*?)\((.*)\)$/s.exec(parte);
    if (m) {
      let cab = m[1].trim();
      let alias = null;
      const ix = cab.indexOf(':');
      if (ix >= 0 && cab[ix + 1] !== ':') {
        alias = cab.slice(0, ix).trim();
        cab = cab.slice(ix + 1).trim();
      }
      const [tabela, ...dicas] = cab.split('!').map((x) => x.trim());
      if (m[2].trim() === 'count' && !tabela) return { tipo: 'agregado' };
      return { tipo: 'embed', alias, tabela, dicas, filhos: parseSelect(m[2]) };
    }
    if (parte === '*') return { tipo: 'estrela' };
    if (parte === 'count') return { tipo: 'count' };
    let col = parte;
    let alias = null;
    const ix = col.search(/:(?!:)/);
    if (ix >= 0) {
      alias = col.slice(0, ix).trim();
      col = col.slice(ix + 1).trim();
    }
    col = col.replace(/::\w+$/, '').replace(/\.\w+\(\)$/, '').split('->')[0].trim();
    return { tipo: 'coluna', alias, coluna: col };
  });
}
