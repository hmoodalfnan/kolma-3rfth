import { describe, it, expect } from 'vitest';
import {
  validateStaffPassword,
  validateStudentPin,
  generatePin,
  generateSlug,
} from '@/lib/auth/password';

describe('validateStudentPin', () => {
  it('accepts exactly six digits', () => {
    expect(validateStudentPin('482913').ok).toBe(true);
  });

  it('rejects the wrong length or any non-digit', () => {
    expect(validateStudentPin('12345').ok).toBe(false);
    expect(validateStudentPin('1234567').ok).toBe(false);
    expect(validateStudentPin('12345a').ok).toBe(false);
    expect(validateStudentPin('١٢٣٤٥٦').ok).toBe(false);
    expect(validateStudentPin('').ok).toBe(false);
    expect(validateStudentPin(null).ok).toBe(false);
  });

  it('rejects a PIN that is all one digit or a simple run', () => {
    expect(validateStudentPin('111111').ok).toBe(false);
    expect(validateStudentPin('123456').ok).toBe(false);
  });
});

describe('validateStaffPassword', () => {
  it('accepts eight or more characters spanning two class types', () => {
    expect(validateStaffPassword('tracker2026').ok).toBe(true);
    expect(validateStaffPassword('Deeds tracker!').ok).toBe(true);
  });

  it('rejects anything shorter than eight characters', () => {
    expect(validateStaffPassword('Qaw2026').ok).toBe(false);
  });

  it('rejects a single character class', () => {
    expect(validateStaffPassword('abcdefghij').ok).toBe(false);
    expect(validateStaffPassword('1234567890').ok).toBe(false);
  });

  it('rejects common passwords regardless of shape', () => {
    expect(validateStaffPassword('password1').ok).toBe(false);
    expect(validateStaffPassword('admin1234').ok).toBe(false);
  });
});

describe('generatePin', () => {
  it('always produces six digits that pass validation', () => {
    for (let i = 0; i < 200; i += 1) {
      const pin = generatePin();
      expect(pin).toMatch(/^\d{6}$/);
      expect(validateStudentPin(pin).ok).toBe(true);
    }
  });
});

describe('generateSlug', () => {
  it('produces sixteen lowercase base32 characters', () => {
    expect(generateSlug()).toMatch(/^[0-9abcdefghjkmnpqrstvwxyz]{16}$/);
  });

  it('does not repeat across many draws', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateSlug()));
    expect(seen.size).toBe(500);
  });
});
