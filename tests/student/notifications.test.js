import { describe, it, expect, vi } from 'vitest';
import { unreadCount, seenKey, getSeenAt, markSeen, SEEN_EVENT } from '@/lib/student/notifications';
import { db } from '@/lib/offline/db';

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

describe('markSeen / getSeenAt', () => {
  it('round-trips the seen timestamp per student', async () => {
    await db.meta.delete(seenKey('stu-1'));
    expect(await getSeenAt('stu-1')).toBe(null);

    await markSeen('stu-1', '2026-08-08T12:00:00Z');
    expect(await getSeenAt('stu-1')).toBe('2026-08-08T12:00:00Z');
  });

  it('marks everything read: nothing counts as unread after markSeen', async () => {
    const grants = [{ created_at: '2026-08-08T10:00:00Z' }, { created_at: '2026-08-08T09:00:00Z' }];
    await markSeen('stu-2', '2026-08-08T23:59:00Z');
    expect(unreadCount(grants, await getSeenAt('stu-2'))).toBe(0);
  });

  it('announces a seen event so a mounted badge can recount', async () => {
    const spy = vi.fn();
    window.addEventListener(SEEN_EVENT, spy);
    await markSeen('stu-3');
    window.removeEventListener(SEEN_EVENT, spy);
    expect(spy).toHaveBeenCalled();
  });
});
