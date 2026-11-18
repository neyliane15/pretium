/** Login: validação zod, erro traduzido do GoTrue, redirecionamento e sessão já existente. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderizar } from '@/test/utils';
import LoginPage from './LoginPage';

const h = vi.hoisted(() => ({ session: null as unknown, entrar: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: h.session }) }));
vi.mock('@/api/core/auth', () => ({ authApi: { entrar: h.entrar } }));

const senha = () => document.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;

beforeEach(() => {
  h.session = null;
  h.entrar.mockReset();
});

describe('LoginPage', () => {
  it('valida campos obrigatórios e e-mail antes de chamar o Auth', async () => {
    renderizar(<LoginPage />, { rota: '/login', caminho: '/login' });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Informe o e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: 'nao-e-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('E-mail inválido.')).toBeInTheDocument();
    expect(h.entrar).not.toHaveBeenCalled();
  });

  it('mostra a mensagem do Auth em caso de falha', async () => {
    h.entrar.mockRejectedValue(new Error('E-mail ou senha incorretos.'));
    renderizar(<LoginPage />, { rota: '/login', caminho: '/login' });
    fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: 'ana@example.com' } });
    fireEvent.change(senha(), { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument();
    expect(h.entrar).toHaveBeenCalledWith('ana@example.com', 'errada');
  });

  it('entra e volta para a rota de origem (state.from)', async () => {
    h.entrar.mockResolvedValue(undefined);
    renderizar(<LoginPage />, { rota: '/login', caminho: '/login' });
    fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: ' ana@example.com ' } });
    fireEvent.change(senha(), { target: { value: 'Senha-forte-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByTestId('outra-rota')).toBeInTheDocument());
    expect(h.entrar).toHaveBeenCalledWith('ana@example.com', 'Senha-forte-123');
  });

  it('com sessão ativa redireciona sem mostrar o formulário', () => {
    h.session = { user: { id: 'u' } };
    renderizar(<LoginPage />, { rota: '/login', caminho: '/login' });
    expect(screen.queryByRole('button', { name: 'Entrar' })).toBeNull();
    expect(screen.getByTestId('outra-rota')).toBeInTheDocument();
  });

  it('mostrar/ocultar senha alterna o tipo do campo', () => {
    renderizar(<LoginPage />, { rota: '/login', caminho: '/login' });
    expect(senha().type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(senha().type).toBe('text');
  });
});
