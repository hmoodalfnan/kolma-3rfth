import { describe, it, expect, vi } from 'vitest';
import { friendlyError } from '@/lib/errors/friendly';

describe('friendlyError', () => {
  it('turns an RLS violation into advice, not mechanism', () => {
    const text = friendlyError({
      message: 'new row violates row-level security policy for table "schedules"',
    });
    expect(text).toContain('صلاحية');
    expect(text).not.toContain('row-level');
    expect(text).not.toContain('schedules');
  });

  it('names the session as the likely fix for an expired token', () => {
    expect(friendlyError({ message: 'JWT expired' })).toContain('جلستك');
  });

  it('sends a future-dated token to the clock, not to the login page', () => {
    const text = friendlyError({ message: 'JWT issued at future' });
    expect(text).toContain('ساعة جهازك');
    // Signing in again restamps the token with the same wrong clock, so that
    // advice would be a loop with no exit.
    expect(text).not.toContain('سجّل الدخول');
  });

  it('reads a missing column as an out-of-date database', () => {
    const text = friendlyError({
      message: "Could not find the 'must_change_password' column of 'app_users'",
    });
    expect(text).toContain('محدّثة');
    expect(text).not.toContain('must_change_password');
  });

  it('keeps our own Arabic messages intact', () => {
    const ours = 'اسم المستخدم مستخدم بالفعل';
    expect(friendlyError({ message: ours })).toBe(ours);
  });

  it('never leaks an unrecognised English message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const text = friendlyError({ message: 'TypeError: cannot read property x of undefined' });
    expect(text).not.toContain('TypeError');
    expect(text).toContain('تعذّر');
    spy.mockRestore();
  });

  it('falls back when there is no message at all', () => {
    expect(friendlyError(null)).toContain('تعذّر');
    expect(friendlyError({})).toContain('تعذّر');
  });

  it('accepts a bare string as well as an Error', () => {
    expect(friendlyError('permission denied for table students')).toContain('صلاحية');
  });
});
