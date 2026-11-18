import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Badge, Button, DemoBadge, EmptyState, Field, Input, Modal, NumberInput } from './index';

describe('design system (smoke)', () => {
  it('Button dispara onClick e respeita loading', () => {
    const fn = vi.fn();
    const { rerender } = render(<Button onClick={fn}>Salvar</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(fn).toHaveBeenCalledOnce();
    rerender(<Button loading onClick={fn}>Salvar</Button>);
    expect(screen.getByRole('button', { name: /Salvar/ })).toBeDisabled();
  });

  it('Field liga rótulo, controle e erro', () => {
    render(<Field label="E-mail" error="Obrigatório">{(p) => <Input {...p} />}</Field>);
    const input = screen.getByLabelText('E-mail');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Obrigatório');
  });

  it('NumberInput interpreta pt-BR no blur', () => {
    const onChange = vi.fn();
    function Controlado() {
      const [v, setV] = useState<number | null>(null);
      return (
        <NumberInput
          aria-label="Quantidade"
          value={v}
          onChange={(n) => {
            setV(n);
            onChange(n);
          }}
        />
      );
    }
    render(<Controlado />);
    const input = screen.getByLabelText('Quantidade');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1.234,5' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(1234.5);
    expect(input).toHaveValue('1.234,50');
  });

  it('NumberInput: Enter grava uma vez e o blur seguinte não reenvia o valor antigo (regressão E2E)', () => {
    // planilha: a prop `value` só muda quando a atualização otimista chega; o foco vai para a
    // próxima linha (blur) antes disso. O código antigo reenviava o valor anterior no blur.
    const onChange = vi.fn();
    const { rerender } = render(<NumberInput aria-label="Qtd" decimals={4} value={4.5} onChange={onChange} />);
    const input = screen.getByLabelText('Qtd');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '5,5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    rerender(<NumberInput aria-label="Qtd" decimals={4} value={4.5} onChange={onChange} />);
    fireEvent.blur(input);
    expect(onChange.mock.calls).toEqual([[5.5]]);
    rerender(<NumberInput aria-label="Qtd" decimals={4} value={5.5} onChange={onChange} />);
    expect(input).toHaveValue('5,5000');
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('NumberInput: com foco, mudança externa de value não apaga o que está sendo digitado', () => {
    const onChange = vi.fn();
    const { rerender } = render(<NumberInput aria-label="Qtd" value={1} onChange={onChange} />);
    const input = screen.getByLabelText('Qtd');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: '8,2' } });
    rerender(<NumberInput aria-label="Qtd" value={7} onChange={onChange} />); // recálculo/refetch chega
    expect(input).toHaveValue('8,2');
    fireEvent.blur(input);
    expect(onChange.mock.calls).toEqual([[7], [8.2]]);
  });

  it('Modal abre como diálogo e fecha com Esc', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Novo item">conteúdo</Modal>);
    expect(screen.getByRole('dialog', { name: 'Novo item' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('Badge, DemoBadge e EmptyState renderizam', () => {
    render(
      <>
        <Badge variant="success">Aprovado</Badge>
        <DemoBadge />
        <EmptyState title="Nenhuma obra" />
      </>,
    );
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
    expect(screen.getByText('Exemplo')).toHaveAttribute('title', expect.stringContaining('importe a tabela oficial'));
    expect(screen.getByRole('heading', { name: 'Nenhuma obra' })).toBeInTheDocument();
  });
});
