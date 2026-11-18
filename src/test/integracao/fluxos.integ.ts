/**
 * Fluxos ponta a ponta com os HOOKS REAIS de src/api/** contra um Supabase real
 * (GoTrue + PostgREST + Postgres 15). Os testes são sequenciais e dependem uns dos outros.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { calcularBdi, calcularItem, totalizarOrcamento, quantidadeDaMemoria, valorDisciplina, totalHonorarios } from '@/lib/calc';
import { useCriarOrganizacao, useConvidarMembro, useConvites, useMeusConvites, useAceitarConvite, useMembros, useSalvarOrganizacao, useAlterarPapelMembro } from '@/api/core/organizacao';
import { useAdminUsuarios, useDefinirStatusUsuario, useAdminOrganizacoes, useAdminEstatisticas, useAuditoria, useImportacoes, useDatasBaseAdmin } from '@/api/core/admin';
import { useSalvarCliente, useClientes, useCliente, useObrasDoCliente } from '@/api/core/clientes';
import { useSalvarObra, useObras, useObra, useClientesOpcoes } from '@/api/core/obras';
import { useConfiguracoesPublicas, useDataBaseMaisRecente } from '@/api/core/configuracoes';
import { executarImportacao } from '@/api/core/sinapi';
import {
  useCriarOrcamento, useOrcamento, useOrcamentos, useCriarEtapa, useEtapas, useItens, useAdicionarItem, useAtualizarItem,
  useRecalcularOrcamento, useSalvarBdi, useBdis, useSalvarMemorias, useMemorias, useMemoriasOrcamento, useResumoOrcamento,
  useDuplicarOrcamento, useMoverEap, useSalvarCotacao, useCotacoes, useExcluirCotacao, useTrocarDataBase, useAlterarStatusOrcamento,
  useExcluirItens,
} from '@/api/orcamento/orcamentos';
import { useDatasBase, buscarReferencias, useComposicaoAnalitica, useComposicaoItens, useSalvarComposicaoPropria, useComposicoesProprias, useSalvarInsumoProprio, useInsumosProprios, useEncargos, useEncargosDetalhe, useDuplicarEncargos } from '@/api/orcamento/referencias';
import {
  useCurvaAbcServicos, useCurvaAbcInsumos, useSalvarCronograma, useCronograma, useCronogramaFisicoFinanceiro, useCriarMedicao,
  useSalvarMedicaoItem, useMedicaoResumo, useMedicoes, useAtualizarMedicao, useSalvarEquipe, useEquipes, useSalvarMembro,
  useMaoObraResumo, useMaoObraHoras, useCriarHonorario, useSalvarHonorario, useHonorario, useHonorarios, useDashboard, useEncargosDoOrcamento,
} from '@/api/orcamento/analises';
import { detectarLinhaCabecalho, detectarTipo, extrair as extrairSinapi, sugerirMapeamento, type Matriz } from '@/lib/sinapi/parser';
import type { DataBase, Insumo, Organizacao, OrcamentoItem } from '@/types/database';
import type { ChamadaFrom } from '../../../scripts/contrato/extrair.mjs';
import { cadastrar, clientDe, clientServico, consultar, emailDe, entrar, estado, mutar } from './ambiente';

vi.mock('@/contexts/OrganizacaoContext', async () => {
  const { estado: e } = await import('./ambiente');
  return {
    useOrganizacao: () => ({
      organizacao: e.org,
      papel: e.papel,
      podeEditar: e.papel === 'owner' || e.papel === 'editor',
      isOwner: e.papel === 'owner',
      organizacoes: e.org && e.papel ? [{ organizacao: e.org, papel: e.papel }] : [],
      trocarOrganizacao: async () => {},
      loading: false,
    }),
  };
});
vi.mock('@/contexts/AuthContext', async () => {
  const { estado: e } = await import('./ambiente');
  return {
    useAuth: () => ({
      session: e.user ? { user: e.user } : null,
      user: e.user,
      profile: e.profile,
      loading: false,
      isAdmin: e.profile?.papel_global === 'admin',
      status: e.profile?.status ?? null,
      signOut: async () => {},
      refreshProfile: async () => {},
    }),
  };
});

const EMAIL = { admin: emailDe('admin'), ana: emailDe('ana'), bruno: emailDe('bruno'), carla: emailDe('carla'), vitor: emailDe('vitor') };
const ID: Record<string, string> = {};
let orgA: Organizacao;
let orgB: Organizacao;
let dbDemo: DataBase;
let orcId = '';
let etapa1 = '';
let etapa2 = '';
let sub11 = '';

const near = (a: number, b: number, eps = 0.005) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);

async function orgPorId(id: string): Promise<Organizacao> {
  const r = await supabase.from('organizacoes').select('*').eq('id', id).single();
  if (r.error) throw r.error;
  return r.data as Organizacao;
}

describe('1. autenticação e aprovação', () => {
  it('o primeiro cadastro vira admin ativo; os seguintes ficam pendentes', async () => {
    const svc = clientServico();
    const existentes = svc ? (await svc.from('profiles').select('id', { count: 'exact', head: true })).count ?? 0 : 0;
    ID.admin = await cadastrar('admin');
    const p = (await (await clientDe(EMAIL.admin)).from('profiles').select('*').eq('id', ID.admin).single()).data!;
    if (existentes === 0) {
      expect(p).toMatchObject({ papel_global: 'admin', status: 'active', email: EMAIL.admin });
    } else {
      // banco já usado (sem `db reset`): promove pelo service_role para seguir o roteiro
      expect(p.status).toBe('pending');
      const r = await svc!.from('profiles').update({ papel_global: 'admin', status: 'active' }).eq('id', ID.admin);
      expect(r.error).toBeNull();
    }
    for (const n of ['ana', 'bruno', 'carla', 'vitor'] as const) ID[n] = await cadastrar(n);
    const pb = (await (await clientDe(EMAIL.bruno)).from('profiles').select('status, papel_global, nome').eq('id', ID.bruno!).single()).data!;
    expect(pb).toEqual({ status: 'pending', papel_global: 'user', nome: 'bruno' });
  });

  it('usuário pendente não lê dados nem cria organização', async () => {
    const c = await clientDe(EMAIL.bruno);
    const r = await c.rpc('criar_organizacao', { p_nome: 'Não pode' });
    expect(r.error).not.toBeNull();
    const d = await c.from('datas_base').select('id');
    expect(d.data ?? []).toHaveLength(0);
  });

  it('anon lê só configurações públicas', async () => {
    await supabase.auth.signOut();
    const pub = await supabase.from('configuracoes').select('chave, valor').eq('publica', true);
    expect(Object.fromEntries((pub.data ?? []).map((r) => [r.chave, r.valor]))).toMatchObject({ cadastro_aberto: true, aprovacao_obrigatoria: true });
    const r = await supabase.from('configuracoes').select('chave').eq('chave', 'admin_emails');
    expect(r.data ?? []).toHaveLength(0);
  });

  it('admin lista pendentes e aprova (hooks do painel admin)', async () => {
    await entrar(EMAIL.admin);
    expect((await consultar(() => useConfiguracoesPublicas())).cadastro_aberto).toBe(true);
    const { linhas } = await consultar(() => useAdminUsuarios({ busca: '', status: 'pending', page: 1, pageSize: 50 }));
    const pendentes = linhas.map((l) => l.email);
    for (const n of ['ana', 'bruno', 'carla', 'vitor'] as const) expect(pendentes).toContain(EMAIL[n]);
    for (const n of ['ana', 'bruno', 'carla', 'vitor'] as const) await mutar(() => useDefinirStatusUsuario(), { userId: ID[n]!, status: 'active' });
    const est = await consultar(() => useAdminEstatisticas());
    expect(est.usuarios_total).toBeGreaterThanOrEqual(5);
    expect(est.organizacoes_total).toBeGreaterThanOrEqual(0);
    const aud = await consultar(() => useAuditoria({ de: null, ate: null, usuario: '', entidade: '', acao: 'aprovar_usuario', page: 1, pageSize: 20 }));
    expect(aud.linhas.length).toBeGreaterThanOrEqual(4);
  });
});

describe('2. organizações, convites e membros', () => {
  it('ana cria a organização A e vira owner; carla cria a B', async () => {
    await entrar(EMAIL.ana);
    const id = await mutar(() => useCriarOrganizacao(), { nome: 'Escritório A', cnpj: '11.222.333/0001-81' });
    orgA = await orgPorId(id as string);
    expect(orgA.cnpj).toBe('11222333000181');
    const perfil = await supabase.from('profiles').select('organizacao_ativa_id').eq('id', ID.ana!).single();
    expect(perfil.data?.organizacao_ativa_id).toBe(orgA.id);
    estado.org = orgA;
    estado.papel = 'owner';
    const salvo = await mutar(() => useSalvarOrganizacao(), { municipio: 'Niterói', uf: 'rj', responsavel_tecnico: 'Ana Engenheira' });
    expect(salvo.uf).toBe('RJ');

    await entrar(EMAIL.carla);
    orgB = await orgPorId((await mutar(() => useCriarOrganizacao(), { nome: 'Escritório B' })) as string);
  });

  it('ana convida bruno (editor) e vitor (viewer); eles aceitam', async () => {
    await entrar(EMAIL.ana, orgA, 'owner');
    await mutar(() => useConvidarMembro(), { email: EMAIL.bruno.toUpperCase(), papel: 'editor' });
    await mutar(() => useConvidarMembro(), { email: EMAIL.vitor, papel: 'viewer' });
    const convites = await consultar(() => useConvites());
    expect(convites.map((c) => c.email).sort()).toEqual([EMAIL.bruno, EMAIL.vitor].sort());

    for (const n of ['bruno', 'vitor'] as const) {
      await entrar(EMAIL[n]);
      const meus = await consultar(() => useMeusConvites());
      expect(meus).toHaveLength(1);
      expect(meus[0]).toMatchObject({ organizacao_nome: 'Escritório A', status: 'pending' });
      const org = await mutar(() => useAceitarConvite(), meus[0]!.token);
      expect(org).toBe(orgA.id);
    }
    await entrar(EMAIL.ana, orgA, 'owner');
    const membros = await consultar(() => useMembros(orgA.id));
    expect(membros.map((m) => [m.email, m.papel]).sort()).toEqual(
      [[EMAIL.ana, 'owner'], [EMAIL.bruno, 'editor'], [EMAIL.vitor, 'viewer']].sort(),
    );
    // owner não pode se rebaixar sendo o único owner
    await expect(mutar(() => useAlterarPapelMembro(), { userId: ID.ana!, papel: 'editor' })).rejects.toBeTruthy();
  });

  it('admin vê organizações com contagem de membros (embed organizacao_membros(count))', async () => {
    await entrar(EMAIL.admin);
    const orgs = await consultar(() => useAdminOrganizacoes());
    const a = orgs.find((o) => o.id === orgA.id)!;
    expect(a.membros[0]?.count).toBe(3);
  });
});

describe('3. clientes e obras', () => {
  it('bruno (editor) cadastra cliente e obra; listas e detalhes batem', async () => {
    await entrar(EMAIL.bruno, orgA, 'editor');
    const cli = await mutar(() => useSalvarCliente(), { tipo: 'PJ', nome: 'Construtora Alfa', documento: '11.444.777/0001-61', email: '', uf: 'rj' });
    expect(cli).toMatchObject({ documento: '11444777000161', email: null, uf: 'RJ', organizacao_id: orgA.id });
    ID.cliente = cli.id;
    const lista = await consultar(() => useClientes({ busca: 'alfa' }));
    expect(lista.total).toBe(1);
    expect((await consultar(() => useCliente(cli.id))).nome).toBe('Construtora Alfa');
    const opcoes = await consultar(() => useClientesOpcoes());
    expect(opcoes).toEqual([{ id: cli.id, nome: 'Construtora Alfa' }]);

    const obra = await mutar(() => useSalvarObra(), { nome: 'Residência Beta', cliente_id: cli.id, codigo: 'OB-1', municipio: 'Niterói', area_construida_m2: 180 });
    ID.obra = obra.id;
    const obras = await consultar(() => useObras());
    expect(obras[0]).toMatchObject({ id: obra.id, cliente: { id: cli.id, nome: 'Construtora Alfa' } });
    expect((await consultar(() => useObra(obra.id))).cliente?.nome).toBe('Construtora Alfa');
    expect((await consultar(() => useObrasDoCliente(cli.id))).map((o) => o.id)).toEqual([obra.id]);
  });

  it('viewer não escreve; outra organização não enxerga', async () => {
    const v = await clientDe(EMAIL.vitor);
    const r = await v.from('clientes').insert({ organizacao_id: orgA.id, nome: 'X', tipo: 'PF' }).select();
    expect(r.error?.code).toBe('42501');
    const c = await clientDe(EMAIL.carla);
    expect((await c.from('clientes').select('id').eq('id', ID.cliente!)).data).toEqual([]);
    const u = await c.from('obras').update({ nome: 'hack' }).eq('id', ID.obra!).select();
    expect(u.data ?? []).toEqual([]);
    const ins = await c.from('obras').insert({ organizacao_id: orgA.id, nome: 'intrusa' }).select();
    expect(ins.error).not.toBeNull();
  });
});

describe('4. orçamento', () => {
  beforeAll(async () => {
    await entrar(EMAIL.bruno, orgA, 'editor');
  });

  it('data-base demo disponível e criação do orçamento com BDI TCU', async () => {
    const dbs = await consultar(() => useDatasBase({ uf: 'RJ' }));
    dbDemo = dbs.find((d) => d.is_demo && d.regime === 'nao_desonerado')!;
    expect(dbDemo).toBeTruthy();
    const recente = await consultar(() => useDataBaseMaisRecente());
    expect(recente?.uf).toBe('RJ');
    const bdi = { ac: 4, s: 0.4, r: 1.27, g: 0.4, df: 1.23, l: 7.4, pis: 0.65, cofins: 3, iss: 5, cprb: 0 };
    orcId = (await mutar(() => useCriarOrcamento(), { obraId: ID.obra!, nome: 'Orçamento executivo', dataBaseId: dbDemo.id, bdi })) as string;
    const orc = await consultar(() => useOrcamento(orcId));
    expect(orc).toMatchObject({ obra: { id: ID.obra, nome: 'Residência Beta' }, data_base: { id: dbDemo.id, is_demo: true }, status: 'rascunho', versao: 1 });
    const bdis = await consultar(() => useBdis(orcId));
    expect(bdis).toHaveLength(1);
    near(bdis[0]!.bdi!, calcularBdi(bdi), 0.00005);
    expect((await consultar(() => useOrcamentos(ID.obra))).map((o) => o.id)).toEqual([orcId]);
  });

  it('EAP: etapas, subetapa e itens SINAPI/insumo/livre', async () => {
    // fn_orcamento_criar já cria a etapa "1 – Serviços preliminares" (§7.2)
    const iniciais = await consultar(() => useEtapas(orcId));
    expect(iniciais.map((e) => [e.codigo, e.nome])).toEqual([['1', 'Serviços preliminares']]);
    etapa1 = iniciais[0]!.id;
    etapa2 = (await mutar(() => useCriarEtapa(orcId), { nome: 'Alvenaria', parentId: null, ordem: 2 })).id;
    sub11 = (await mutar(() => useCriarEtapa(orcId), { nome: 'Canteiro', parentId: etapa1, ordem: 1 })).id;
    const etapas = await consultar(() => useEtapas(orcId));
    expect(Object.fromEntries(etapas.map((e) => [e.nome, e.codigo]))).toEqual({ 'Serviços preliminares': '1', Alvenaria: '2', Canteiro: '1.1' });

    const comps = await buscarReferencias('alvenaria', dbDemo.id, orgA.id, 'composicao');
    expect(comps.length).toBeGreaterThan(0);
    const insumos = await buscarReferencias('cimento', dbDemo.id, orgA.id, 'insumo');
    expect(insumos.length).toBeGreaterThan(0);
    const compPorCodigo = await buscarReferencias('88309', dbDemo.id, orgA.id, null);
    expect(compPorCodigo[0]?.codigo).toBe('88309');

    const i1 = await mutar(() => useAdicionarItem(orcId), { etapaId: etapa2, referenciaTipo: 'composicao', referenciaId: comps[0]!.id, quantidade: 120.5 });
    const i2 = await mutar(() => useAdicionarItem(orcId), { etapaId: sub11, referenciaTipo: 'insumo', referenciaId: insumos[0]!.id, quantidade: 10 });
    const i3 = await mutar(() => useAdicionarItem(orcId), { etapaId: sub11, referenciaTipo: 'livre', descricao: 'Placa de obra', unidade: 'm2', quantidade: 2, custoUnitario: 350.456 });
    const i4 = await mutar(() => useAdicionarItem(orcId), { etapaId: etapa2, referenciaTipo: 'composicao', referenciaId: compPorCodigo[0]!.id, quantidade: 40 });
    ID.i1 = i1.id; ID.i2 = i2.id; ID.i3 = i3.id; ID.i4 = i4.id;
    expect(i1).toMatchObject({ codigo: '2.1', fonte: 'SINAPI', referencia_codigo: comps[0]!.codigo });
    expect(i3).toMatchObject({ codigo: '1.1.2', fonte: 'PRÓPRIA', unidade: 'M2', custo_unitario: 350.46 });
    expect(i1.custo_unitario).toBeGreaterThan(0);
  });

  it('edição inline: trigger do banco = calcularItem() do front', async () => {
    const atualizado = await mutar(() => useAtualizarItem(orcId), { id: ID.i2!, patch: { quantidade: 12.345 } });
    const esperado = calcularItem({ quantidade: 12.345, custo_unitario: atualizado.custo_unitario, bdi_percentual: atualizado.bdi_percentual });
    expect({ ...atualizado }).toMatchObject(esperado);
    const manual = await mutar(() => useAtualizarItem(orcId), { id: ID.i4!, patch: { custo_unitario: 55.555, custo_manual: true } });
    expect(manual.custo_unitario).toBe(55.56);
  });

  it('memória de cálculo soma na quantidade', async () => {
    await mutar(() => useSalvarMemorias(orcId), {
      itemId: ID.i1!, usaMemoria: true,
      linhas: [{ descricao: 'Parede 1', expressao: '(4,5+3)*2,8', resultado: 21 }, { descricao: 'Parede 2', expressao: '10*2,8', resultado: 28 }],
    });
    const mem = await consultar(() => useMemorias(ID.i1));
    expect(mem.map((m) => m.ordem)).toEqual([1, 2]);
    const todas = await consultar(() => useMemoriasOrcamento(orcId));
    expect(todas).toHaveLength(2);
    const itens = await consultar(() => useItens(orcId));
    expect(itens.find((i) => i.id === ID.i1)!.quantidade).toBe(quantidadeDaMemoria([21, 28]));
  });

  it('BDI alterado + recálculo: totais do banco = totalizarOrcamento() do front', async () => {
    const [bdi] = await consultar(() => useBdis(orcId));
    const novo = { ac: 3, s: 0.8, r: 0.97, g: 0.59, df: 1.39, l: 6.16, pis: 0.65, cofins: 3, iss: 3, cprb: 4.5 };
    await mutar(() => useSalvarBdi(orcId), { id: bdi!.id, ...novo });
    const rec = await mutar(() => useRecalcularOrcamento(orcId), undefined);
    const bdis = await consultar(() => useBdis(orcId));
    near(bdis[0]!.bdi!, calcularBdi(novo), 0.00005);
    const etapas = await consultar(() => useEtapas(orcId));
    const itens = await consultar(() => useItens(orcId));
    for (const it of itens) {
      near(it.bdi_percentual, bdis[0]!.bdi!, 0.0001);
      expect(calcularItem(it)).toEqual({ custo_unitario: it.custo_unitario, preco_unitario: it.preco_unitario, total_sem_bdi: it.total_sem_bdi, total: it.total });
    }
    const t = totalizarOrcamento(etapas, itens);
    expect(rec.total).toBe(t.total);
    expect(rec.total_sem_bdi).toBe(t.total_sem_bdi);
    for (const e of etapas) expect(e.total).toBe(t.etapas.get(e.id)!.total);
    const resumo = await consultar(() => useResumoOrcamento(orcId));
    expect(resumo.length).toBe(etapas.length); // sintético: só etapas
    near(resumo.reduce((x, r) => x + (r.parent_id ? 0 : Number(r.percentual)), 0), 100, 0.02);
  });

  it('BDI diferenciado por item (insert pelo hook + bdi_id)', async () => {
    await mutar(() => useSalvarBdi(orcId), { nome: 'Fornecimento', ac: 1.5, s: 0.3, r: 0.56, g: 0.45, df: 0.85, l: 3.5, pis: 0.65, cofins: 3, iss: 5, cprb: 0 });
    const bdis = await consultar(() => useBdis(orcId));
    const forn = bdis.find((b) => b.nome === 'Fornecimento')!;
    const it = await mutar(() => useAtualizarItem(orcId), { id: ID.i2!, patch: { bdi_id: forn.id } });
    near(it.bdi_percentual, forn.bdi!, 0.0001);
  });

  it('cotação própria de insumo substitui o preço SINAPI no recálculo', async () => {
    const itens = await consultar(() => useItens(orcId));
    const i2 = itens.find((i) => i.id === ID.i2)!;
    await mutar(() => useSalvarCotacao(orcId), { insumoId: i2.insumo_id!, preco: 99.99, fonte: 'Cotação loja X' });
    await mutar(() => useSalvarCotacao(orcId), { insumoId: i2.insumo_id!, preco: 77.77, fonte: 'Cotação loja Y' }); // upsert
    const cot = await consultar(() => useCotacoes(orcId));
    expect(cot).toHaveLength(1);
    expect(cot[0]).toMatchObject({ preco: 77.77, insumo: { id: i2.insumo_id } });
    const depois = (await consultar(() => useItens(orcId))).find((i) => i.id === ID.i2)!;
    expect(depois.custo_unitario).toBe(77.77);
    await mutar(() => useExcluirCotacao(orcId), i2.insumo_id!);
    expect((await consultar(() => useItens(orcId))).find((i) => i.id === ID.i2)!.custo_unitario).toBe(i2.custo_unitario);
  });

  it('composição analítica e itens da composição (embeds com dica de FK)', async () => {
    const itens = await consultar(() => useItens(orcId));
    const comp = itens.find((i) => i.id === ID.i1)!.composicao_id!;
    const an = await consultar(() => useComposicaoAnalitica(comp, dbDemo.id, orcId));
    expect(an.length).toBeGreaterThan(0);
    const ci = await consultar(() => useComposicaoItens(comp));
    expect(ci.length).toBeGreaterThan(0);
    expect(ci.every((x) => (x.tipo_item === 'insumo' ? x.insumo?.codigo : x.subcomposicao?.codigo))).toBe(true);
  });

  it('mover item entre etapas (fn_orcamento_mover 1-based) e renumeração', async () => {
    await mutar(() => useMoverEap(orcId), { tipo: 'item', id: ID.i3!, novoPaiId: etapa2, novaOrdem: 1 });
    const itens = await consultar(() => useItens(orcId));
    const map = Object.fromEntries(itens.map((i) => [i.id, i.codigo]));
    expect(map[ID.i3!]).toBe('2.1');
    expect(map[ID.i1!]).toBe('2.2');
  });

  it('curva ABC de serviços e insumos', async () => {
    const s = await consultar(() => useCurvaAbcServicos(orcId));
    expect(s.length).toBe(4);
    near(s.at(-1)!.percentual_acumulado, 100, 0.01);
    expect(s[0]!.classe).toBe('A');
    const ins = await consultar(() => useCurvaAbcInsumos(orcId));
    expect(ins.length).toBeGreaterThan(1);
    near(ins.at(-1)!.percentual_acumulado, 100, 0.01);
  });

  it('cronograma físico-financeiro', async () => {
    await mutar(() => useSalvarCronograma(orcId), {
      dataInicio: '2026-12-01', periodicidade: 'mensal', numPeriodos: 3,
      distribuicoes: [
        { etapa_id: etapa1, periodo: 1, percentual: 100 },
        { etapa_id: etapa2, periodo: 2, percentual: 60 },
        { etapa_id: etapa2, periodo: 3, percentual: 40 },
      ],
    });
    const c = await consultar(() => useCronograma(orcId));
    expect(c.cronograma).toMatchObject({ num_periodos: 3, periodicidade: 'mensal' });
    expect(c.distribuicoes).toHaveLength(3);
    const ff = await consultar(() => useCronogramaFisicoFinanceiro(orcId));
    expect(ff.length).toBeGreaterThan(0);
    const orc = await consultar(() => useOrcamento(orcId));
    const soma = ff.filter((l) => l.etapa_id === etapa1 || l.etapa_id === etapa2).reduce((s, l) => s + Number(l.valor ?? 0), 0);
    near(soma, orc.total, 0.05);
  });

  it('medição: criar, medir itens (upsert), resumo e fechar', async () => {
    // medição exige orçamento em revisão ou aprovado
    await expect(mutar(() => useCriarMedicao(orcId), { inicio: '2026-12-01', fim: '2026-12-31' })).rejects.toMatchObject({ message: expect.stringMatching(/aprovado ou em revis/) });
    await mutar(() => useAlterarStatusOrcamento(orcId), 'em_revisao');
    const medId = (await mutar(() => useCriarMedicao(orcId), { inicio: '2026-12-01', fim: '2026-12-31' })) as string;
    await mutar(() => useSalvarMedicaoItem(medId, orcId), { itemId: ID.i1!, quantidade: 10 });
    await mutar(() => useSalvarMedicaoItem(medId, orcId), { itemId: ID.i1!, quantidade: 20 });
    await mutar(() => useSalvarMedicaoItem(medId, orcId), { itemId: ID.i3!, quantidade: 1 });
    await mutar(() => useSalvarMedicaoItem(medId, orcId), { itemId: ID.i3!, quantidade: 0 }); // remove
    const resumo = await consultar(() => useMedicaoResumo(medId));
    const l1 = resumo.find((r) => r.item_id === ID.i1)!;
    expect(l1.quantidade_atual).toBe(20);
    const item = (await consultar(() => useItens(orcId))).find((i) => i.id === ID.i1)!;
    expect(l1.valor_atual).toBe(Math.round(20 * item.preco_unitario * 100) / 100);
    expect(resumo.find((r) => r.item_id === ID.i3)?.quantidade_atual ?? 0).toBe(0);
    await mutar(() => useAtualizarMedicao(medId, orcId), { status: 'fechada' });
    const meds = await consultar(() => useMedicoes(orcId));
    expect(meds[0]).toMatchObject({ numero: 1, status: 'fechada', total: l1.valor_atual });
    // fechada ⇒ itens somente leitura
    await expect(mutar(() => useSalvarMedicaoItem(medId, orcId), { itemId: ID.i1!, quantidade: 5 })).rejects.toBeTruthy();
  });

  it('mão de obra: equipe, membros, resumo e horas', async () => {
    await mutar(() => useSalvarEquipe(orcId), { nome: 'Equipe alvenaria', ordem: 1 });
    const eqs = await consultar(() => useEquipes(orcId));
    expect(eqs).toHaveLength(1);
    await mutar(() => useSalvarMembro(orcId), { equipe_id: eqs[0]!.id, funcao: 'Pedreiro', salario_hora: 20, aplicar_encargos: true, quantidade: 2, horas_dia: 8, dias: 20, ordem: 1 });
    await mutar(() => useSalvarMembro(orcId), { equipe_id: eqs[0]!.id, funcao: 'Servente', salario_hora: 14, aplicar_encargos: false, quantidade: 1, horas_dia: 8, dias: 20, ordem: 2 });
    const com = await consultar(() => useEquipes(orcId));
    expect(com[0]!.membros.map((m) => m.funcao)).toEqual(['Pedreiro', 'Servente']);
    const resumo = await consultar(() => useMaoObraResumo(orcId));
    expect(resumo.length).toBeGreaterThan(0);
    const horas = await consultar(() => useMaoObraHoras(orcId));
    expect(horas.length).toBeGreaterThan(0);
    const orc = await consultar(() => useOrcamento(orcId));
    if (orc.encargos_sociais_id) expect((await consultar(() => useEncargosDoOrcamento(orc.encargos_sociais_id))).id).toBe(orc.encargos_sociais_id);
  });

  it('honorários de projeto', async () => {
    const hid = (await mutar(() => useCriarHonorario(), { obra_id: ID.obra!, nome: 'Projetos legais', area_m2: 180 })) as string;
    const disc = [
      { disciplina: 'arquitetonico' as const, metodo: 'area' as const, valor_m2: 45.5 },
      { disciplina: 'estrutural' as const, metodo: 'fixo' as const, valor_fixo: 3200 },
      { disciplina: 'orcamento' as const, metodo: 'horas' as const, horas: 12.5, valor_hora: 150 },
    ];
    const r = await mutar(() => useSalvarHonorario(hid), { cabecalho: { desconto_percentual: 5, impostos_percentual: 11.33 }, disciplinas: disc, removidas: [] });
    const valores = disc.map((d) => valorDisciplina(d as never, 180, null));
    const t = totalHonorarios(valores, 5, 11.33);
    const h = await consultar(() => useHonorario(hid));
    expect(h.disciplinas.map((d) => d.valor)).toEqual(valores);
    expect(h.honorario.total).toBe(t.total);
    expect(h.honorario.obra?.nome).toBe('Residência Beta');
    void r;
    expect((await consultar(() => useHonorarios(ID.obra))).map((x) => x.id)).toContain(hid);
  });

  it('duplicar versão copia EAP, itens, BDIs e memórias', async () => {
    const novo = (await mutar(() => useDuplicarOrcamento(), { id: orcId, novaVersao: true })) as string;
    const [a, b] = await Promise.all([consultar(() => useOrcamento(orcId)), consultar(() => useOrcamento(novo))]);
    expect(b).toMatchObject({ versao: a.versao + 1, status: 'rascunho', nome: a.nome, total: a.total });
    const [ia, ib] = await Promise.all([consultar(() => useItens(orcId)), consultar(() => useItens(novo))]);
    const chave = (xs: OrcamentoItem[]) => xs.map((i) => [i.codigo, i.total, i.quantidade]).sort((x, y) => String(x[0]).localeCompare(String(y[0])));
    expect(chave(ib)).toEqual(chave(ia));
    expect((await consultar(() => useMemoriasOrcamento(novo))).length).toBe(2);
    ID.orcV2 = novo;
  });

  it('trocar data-base (desonerado) recalcula; aprovado fica somente leitura', async () => {
    const dbs = await consultar(() => useDatasBase({ uf: 'RJ' }));
    const des = dbs.find((d) => d.is_demo && d.regime === 'desonerado')!;
    const r = await mutar(() => useTrocarDataBase(ID.orcV2!), des.id);
    expect(r.data_base_id).toBe(des.id);
    await mutar(() => useAlterarStatusOrcamento(ID.orcV2!), 'aprovado');
    const itens = await consultar(() => useItens(ID.orcV2));
    await expect(mutar(() => useAtualizarItem(ID.orcV2!), { id: itens[0]!.id, patch: { quantidade: 1 } })).rejects.toBeTruthy();
    // exclusão de item em orçamento aprovado: bloqueada (erro ou nenhuma linha afetada)
    await mutar(() => useExcluirItens(ID.orcV2!), [itens[0]!.id]).catch(() => undefined);
    const ainda = await consultar(() => useItens(ID.orcV2));
    expect(ainda.length).toBe(itens.length);
  });

  it('dashboard da organização', async () => {
    const d = await consultar(() => useDashboard());
    expect(d.orcamentos_total).toBe(2);
    expect(d.ultimos_orcamentos.length).toBe(2);
    expect(d.obras_por_status.planejamento).toBe(1);
    expect(d.medido_total).toBeGreaterThan(0);
  });
});

describe('5. referências próprias', () => {
  it('insumo próprio e composição própria (RPC atômica fn_composicao_propria_salvar)', async () => {
    await entrar(EMAIL.bruno, orgA, 'editor');
    const ins = (await mutar(() => useSalvarInsumoProprio(), { codigo: 'P-001', descricao: 'Tijolo ecológico', unidade: 'un', tipo: 'material', classificacao: null, preco_proprio: 1.85, preco_proprio_data: null, ativo: true })) as Insumo;
    expect(ins).toMatchObject({ fonte: 'propria', organizacao_id: orgA.id, unidade: 'UN' });
    expect((await consultar(() => useInsumosProprios())).map((i) => i.codigo)).toEqual(['P-001']);
    const pedreiro = (await buscarReferencias('88309', dbDemo.id, orgA.id, 'composicao'))[0]!;
    const id = await mutar(() => useSalvarComposicaoPropria(), {
      codigo: 'CP-01', descricao: 'Alvenaria ecológica', unidade: 'm2', grupo: 'ALVENARIA', observacao: null,
      itens: [{ tipo_item: 'insumo', referencia_id: ins.id, coeficiente: 50 }, { tipo_item: 'composicao', referencia_id: pedreiro.id, coeficiente: 0.8 }],
    });
    let itens = await consultar(() => useComposicaoItens(id));
    expect(itens.map((i) => [i.ordem, i.tipo_item, Number(i.coeficiente)])).toEqual([[1, 'insumo', 50], [2, 'composicao', 0.8]]);
    // edição: troca os itens; item inválido (coeficiente negativo) aborta TUDO (atômico)
    await expect(
      mutar(() => useSalvarComposicaoPropria(), {
        id, codigo: 'CP-01', descricao: 'NÃO DEVE SALVAR', unidade: 'M2', grupo: null, observacao: null,
        itens: [{ tipo_item: 'insumo', referencia_id: ins.id, coeficiente: -1 }],
      }),
    ).rejects.toBeTruthy();
    const comps = await consultar(() => useComposicoesProprias());
    expect(comps.find((c) => c.id === id)!.descricao).toBe('Alvenaria ecológica');
    expect((await consultar(() => useComposicaoItens(id))).length).toBe(2);
    await mutar(() => useSalvarComposicaoPropria(), {
      id, codigo: 'CP-01', descricao: 'Alvenaria ecológica v2', unidade: 'M2', grupo: null, observacao: 'ok',
      itens: [{ tipo_item: 'insumo', referencia_id: ins.id, coeficiente: 55 }],
    });
    itens = await consultar(() => useComposicaoItens(id));
    expect(itens.map((i) => Number(i.coeficiente))).toEqual([55]);
    const busca = await buscarReferencias('ecologica', dbDemo.id, orgA.id, 'composicao');
    expect(busca.find((b) => b.id === id)?.preco).toBeCloseTo(55 * 1.85, 2);
    // outra organização não vê nem usa
    const c = await clientDe(EMAIL.carla);
    expect((await c.from('composicoes').select('id').eq('id', id)).data).toEqual([]);
    const r = await c.rpc('fn_composicao_propria_salvar', { p_id: id, p_cabecalho: { codigo: 'X', descricao: 'X', unidade: 'UN' }, p_itens: [] });
    expect(r.error).not.toBeNull();
  });

  it('encargos sociais: duplicar tabela global para a organização', async () => {
    const lista = await consultar(() => useEncargos());
    expect(lista.length).toBeGreaterThanOrEqual(2);
    const novo = (await mutar(() => useDuplicarEncargos(), { encargosId: lista[0]!.id, nome: 'Encargos do escritório' })) as string;
    const det = await consultar(() => useEncargosDetalhe(novo));
    expect(det.encargos.organizacao_id).toBe(orgA.id);
    expect(det.itens.length).toBeGreaterThan(0);
  });
});

describe('6. importação SINAPI (planilha gerada → parser do front → RPCs em lotes)', () => {
  const N = 2300; // > 2 lotes de SINAPI_LOTE_MAX (1000)
  it('insumos: 3 lotes, linha inválida vira erro, publica a data-base', async () => {
    await entrar(EMAIL.admin);
    const aoa: (string | number | null)[][] = [
      ['SINAPI - PREÇOS DE INSUMOS'], ['LOCALIDADE: RIO DE JANEIRO'], ['DATA DE PREÇO: 10/2026'], [],
      ['CODIGO', 'DESCRICAO DO INSUMO', 'UNIDADE', 'ORIGEM DE PRECO', 'PRECO MEDIANO R$'],
    ];
    for (let i = 0; i < N; i++) aoa.push([String(900000 + i).padStart(8, '0'), `INSUMO TESTE ${i} ARGAMASSA`, i % 2 ? 'KG' : 'm3', 'C', `${(i % 97) + 1},${String(i % 100).padStart(2, '0')}`]);
    aoa.push(['999999', 'SEM PRECO', 'UN', 'C', null]);
    aoa.push(['4750', 'PEDREIRO', 'H', 'C', '25,10']); // código do seed demo ⇒ vira oficial
    // ida e volta por XLSX real (SheetJS) como no navegador
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SINAPI_Insumos');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const lido = XLSX.read(buf, { type: 'array', dense: true });
    const linhas = XLSX.utils.sheet_to_json(lido.Sheets['SINAPI_Insumos']!, { header: 1, raw: true, defval: null, blankrows: true }) as Matriz;
    const cab = detectarLinhaCabecalho(linhas);
    const tipo = detectarTipo(linhas[cab]!, 'SINAPI_Insumos');
    expect(tipo).toBe('insumos');
    const res = extrairSinapi(tipo, linhas, cab, sugerirMapeamento(linhas[cab]!, tipo));
    expect(res.linhas.length).toBe(N + 1);
    expect(res.erros).toHaveLength(1);

    const progresso: number[] = [];
    const fim = await executarImportacao(
      { uf: 'RJ', ano: 2026, mes: 10, regime: 'nao_desonerado', arquivoNome: 'SINAPI_Insumos_RJ_202610.xlsx', resultado: res, publicar: true },
      (p) => progresso.push(p.enviados),
    );
    expect(fim.status).toBe('concluida');
    expect(fim.linhas_ok).toBe(N + 1);
    expect(progresso.filter((x, i, a) => a.indexOf(x) === i)).toEqual([0, 1000, 2000, N + 1]);
    const dbs = await consultar(() => useDatasBaseAdmin());
    const nova = dbs.find((d) => d.ano === 2026 && d.mes === 10 && !d.is_demo)!;
    expect(nova.status).toBe('publicada');
    ID.dbOficial = nova.id;
    const imps = await consultar(() => useImportacoes());
    expect(imps[0]).toMatchObject({ status: 'concluida', data_base: { ano: 2026, mes: 10 } });
    const p = await supabase.from('insumos').select('is_demo').eq('codigo', '4750').is('organizacao_id', null).single();
    expect(p.data?.is_demo).toBe(false);
  });

  it('composições sintéticas + analítico com cabeçalhos', async () => {
    const sint: Matriz = [
      ['DESCRICAO DA CLASSE', 'CODIGO DA COMPOSICAO', 'DESCRICAO DA COMPOSICAO', 'UNIDADE', 'CUSTO TOTAL'],
      ['TESTE', '990001', 'COMPOSICAO TESTE IMPORTADA', 'M2', '12,34'],
    ];
    const r1 = extrairSinapi('composicoes', sint, 0, sugerirMapeamento(sint[0]!, 'composicoes'));
    const f1 = await executarImportacao({ uf: 'RJ', ano: 2026, mes: 10, regime: 'nao_desonerado', arquivoNome: 'sint.xlsx', resultado: r1, publicar: true }, () => {});
    expect(f1.status).toBe('concluida');
    const ana: Matriz = [
      ['CODIGO DA COMPOSICAO', 'DESCRICAO DA COMPOSICAO', 'UNIDADE', 'TIPO ITEM', 'CODIGO ITEM', 'DESCRIÇÃO ITEM', 'UNIDADE ITEM', 'COEFICIENTE', 'CUSTO TOTAL'],
      ['990001', 'COMPOSICAO TESTE IMPORTADA', 'M2', null, null, null, null, null, '12,34'],
      ['990001', 'COMPOSICAO TESTE IMPORTADA', 'M2', 'INSUMO', '00900001', 'INSUMO TESTE 1', 'KG', '2,5', null],
      ['990001', 'COMPOSICAO TESTE IMPORTADA', 'M2', 'INSUMO', '00900002', 'INSUMO TESTE 2', 'M3', '0,1', null],
    ];
    const r2 = extrairSinapi('analitico', ana, 0, sugerirMapeamento(ana[0]!, 'analitico'));
    const f2 = await executarImportacao({ uf: 'RJ', ano: 2026, mes: 10, regime: 'nao_desonerado', arquivoNome: 'ana.xlsx', resultado: r2, publicar: true, incluirCabecalhos: true }, () => {});
    expect(f2.status).toBe('concluida');
    // editor usa a nova data-base oficial
    await entrar(EMAIL.bruno, orgA, 'editor');
    const ref = await buscarReferencias('990001', ID.dbOficial!, orgA.id, 'composicao');
    expect(ref[0]).toMatchObject({ codigo: '990001', is_demo: false, preco: 12.34 });
    const an = await consultar(() => useComposicaoAnalitica(ref[0]!.id, ID.dbOficial!, null));
    expect(an.length).toBe(2);
  });

  it('não-admin não importa', async () => {
    const r = await supabase.rpc('fn_sinapi_iniciar_importacao', { p_uf: 'RJ', p_ano: 2026, p_mes: 11, p_regime: 'desonerado', p_tipo: 'insumos' });
    expect(r.error?.code).toBe('42501');
  });
});

describe('7. RLS entre organizações (via PostgREST)', () => {
  it('carla (org B) não vê nem altera nada da org A', async () => {
    const c = await clientDe(EMAIL.carla);
    for (const t of ['orcamentos', 'orcamento_itens', 'orcamento_etapas', 'orcamento_bdis', 'medicoes', 'honorarios', 'cronogramas', 'orcamento_equipes', 'clientes', 'obras', 'convites', 'orcamento_item_memorias'] as const) {
      const r = await c.from(t).select('*').eq('organizacao_id', orgA.id);
      expect(r.error, t).toBeNull();
      expect(r.data, t).toEqual([]);
    }
    for (const rpc of ['fn_orcamento_recalcular', 'fn_curva_abc_servicos', 'fn_orcamento_resumo', 'fn_cronograma_fisico_financeiro'] as const) {
      const r = await c.rpc(rpc, { p_orcamento_id: orcId });
      const vazio = r.error != null || (Array.isArray(r.data) && r.data.length === 0);
      expect(vazio, rpc).toBe(true);
    }
    const d = await c.rpc('fn_orcamento_duplicar', { p_orcamento_id: orcId });
    expect(d.error).not.toBeNull();
    const del = await c.from('orcamentos').delete().eq('id', orcId).select();
    expect(del.data ?? []).toEqual([]);
    const m = await c.rpc('listar_membros', { p_organizacao_id: orgA.id });
    expect(m.error != null || (m.data ?? []).length === 0).toBe(true);
    const dash = await c.rpc('fn_dashboard_resumo', { p_organizacao_id: orgA.id });
    expect(dash.error).not.toBeNull();
    void orgB;
  });

  it('viewer (vitor) lê o orçamento da org A mas não altera', async () => {
    const v = await clientDe(EMAIL.vitor);
    expect((await v.from('orcamentos').select('id').eq('id', orcId)).data).toHaveLength(1);
    const u = await v.from('orcamento_itens').update({ quantidade: 999 }).eq('id', ID.i1!).select();
    expect(u.data ?? []).toEqual([]);
    const r = await v.rpc('fn_orcamento_recalcular', { p_orcamento_id: orcId });
    expect(r.error).not.toBeNull();
    const add = await v.rpc('fn_orcamento_adicionar_item', { p_etapa_id: etapa1, p_referencia_tipo: 'livre', p_descricao: 'x', p_quantidade: 1 });
    expect(add.error).not.toBeNull();
  });
});

describe('9. replay de TODOS os selects extraídos de src/** contra o PostgREST real', () => {
  it('nenhum select/embed/filtro estático é rejeitado (PGRST100/200/201, 42703…)', async () => {
    await entrar(EMAIL.ana, orgA, 'owner');
    const { extrair } = await import('../../../scripts/contrato/extrair.mjs');
    const chamadas = extrair({ comChecker: false }).filter((c): c is ChamadaFrom => c.tipo === 'from' && c.select.length > 0);
    expect(chamadas.length).toBeGreaterThan(40);
    const falhas: string[] = [];
    for (const c of chamadas) {
      for (const s of c.select) {
        if (s === '<dinâmico>') continue;
        // aplica também os filtros/ordenações com colunas estáticas (valores neutros)
        let q = supabase.from(c.tabela as never).select(s);
        for (const f of c.filtros) {
          if (!f.coluna) continue;
          if (f.metodo === 'order') q = q.order(f.coluna as never);
          else if (f.metodo === 'eq' && /(^|_)id$/.test(f.coluna)) q = q.eq(f.coluna as never, '00000000-0000-0000-0000-000000000000' as never);
        }
        const r = await q.limit(1);
        if (r.error) falhas.push(`${c.arquivo}:${c.linha} ${c.tabela} select(${s}) → ${r.error.code} ${r.error.message}`);
      }
    }
    expect(falhas).toEqual([]);
  });

  it('itens do orçamento retornam numéricos como number (não string)', async () => {
    const r = await supabase.from('orcamento_itens').select('*').eq('orcamento_id', orcId).limit(1).single();
    const it = r.data as OrcamentoItem;
    for (const k of ['quantidade', 'custo_unitario', 'preco_unitario', 'total', 'bdi_percentual'] as const) expect(typeof it[k], k).toBe('number');
  });
});
