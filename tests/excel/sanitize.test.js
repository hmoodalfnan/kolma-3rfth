import { describe, it, expect } from 'vitest';
import { sanitizeCell } from '@/lib/excel/sanitize';

describe('sanitizeCell', () => {
  it('neutralises formula-leading characters', () => {
    for (const prefix of ['=', '+', '-', '@']) {
      expect(sanitizeCell(`${prefix}cmd|' /c calc'!A1`)).toBe(`'${prefix}cmd|' /c calc'!A1`);
    }
  });

  it('neutralises leading tab and carriage return', () => {
    expect(sanitizeCell('\tSUM(1)')).toBe("'\tSUM(1)");
    expect(sanitizeCell('\rSUM(1)')).toBe("'\rSUM(1)");
  });

  it('leaves ordinary Arabic text untouched', () => {
    expect(sanitizeCell('محمد علي')).toBe('محمد علي');
  });

  it('leaves numbers as numbers so Excel can still total them', () => {
    expect(sanitizeCell(42)).toBe(42);
    expect(sanitizeCell(-7)).toBe(-7);
  });

  it('quotes a string that merely starts with a minus, unlike a negative number', () => {
    expect(sanitizeCell('-7')).toBe("'-7");
    expect(sanitizeCell(-7)).toBe(-7);
  });

  it('renders null and undefined as an empty string', () => {
    expect(sanitizeCell(null)).toBe('');
    expect(sanitizeCell(undefined)).toBe('');
  });
});
