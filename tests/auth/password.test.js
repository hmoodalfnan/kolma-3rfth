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
    expect(validateStudentPin('').ok).toBe(false);
    expect(validateStudentPin(null).ok).toBe(false);
  });

  // An Arabic keyboard produces these, and \d does not match them. They used to
  // be rejected, so the PIN simply would not go in.
  it('accepts Arabic-Indic digits as the same PIN', () => {
    expect(validateStudentPin('١٢٣٤٥٦').ok).toBe(true);
    expect(validateStudentPin('۴۸۲۹۱۳').ok).toBe(true);
    expect(validateStudentPin('٤٨٢٩١').ok).toBe(false);
  });

  // Deliberately allowed now: these rules rejected every PIN a student found
  // easy to remember, and the temporary PIN is generated anyway.
  it('no longer rejects repeated digits or a simple run', () => {
    expect(validateStudentPin('111111').ok).toBe(true);
    expect(validateStudentPin('123456').ok).toBe(true);
  });
});

describe('validateStaffPassword', () => {
  it('accepts eight or more characters', () => {
    expect(validateStaffPassword('tracker2026').ok).toBe(true);
    expect(validateStaffPassword('Deeds tracker!').ok).toBe(true);
  });

  it('rejects anything shorter than eight characters', () => {
    expect(validateStaffPassword('Qaw2026').ok).toBe(false);
  });

  // Length is the only rule now. The class requirement and the common-password
  // blocklist mostly pushed people towards something they had to write down.
  it('accepts a single character class', () => {
    expect(validateStaffPassword('abcdefghij').ok).toBe(true);
    expect(validateStaffPassword('1234567890').ok).toBe(true);
  });

  it('rejects anything over the length ceiling', () => {
    expect(validateStaffPassword('a'.repeat(129)).ok).toBe(false);
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
