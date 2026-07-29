import { describe, it, expect } from 'vitest';
import { normalizePhone } from '@/lib/excel/import';

describe('normalizePhone', () => {
  it('turns a local 05 number into an international one', () => {
    expect(normalizePhone('0501234567')).toBe('966501234567');
  });

  it('strips the punctuation people actually type', () => {
    expect(normalizePhone('+966 50 123 4567')).toBe('966501234567');
    expect(normalizePhone('050-123-4567')).toBe('966501234567');
    expect(normalizePhone('00966501234567')).toBe('966501234567');
  });

  it('leaves an already-international number alone', () => {
    expect(normalizePhone('966501234567')).toBe('966501234567');
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
