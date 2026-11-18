import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Alert, Button, Combobox, DateInput, Drawer, DropdownMenu, Modal, Pagination, Progress, Tooltip, paginas } from './index';

interface Ref {
  id: string;
  codigo: string;
  descricao: string;
}
const DADOS: Ref[] = [
  { id: '1', codigo: '87878', descricao: 'Chapisco aplicado em alvenaria' },
  { id: '2', codigo: '87529', descricao: 'Massa única para recebimento de pintura' },
  { id: '3', codigo: '103324', descricao: 'Alvenaria de vedação de blocos cerâmicos' },
];

describe('Combobox', () => {
  it('busca com debounce, navega com setas e seleciona com Enter', () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    const onChange = vi.fn();
    function Teste() {
      const [v, setV] = useState<Ref | null>(null);
      return (
        <Combobox<Ref>
          aria-label="Referência"
          value={v}
          onChange={(x) => {
            setV(x);
            onChange(x);
          }}
          onSearch={onSearch}
          items={DADOS}
          getKey={(x) => x.id}
          getLabel={(x) => `${x.codigo} — ${x.descricao}`}
          renderItem={(x) => x.descricao}
        />
      );
    }
    render(<Teste />);
    const input = screen.getByRole('combobox', { name: 'Referência' });
    fireEvent.change(input, { target: { value: 'alv' } });
    expect(onSearch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(260);
    });
    expect(onSearch).toHaveBeenCalledWith('alv');
    expect(screen.getAllByRole('option')).toHaveLength(3);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(DADOS[2]);
    expect(input).toHaveValue('103324 — Alvenaria de vedação de blocos cerâmicos');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe('DropdownMenu', () => {
  it('abre, navega por teclado e executa a ação', () => {
    const editar = vi.fn();
    const excluir = vi.fn();
    render(
      <DropdownMenu
        trigger={<Button>Ações</Button>}
        items={[{ label: 'Editar', onSelect: editar }, 'separator', { label: 'Excluir', onSelect: excluir, danger: true }]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Ações' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger, { detail: 1 }); // clique de mouse: nenhum item ativo
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'Enter' });
    expect(excluir).toHaveBeenCalledOnce();
    expect(editar).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Esc fecha e devolve o foco ao gatilho', () => {
    render(<DropdownMenu trigger={<Button>Mais</Button>} items={[{ label: 'Item', onSelect: () => {} }]} />);
    const trigger = screen.getByRole('button', { name: 'Mais' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('Drawer', () => {
  it('é um diálogo rotulado e Esc fecha só o diálogo do topo', () => {
    const fecharDrawer = vi.fn();
    const fecharModal = vi.fn();
    render(
      <>
        <Drawer open onClose={fecharDrawer} title="Memória de cálculo">
          <input aria-label="Expressão" />
        </Drawer>
        <Modal open onClose={fecharModal} title="Confirmar">
          x
        </Modal>
      </>,
    );
    expect(screen.getByRole('dialog', { name: 'Memória de cálculo' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(fecharModal).toHaveBeenCalledOnce();
    expect(fecharDrawer).not.toHaveBeenCalled();
  });

  it('foca o primeiro campo do corpo', () => {
    render(
      <Drawer open onClose={() => {}} title="Painel">
        <input aria-label="Campo" />
      </Drawer>,
    );
    expect(screen.getByLabelText('Campo')).toHaveFocus();
  });
});

describe('Tooltip', () => {
  it('abre no hover após o atraso e liga aria-describedby', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Sem preço na data-base">
        <button type="button">!</button>
      </Tooltip>,
    );
    const b = screen.getByRole('button', { name: '!' });
    fireEvent.mouseEnter(b);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Sem preço na data-base');
    expect(b).toHaveAttribute('aria-describedby', tip.id);
    fireEvent.mouseLeave(b);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe('Pagination', () => {
  it('gera a sequência com reticências', () => {
    expect(paginas(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginas(6, 20)).toEqual([1, '…', 5, 6, 7, '…', 20]);
    expect(paginas(2, 20)).toEqual([1, 2, 3, '…', 20]);
  });

  it('mostra o intervalo e navega', () => {
    const onChange = vi.fn();
    render(<Pagination page={2} pageSize={50} total={1234} onChange={onChange} />);
    expect(screen.getByRole('navigation', { name: 'Paginação' })).toHaveTextContent('51–100 de 1.234 registros');
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(onChange).toHaveBeenCalledWith(3);
    expect(screen.getByRole('button', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('DateInput, Alert, Progress', () => {
  it('DateInput devolve ISO ou null', () => {
    const onChange = vi.fn();
    render(<DateInput aria-label="Início" value="2026-11-18" onChange={onChange} />);
    const input = screen.getByLabelText('Início');
    expect(input).toHaveValue('2026-11-18');
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('Alert danger usa role alert; Progress expõe valor', () => {
    render(
      <>
        <Alert variant="danger" title="Falhou">detalhe</Alert>
        <Progress value={42.4} label="Enviando" />
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });
});
