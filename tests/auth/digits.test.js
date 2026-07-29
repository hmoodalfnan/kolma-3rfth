import { describe, it, expect } from 'vitest';
import { toWesternDigits } from '@/lib/auth/digits';

describe('toWesternDigits', () => {
  it('converts Arabic-Indic digits', () => {
    expect(toWesternDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
  });

  it('converts Extended Arabic-Indic (Persian) digits', () => {
    expect(toWesternDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
  });

  it('leaves Western digits and other characters alone', () => {
    expect(toWesternDigits('482913')).toBe('482913');
    expect(toWesternDigits('رمز ١٢٣')).toBe('رمز 123');
  });

  it('handles a mixed-script code as one value', () => {
    expect(toWesternDigits('١2٣4٥6')).toBe('123456');
  });

  it('returns an empty string for anything that is not a string', () => {
    expect(toWesternDigits(null)).toBe('');
    expect(toWesternDigits(undefined)).toBe('');
    expect(toWesternDigits(123)).toBe('');
  });
});
