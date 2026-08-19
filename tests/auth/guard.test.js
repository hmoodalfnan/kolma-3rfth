import { describe, it, expect } from 'vitest';
import { homeFor, canAccess } from '@/lib/auth/guard';

describe('homeFor', () => {
  it('routes each role to its landing page', () => {
    expect(homeFor('student')).toBe('/today');
    expect(homeFor('super_admin')).toBe('/admin/daily-tasks');
  });

  it('sends an unknown or missing role to login', () => {
    expect(homeFor(null)).toBe('/login');
    expect(homeFor('intruder')).toBe('/login');
  });
});

describe('canAccess', () => {
  it('keeps a normal user inside the user area', () => {
    expect(canAccess('student', '/today')).toBe(true);
    expect(canAccess('student', '/board')).toBe(true);
    expect(canAccess('student', '/notifications')).toBe(true);
    expect(canAccess('student', '/settings')).toBe(true);
    expect(canAccess('student', '/admin/users')).toBe(false);
  });

  it('lets a super admin everywhere', () => {
    for (const path of ['/today', '/admin/daily-tasks', '/admin/users', '/admin/leaderboard']) {
      expect(canAccess('super_admin', path)).toBe(true);
    }
  });

  it('allows the auth routes to every role including none', () => {
    for (const role of ['student', 'super_admin', null]) {
      expect(canAccess(role, '/login')).toBe(true);
      expect(canAccess(role, '/register')).toBe(true);
    }
  });
});
