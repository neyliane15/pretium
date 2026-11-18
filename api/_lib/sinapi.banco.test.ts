// @vitest-environment node
/**
 * Integração real: pacote nacional simulado → importarNacional → RPCs de importação num Postgres (PGlite)
 * com todas as migrações, como service_role (a mesma chave usada pela função de servidor).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { zipSync } from 'fflate';
import * as XLSXns from 'xlsx';
import { importarNacional, lerPacote, type Rpc } from './sinapi';

const XLSX = ((XLSXns as unknown as { default?: typeof XLSXns }).default ?? XLSXns) as typeof XLSXns;
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

function pacote(): Uint8Array {
  const topo: unknown[][] = [['SINAPI'], [], [], [], [], [], [], []];
  const ins = (f: number): unknown[][] => [
    ...topo,
    [],
    ['Classificação', 'Código do Insumo', 'Descrição do insumo', 'Unidade', 'Origem de Preço', ...UFS],
    ['MATERIAL', 370, 'AREIA MEDIA', 'M3', 'C', ...UFS.map((_, i) => (100 + i) * f)],
    ['MATERIAL', 1379, 'CIMENTO CP II-32', 'KG', 'C', ...UFS.map((_, i) => (0.8 + i / 100) * f)],
  ];
  const comp = (f: number): unknown[][] => [
    ...topo,
    [null, null, null, null, ...UFS.flatMap((u) => [u, null])],
    ['Grupo', 'Código da Composição', 'Descrição', 'Unidade', ...UFS.flatMap(() => ['Custo', '%AS'])],
    ['ARGAMASSA', 87878, 'CHAPISCO APLICADO', 'M2', ...UFS.flatMap((_, i) => [(4 + i / 10) * f, 50])],
  ];
  const ana: unknown[][] = [
    ...topo,
    [],
    ['Grupo', 'Código da Composição', 'Tipo Item', 'Código do Item', 'Descrição', 'Unidade', 'Coeficiente', 'Situação'],
    ['ARGAMASSA', 87878, 'INSUMO', 370, 'AREIA MEDIA', 'M3', 0.004, 'COM PREÇO'],
    ['ARGAMASSA', 87878, 'INSUMO', 1379, 'CIMENTO', 'KG', 2.42, 'COM PREÇO'],
  ];
  const wb = XLSX.utils.book_new();
  const abas: [string, unknown[][]][] = [['ISD', ins(1)], ['ICD', ins(1.1)], ['CSD', comp(1)], ['CCD', comp(1.1)], ['Analítico', ana]];
  for (const [n, d] of abas) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(d), n);
  return zipSync({ 'SINAPI_Referência_2026_10.xlsx': new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer) });
}

describe('busca automática SINAPI × banco real', () => {
  it('importa SP e MG nos dois regimes, publica e grava o analítico uma vez', async () => {
    const db = await PGlite.create({ extensions: { citext, pg_trgm, unaccent, pgcrypto } });
    const raiz = join(__dirname, '../..');
    await db.exec(readFileSync(join(raiz, 'supabase/tests/core/core_stub_supabase.sql'), 'utf8'));
    const dir = join(raiz, 'supabase/migrations');
    for (const f of readdirSync(dir).filter((x) => /^\d{4}_.+\.sql$/.test(x)).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'));
    await db.exec(
      `select set_config('request.jwt.claim.role', 'service_role', false); select set_config('request.jwt.claims', '{"role":"service_role"}', false); set role service_role;`,
    );

    const rpc: Rpc = async (fn, args) => {
      const nomes = Object.keys(args);
      const params = nomes.map((n, i) => n + ' => $' + String(i + 1)).join(', ');
      const vals = nomes.map((n) => (Array.isArray(args[n]) ? JSON.stringify(args[n]) : args[n]));
      const { rows } = await db.query<{ r: unknown }>('select to_jsonb(public.' + fn + '(' + params + ')) as r', vals);
      return rows[0]!.r;
    };

    const { abas } = lerPacote(pacote());
    const r = await importarNacional(rpc, { ano: 2026, mes: 10, url: 'https://www.caixa.gov.br/x.zip', ufs: ['SP', 'MG'], abas, analiticoJaImportado: false });
    expect(r.avisos).toEqual([]);
    expect(r.ufs.map((u) => u.uf)).toEqual(['SP', 'MG']);

    const { rows: dbs } = await db.query<{ uf: string; regime: string; status: string; is_demo: boolean }>(
      `select uf::text, regime::text, status::text, is_demo from public.datas_base where ano = 2026 and mes = 10 order by uf, regime::text`,
    );
    expect(dbs).toEqual([
      { uf: 'MG', regime: 'desonerado', status: 'publicada', is_demo: false },
      { uf: 'MG', regime: 'nao_desonerado', status: 'publicada', is_demo: false },
      { uf: 'SP', regime: 'desonerado', status: 'publicada', is_demo: false },
      { uf: 'SP', regime: 'nao_desonerado', status: 'publicada', is_demo: false },
    ]);
    // preço da coluna da UF certa: SP = índice 25 → areia 125 (SD); MG = índice 10 → chapisco 5 (SD)
    const areia = await db.query<{ preco: string }>(
      `select ip.preco::text from public.insumo_precos ip join public.insumos i on i.id = ip.insumo_id join public.datas_base d on d.id = ip.data_base_id
        where i.codigo = '370' and d.uf = 'SP' and d.regime = 'nao_desonerado' and d.ano = 2026`,
    );
    expect(Number(areia.rows[0]!.preco)).toBe(125);
    const chap = await db.query<{ custo: string }>(
      `select cp.custo::text from public.composicao_precos cp join public.composicoes c on c.id = cp.composicao_id join public.datas_base d on d.id = cp.data_base_id
        where c.codigo = '87878' and d.uf = 'MG' and d.regime = 'nao_desonerado' and d.ano = 2026`,
    );
    expect(Number(chap.rows[0]!.custo)).toBe(5);
    const itens = await db.query<{ n: number }>(
      `select count(*)::int n from public.composicao_itens ci join public.composicoes c on c.id = ci.composicao_id where c.codigo = '87878' and c.organizacao_id is null`,
    );
    expect(itens.rows[0]!.n).toBe(2);
    const an = await db.query<{ n: number }>(`select count(*)::int n from public.sinapi_importacoes where tipo = 'analitico'`);
    expect(an.rows[0]!.n).toBe(1);
    await db.close();
  }, 60_000);
});
