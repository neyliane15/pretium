import { describe, expect, it } from 'vitest';
import { documentoValido, formatBRL, formatDocumento, formatMesAno, formatPercent, formatQuantidade, parseNumeroBR } from './format';

describe('format', () => {
  it('formata moeda e números pt-BR', () => {
    expect(formatBRL(1234.5)).toBe('R$ 1.234,50');
    expect(formatBRL(null)).toBe('—');
    expect(formatPercent(22.12)).toBe('22,12%');
    expect(formatQuantidade(12.5)).toBe('12,50');
    expect(formatQuantidade(0.12345)).toBe('0,1235');
    expect(formatMesAno(2026, 9)).toBe('09/2026');
  });
  it('interpreta números digitados', () => {
    expect(parseNumeroBR('1.234,56')).toBe(1234.56);
    expect(parseNumeroBR('1234,56')).toBe(1234.56);
    expect(parseNumeroBR('1234.56')).toBe(1234.56);
    expect(parseNumeroBR('1.234.567')).toBe(1234567);
    expect(parseNumeroBR('R$ 10')).toBe(10);
    expect(parseNumeroBR('abc')).toBeNull();
    expect(parseNumeroBR('')).toBeNull();
  });
  it('documentos', () => {
    expect(formatDocumento('11222333000181')).toBe('11.222.333/0001-81');
    expect(documentoValido('11.222.333/0001-81')).toBe(true);
    expect(documentoValido('111.444.777-35')).toBe(true);
    expect(documentoValido('111.111.111-11')).toBe(false);
  });
});
