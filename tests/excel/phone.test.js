import { describe, it, expect } from 'vitest';
import { normalizePhone } from '@/lib/excel/import';

describe('normalizePhone', () => {
  it('puts the Bahrain code in front of a local number', () => {
    expect(normalizePhone('12345678')).toBe('97312345678');
  });

  it('strips the punctuation people actually type', () => {
    expect(normalizePhone('+973 1234 5678')).toBe('97312345678');
    expect(normalizePhone('1234-5678')).toBe('97312345678');
    expect(normalizePhone('0097312345678')).toBe('97312345678');
  });

  it('leaves an already-international number alone', () => {
    expect(normalizePhone('97312345678')).toBe('97312345678');
  });

  // Eight digits is a local number even when it opens with the country code,
  // and prefix-matching alone would have thrown this one away.
  it('does not mistake a local number starting with 973 for an international one', () => {
    expect(normalizePhone('97312345')).toBe('97397312345');
  });

  it('drops the trunk zero people carry over from other countries', () => {
    expect(normalizePhone('012345678')).toBe('97312345678');
  });

  it('honours a different country code', () => {
    expect(normalizePhone('07700900123', '44')).toBe('447700900123');
  });

  // A wrong number is worse than none: it would send someone else's PIN.
  it('discards anything that is not plausibly a number', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone('لا يوجد')).toBe('');
    expect(normalizePhone('123')).toBe('');
    expect(normalizePhone('9'.repeat(20))).toBe('');
  });
});
