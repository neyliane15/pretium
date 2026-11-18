/** Editor da planilha analítica: EAP, totais (calc.ts) e edição inline com atualização otimista. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { calcularItem, totalizarOrcamento } from '@/lib/calc';
import { formatMoeda } from '@/lib/format';
import type { OrcamentoBdi, OrcamentoEtapa, OrcamentoItem } from '@/types/database';
import { mutacao, renderizar } from '@/test/utils';
import OrcamentoAnaliticoPage from './OrcamentoAnaliticoPage';

const h = vi.hoisted(() => ({ etapas: [] as unknown[], itens: [] as unknown[], atualizar: null as unknown, criarEtapa: null as unknown }));

vi.mock('@/api/orcamento/orcamentos', async (orig) => {
  const { stubHooks: stub, consulta: q } = await import('@/test/utils');
  return stub(await orig<Record<string, unknown>>(), {
    useEtapas: () => q(h.etapas),
    useItens: () => q(h.itens),
    useAtualizarItem: () => h.atualizar,
    useCriarEtapa: () => h.criarEtapa,
  });
});
vi.mock('@/api/orcamento/referencias', async (orig) => (await import('@/test/utils')).stubHooks(await orig<Record<string, unknown>>()));
vi.mock('@/api/orcamento/analises', async (orig) => (await import('@/test/utils')).stubHooks(await orig<Record<string, unknown>>()));

const BDI = 25;
const etapa = (id: string, codigo: string, ordem: number, nome: string, parent_id: string | null = null) =>
  ({ id, codigo, ordem, nome, parent_id, orcamento_id: 'o1', organizacao_id: 'g', total: 0, total_sem_bdi: 0 }) as unknown as OrcamentoEtapa;
const item = (id: string, etapa_id: string, ordem: number, codigo: string, descricao: string, quantidade: number, custo: number, extra: Partial<OrcamentoItem> = {}) =>
  ({
    id, etapa_id, ordem, codigo, descricao, quantidade, unidade: 'M2', referencia_tipo: 'composicao', referencia_codigo: '8' + ordem, fonte: 'SINAPI',
    custo_manual: false, usa_memoria: false, sem_preco: false, bdi_id: null, composicao_id: 'c', insumo_id: null, orcamento_id: 'o1',
    ...calcularItem({ quantidade, custo_unitario: custo, bdi_percentual: BDI }), bdi_percentual: BDI, ...extra,
  }) as unknown as OrcamentoItem;

function contexto(editavel = true) {
  const bdi = { id: 'b1', nome: 'BDI Serviços', is_padrao: true, bdi: BDI } as unknown as OrcamentoBdi;
  return {
    orcamento: { id: 'o1', data_base_id: 'db1', status: editavel ? 'rascunho' : 'aprovado' },
    dataBase: null,
    bdis: [bdi],
    bdiPadrao: bdi,
    editavel,
    podeEditar: true,
    agendarRecalculo: vi.fn(),
    recalculando: false,
  };
}

beforeEach(() => {
  h.etapas = [etapa('e1', '1', 1, 'Serviços preliminares'), etapa('e2', '2', 2, 'Alvenaria'), etapa('e21', '2.1', 1, 'Vedação', 'e2')];
  h.itens = [
    item('i1', 'e1', 1, '1.1', 'Placa de obra', 2, 350.456),
    item('i2', 'e1', 2, '1.2', 'Tapume', 30.5, 87.33),
    item('i3', 'e21', 1, '2.1.1', 'Alvenaria de bloco cerâmico', 120.25, 74.55),
  ];
  h.atualizar = mutacao(async (v) => v);
  h.criarEtapa = mutacao(async () => ({ id: 'nova' }));
});

describe('OrcamentoAnaliticoPage (planilha)', () => {
  it('monta a EAP numerada e os totais iguais a totalizarOrcamento()', () => {
    renderizar(<OrcamentoAnaliticoPage />, { contexto: contexto() });
    const tabela = screen.getByRole('table', { name: 'Planilha orçamentária' });
    for (const t of ['Serviços preliminares', 'Alvenaria', 'Vedação', 'Placa de obra', 'Tapume', 'Alvenaria de bloco cerâmico']) {
      expect(within(tabela).getByText(t)).toBeInTheDocument();
    }
    const codigos = [...tabela.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td:nth-child(2)')?.textContent?.trim());
    expect(codigos).toEqual(['1', '1.1', '1.2', '2', '2.1', '2.1.1']);
    const t = totalizarOrcamento(h.etapas as OrcamentoEtapa[], h.itens as OrcamentoItem[]);
    const rodape = tabela.querySelector('tfoot')!;
    expect(rodape).toHaveTextContent(formatMoeda(t.total_sem_bdi));
    expect(rodape).toHaveTextContent(formatMoeda(t.total));
    expect(rodape).toHaveTextContent(formatMoeda(t.total_bdi));
    // total da etapa-pai inclui a subetapa
    expect(tabela).toHaveTextContent(formatMoeda(t.etapas.get('e2')!.total));
  });

  it('edição inline da quantidade: "2,5" + Enter grava com valores otimistas do calc.ts e agenda o recálculo', async () => {
    const ctx = contexto();
    renderizar(<OrcamentoAnaliticoPage />, { contexto: ctx });
    const campo = screen.getByLabelText('Quantidade do item 1.2');
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: '2,5' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    const atualizar = h.atualizar as ReturnType<typeof mutacao>;
    expect(atualizar.mutate).toHaveBeenCalledOnce();
    const [arg] = atualizar.mutate.mock.calls[0]!;
    expect(arg).toEqual({
      id: 'i2',
      patch: { quantidade: 2.5 },
      otimista: { ...calcularItem({ quantidade: 2.5, custo_unitario: 87.33, bdi_percentual: BDI }), bdi_percentual: BDI },
    });
    await waitFor(() => expect(ctx.agendarRecalculo).toHaveBeenCalledOnce());
  });

  it('Esc desfaz a edição sem gravar; valor igual não grava', () => {
    renderizar(<OrcamentoAnaliticoPage />, { contexto: contexto() });
    const campo = screen.getByLabelText('Quantidade do item 1.1') as HTMLInputElement;
    const original = campo.value;
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: '999' } });
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(campo.value).toBe(original);
    fireEvent.focus(campo);
    fireEvent.blur(campo);
    expect((h.atualizar as ReturnType<typeof mutacao>).mutate).not.toHaveBeenCalled();
  });

  it('custo unitário editável só em item livre ou com custo manual', () => {
    h.itens = [...(h.itens as OrcamentoItem[]), item('i4', 'e1', 3, '1.3', 'Item livre', 1, 10, { referencia_tipo: 'livre', fonte: 'PRÓPRIA', composicao_id: null })];
    renderizar(<OrcamentoAnaliticoPage />, { contexto: contexto() });
    expect(screen.queryByLabelText('Custo unitário do item 1.1')).toBeNull();
    const custo = screen.getByLabelText('Custo unitário do item 1.3');
    fireEvent.focus(custo);
    fireEvent.change(custo, { target: { value: '12,345' } });
    fireEvent.blur(custo);
    const [arg] = (h.atualizar as ReturnType<typeof mutacao>).mutate.mock.calls[0]!;
    expect(arg).toMatchObject({ id: 'i4', patch: { custo_unitario: 12.345 } });
  });

  it('filtro por descrição/código mantém só os itens que casam (sem acento)', () => {
    renderizar(<OrcamentoAnaliticoPage />, { contexto: contexto() });
    fireEvent.change(screen.getByLabelText('Filtrar itens'), { target: { value: 'ceramico' } });
    expect(screen.getByText('Alvenaria de bloco cerâmico')).toBeInTheDocument();
    expect(screen.queryByText('Placa de obra')).toBeNull();
  });

  it('orçamento não editável (aprovado): sem campos de edição nem barra de adicionar', () => {
    renderizar(<OrcamentoAnaliticoPage />, { contexto: contexto(false) });
    expect(screen.queryByLabelText(/Quantidade do item/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Etapa' })).toBeNull();
    expect(screen.queryByLabelText('Selecionar todos')).toBeNull();
  });

  it('nova etapa pelo modal chama useCriarEtapa com a próxima ordem', async () => {
    renderizar(<OrcamentoAnaliticoPage />, { contexto: contexto() });
    fireEvent.click(screen.getByRole('button', { name: 'Etapa' }));
    const dialogo = await screen.findByRole('dialog');
    const nome = within(dialogo).getByRole('textbox');
    fireEvent.change(nome, { target: { value: 'Cobertura' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: /criar|salvar|adicionar/i }));
    const criar = h.criarEtapa as ReturnType<typeof mutacao>;
    await waitFor(() => expect(criar.mutateAsync).toHaveBeenCalledWith({ nome: 'Cobertura', parentId: null, ordem: 3 }));
  });
});
