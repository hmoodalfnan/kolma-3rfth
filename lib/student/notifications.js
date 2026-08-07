import { db } from '@/lib/offline/db';

// Fired after the seen-at mark is written, so a mounted badge elsewhere on the
// page (the top bar persists across student routes) can recount without waiting
// to be remounted.
export const SEEN_EVENT = 'notifications:seen';

export const seenKey = (studentId) => `notif_seen|${studentId}`;

/** How many grants arrived after the student last opened the tab. */
export function unreadCount(grants, seenAt) {
  if (!seenAt) return grants.length;
  const cut = new Date(seenAt).getTime();
  return grants.reduce((n, g) => (new Date(g.created_at).getTime() > cut ? n + 1 : n), 0);
}

export async function getSeenAt(studentId) {
  const row = await db.meta.get(seenKey(studentId));
  return row?.value ?? null;
}

export async function markSeen(studentId, whenIso = new Date().toISOString()) {
  await db.meta.put({ key: seenKey(studentId), value: whenIso });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SEEN_EVENT));
  }
}
