/** Importador SINAPI: arquivo → detecção/mapeamento → prévia → envio (executarImportacao). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ParametrosImportacao, Progresso } from '@/api/core/sinapi';
import type { Celula } from '@/lib/sinapi/parser';
import { renderizar } from '@/test/utils';
import AdminSinapiImportarPage from './AdminSinapiImportarPage';

const h = vi.hoisted(() => ({ linhas: [] as Celula[][], executar: vi.fn() }));

vi.mock('@/lib/sinapi/planilha', () => ({ lerPlanilha: async () => [{ nome: 'Insumos', linhas: h.linhas }] }));
vi.mock('@/api/core/sinapi', async (orig) => ({ ...(await orig<Record<string, unknown>>()), executarImportacao: h.executar }));

const PLANILHA: Celula[][] = [
  ['SINAPI - PREÇOS DE INSUMOS'],
  ['LOCALIDADE: RIO DE JANEIRO'],
  [],
  ['CÓDIGO', 'DESCRIÇÃO DO INSUMO', 'UNIDADE', 'ORIGEM DE PREÇO', 'PREÇO MEDIANO R$'],
  ['00000370', 'AREIA MEDIA', 'm3', 'C', '123,45'],
  [1379, 'CIMENTO PORTLAND CP II-32', 'KG', 'C', 0.89],
  ['4750', 'PEDREIRO', 'H', 'CR', '25,10'],
  ['99999', 'SEM PRECO', 'UN', 'C', ''],
];

function enviarArquivo(container: HTMLElement, nome = 'SINAPI_Preco_Ref_Insumos_RJ_202610_NaoDesonerado.xlsx') {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], nome, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  h.linhas = PLANILHA.map((l) => [...l]);
  h.executar.mockReset();
});

describe('AdminSinapiImportarPage', () => {
  it('lê, detecta tipo/metadados pelo nome, mostra prévia e erros por linha', async () => {
    const { container } = renderizar(<AdminSinapiImportarPage />);
    enviarArquivo(container);
    expect(await screen.findByText('AREIA MEDIA')).toBeInTheDocument();
    expect(screen.getByText('CIMENTO PORTLAND CP II-32')).toBeInTheDocument();
    expect(screen.getByText(/Preço ausente/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Importar 3 linhas/ })).toBeEnabled();
    expect((screen.getByLabelText('UF') as HTMLSelectElement).value).toBe('RJ');
    expect((screen.getByLabelText('Ano') as HTMLInputElement).value).toMatch(/2026|2\.026/);
  });

  it('envia o resultado normalizado com UF/mês/regime/publicação e mostra o resumo', async () => {
    h.executar.mockImplementation(async (p: ParametrosImportacao, prog: (x: Progresso) => void) => {
      prog({ enviados: 0, total: p.resultado.linhas.length, okServidor: 0, etapa: 'iniciando' });
      prog({ enviados: 3, total: 3, okServidor: 3, etapa: 'concluida' });
      return { id: 'imp', status: 'concluida', linhas_ok: 3, linhas_erro: 0, erros: [] };
    });
    const { container } = renderizar(<AdminSinapiImportarPage />);
    enviarArquivo(container);
    const botao = await screen.findByRole('button', { name: /Importar 3 linhas/ });
    const publicar = screen.getByLabelText(/Publicar a data-base ao concluir/) as HTMLInputElement;
    expect(publicar.checked).toBe(false); // padrão: rascunho
    fireEvent.click(publicar);
    fireEvent.click(botao);
    await waitFor(() => expect(h.executar).toHaveBeenCalledOnce());
    const [p] = h.executar.mock.calls[0]! as [ParametrosImportacao];
    expect(p).toMatchObject({ uf: 'RJ', ano: 2026, mes: 10, regime: 'nao_desonerado', publicar: true });
    expect(p.arquivoNome).toContain('SINAPI_Preco_Ref_Insumos_RJ_202610');
    expect(p.resultado.tipo).toBe('insumos');
    expect((p.resultado.linhas as { codigo: string; unidade: string; preco: number }[]).map((l) => [l.codigo, l.unidade, l.preco])).toEqual([
      ['370', 'M3', 123.45],
      ['1379', 'KG', 0.89],
      ['4750', 'H', 25.1],
    ]);
    expect(await screen.findByText(/3 linhas gravadas, 0 rejeitadas/)).toBeInTheDocument();
  });

  it('falha no servidor mostra o erro e permite tentar de novo', async () => {
    h.executar.mockRejectedValue({ code: '42501', message: 'Acesso restrito ao administrador.' });
    const { container } = renderizar(<AdminSinapiImportarPage />);
    enviarArquivo(container);
    fireEvent.click(await screen.findByRole('button', { name: /Importar 3 linhas/ }));
    expect(await screen.findByText('A importação foi interrompida')).toBeInTheDocument();
    expect(screen.getAllByText('Acesso restrito ao administrador.').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Importar 3 linhas/ })).toBeEnabled();
  });

  it('planilha vazia mostra erro de leitura', async () => {
    h.linhas = [];
    const { container } = renderizar(<AdminSinapiImportarPage />);
    enviarArquivo(container);
    expect(await screen.findByText(/A planilha está vazia/)).toBeInTheDocument();
  });
});
