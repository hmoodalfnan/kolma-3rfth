import { describe, it, expect } from 'vitest';
import { homeFor, canAccess } from '@/lib/auth/guard';

describe('homeFor', () => {
  it('routes each role to its landing page', () => {
    expect(homeFor('student')).toBe('/today');
    expect(homeFor('manager')).toBe('/schedules');
    expect(homeFor('super_admin')).toBe('/admin/global-board');
  });

  it('sends an unknown or missing role to the staff login', () => {
    expect(homeFor(null)).toBe('/login');
    expect(homeFor('intruder')).toBe('/login');
  });
});

describe('canAccess', () => {
  it('keeps a student inside the student area', () => {
    expect(canAccess('student', '/today')).toBe(true);
    expect(canAccess('student', '/board')).toBe(true);
    expect(canAccess('student', '/notifications')).toBe(true);
    expect(canAccess('student', '/schedules')).toBe(false);
    expect(canAccess('student', '/admin/global-log')).toBe(false);
  });

  it('lets a manager into the management area but not the admin area', () => {
    expect(canAccess('manager', '/schedules')).toBe(true);
    expect(canAccess('manager', '/questions')).toBe(true);
    expect(canAccess('manager', '/account')).toBe(true);
    expect(canAccess('manager', '/admin/staff')).toBe(false);
  });

  it('keeps a student out of the staff account page', () => {
    expect(canAccess('student', '/account')).toBe(false);
  });

  it('lets a super admin everywhere', () => {
    for (const path of ['/today', '/schedules', '/admin/staff', '/admin/global-log']) {
      expect(canAccess('super_admin', path)).toBe(true);
    }
  });

  it('allows the auth routes to every role including none', () => {
    for (const role of ['student', 'manager', 'super_admin', null]) {
      expect(canAccess(role, '/login')).toBe(true);
      expect(canAccess(role, '/change-password')).toBe(true);
      expect(canAccess(role, '/j/abcdefghij')).toBe(true);
    }
  });
});
