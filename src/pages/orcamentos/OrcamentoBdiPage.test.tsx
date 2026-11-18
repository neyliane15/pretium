/** Tela de BDI: fórmula TCU ao vivo (calc.ts), presets, validação de tributos e gravação. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { presetTcu } from '@/components/orcamento/bdiPresets';
import { calcularBdi, type BdiParametros } from '@/lib/calc';
import { formatNumero } from '@/lib/format';
import type { OrcamentoBdi } from '@/types/database';
import { mutacao, renderizar } from '@/test/utils';
import OrcamentoBdiPage from './OrcamentoBdiPage';

const h = vi.hoisted(() => ({ salvar: null as unknown }));
vi.mock('@/api/orcamento/orcamentos', async (orig) => {
  const { stubHooks, consulta } = await import('@/test/utils');
  return stubHooks(await orig<Record<string, unknown>>(), { useItens: () => consulta([]), useSalvarBdi: () => h.salvar });
});

const base: BdiParametros = { ...presetTcu('edificacoes', 'medio'), iss: 3 };
const bdiRow = (p: BdiParametros, extra: Partial<OrcamentoBdi> = {}) =>
  ({ id: 'b1', nome: 'BDI Serviços', is_padrao: true, orcamento_id: 'o1', ...p, bdi: calcularBdi(p), ...extra }) as unknown as OrcamentoBdi;
const ctx = (bdis: OrcamentoBdi[], editavel = true) => ({
  orcamento: { id: 'o1', data_base_id: 'db', data_base: { regime: 'nao_desonerado' } },
  bdis, bdiPadrao: bdis[0], editavel, podeEditar: true, dataBase: null, agendarRecalculo: vi.fn(), recalculando: false,
});
const campo = (rotulo: RegExp) => screen.getByLabelText(rotulo) as HTMLInputElement;
const digitar = (el: HTMLInputElement, v: string) => {
  fireEvent.focus(el);
  fireEvent.change(el, { target: { value: v } });
  fireEvent.blur(el);
};
const salvarBtn = () => screen.getByRole('button', { name: /Salvar e recalcular/ });

beforeEach(() => {
  h.salvar = mutacao(async () => ({}));
});

describe('OrcamentoBdiPage', () => {
  it('mostra o BDI calculado e recalcula ao vivo ao editar AC', () => {
    renderizar(<OrcamentoBdiPage />, { contexto: ctx([bdiRow(base)]) });
    expect(screen.getAllByText(`${formatNumero(calcularBdi(base))}%`).length).toBeGreaterThan(0);
    expect(salvarBtn()).toBeDisabled();
    digitar(campo(/Administração central/), '5,5');
    const novo = calcularBdi({ ...base, ac: 5.5 });
    expect(screen.getAllByText(`${formatNumero(novo)}%`).length).toBeGreaterThan(0);
    expect(salvarBtn()).toBeEnabled();
  });

  it('salvar envia id, nome e os 10 parâmetros', async () => {
    renderizar(<OrcamentoBdiPage />, { contexto: ctx([bdiRow(base)]) });
    digitar(campo(/Lucro/), '8');
    fireEvent.change(screen.getByLabelText('Nome do BDI'), { target: { value: 'BDI obra civil' } });
    fireEvent.click(salvarBtn());
    const s = h.salvar as ReturnType<typeof mutacao>;
    await waitFor(() => expect(s.mutateAsync).toHaveBeenCalledWith({ id: 'b1', nome: 'BDI obra civil', ...base, l: 8 }));
  });

  it('preset igual ao valor gravado não marca o formulário como alterado', () => {
    renderizar(<OrcamentoBdiPage />, { contexto: ctx([bdiRow(base)]) });
    fireEvent.click(screen.getByRole('button', { name: /^Médio/ }));
    expect(salvarBtn()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /3º quartil/ }));
    expect(salvarBtn()).toBeEnabled();
    expect(campo(/Administração central/).value).toBe(formatNumero(presetTcu('edificacoes', 'max').ac));
  });

  it('tributos ≥ 100% mostram erro e bloqueiam a gravação', () => {
    renderizar(<OrcamentoBdiPage />, { contexto: ctx([bdiRow(base)]) });
    digitar(campo(/ISS efetivo/), '97');
    expect(screen.getByText(/deve ser menor que 100%/)).toBeInTheDocument();
    expect(salvarBtn()).toBeDisabled();
  });

  it('somente leitura quando o orçamento não é editável', () => {
    renderizar(<OrcamentoBdiPage />, { contexto: ctx([bdiRow(base)], false) });
    expect(campo(/Administração central/)).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: /^Médio/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Novo' })).toBeNull();
  });
});
