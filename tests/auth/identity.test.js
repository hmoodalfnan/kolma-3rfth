import { describe, it, expect } from 'vitest';
import {
  staffEmail,
  studentEmail,
  usernameFromEmail,
  normalizeUsername,
} from '@/lib/auth/identity';

describe('normalizeUsername', () => {
  it('lowercases and trims', () => {
    expect(normalizeUsername('  Mohammed  ')).toBe('mohammed');
  });

  it('rejects characters outside the allowed set', () => {
    expect(() => normalizeUsername('mo hammed')).toThrow();
    expect(() => normalizeUsername('mo@hammed')).toThrow();
    expect(() => normalizeUsername('ab')).toThrow();
    expect(() => normalizeUsername('a'.repeat(33))).toThrow();
  });
});

describe('staffEmail', () => {
  it('maps a username onto the internal domain', () => {
    expect(staffEmail('mohammed')).toBe('mohammed@qawafel.internal');
  });

  it('normalizes before mapping so casing cannot fork an identity', () => {
    expect(staffEmail('MOHAMMED')).toBe('mohammed@qawafel.internal');
  });
});

describe('studentEmail', () => {
  it('derives a stable address from the student id', () => {
    const id = '8f1c2a3b-4d5e-6f70-8192-a3b4c5d6e7f8';
    expect(studentEmail(id)).toBe(`stu_${id}@qawafel.internal`);
  });
});

describe('usernameFromEmail', () => {
  it('reverses staffEmail', () => {
    expect(usernameFromEmail('mohammed@qawafel.internal')).toBe('mohammed');
  });
});
