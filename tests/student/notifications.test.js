import { describe, it, expect } from 'vitest';
import { unreadCount, seenKey } from '@/lib/student/notifications';

const grants = [
  { created_at: '2026-08-08T10:00:00Z' },
  { created_at: '2026-08-08T09:00:00Z' },
  { created_at: '2026-08-07T09:00:00Z' },
];

describe('unreadCount', () => {
  it('counts everything when nothing has been seen', () => {
    expect(unreadCount(grants, null)).toBe(3);
  });

  it('counts only grants newer than the seen timestamp', () => {
    expect(unreadCount(grants, '2026-08-08T09:30:00Z')).toBe(1);
  });

  it('is zero when the newest grant is already seen', () => {
    expect(unreadCount(grants, '2026-08-08T10:00:00Z')).toBe(0);
  });

  it('handles an empty feed', () => {
    expect(unreadCount([], null)).toBe(0);
  });
});

describe('seenKey', () => {
  it('namespaces by student id', () => {
    expect(seenKey('abc')).toBe('notif_seen|abc');
  });
});
