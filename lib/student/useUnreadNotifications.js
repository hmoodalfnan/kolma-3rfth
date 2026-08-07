'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchStudentGrants } from '@/lib/boards/queries';
import { unreadCount, getSeenAt, markSeen, SEEN_EVENT } from '@/lib/student/notifications';
import { useStudentContext } from '@/lib/student/useStudentContext';

export function useUnreadNotifications() {
  const ctx = useStudentContext();
  const studentId = ctx.student?.id;
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!studentId || !navigator.onLine) return;
    try {
      const [grants, seenAt] = await Promise.all([
        fetchStudentGrants(getBrowserClient(), { studentId }),
        getSeenAt(studentId),
      ]);
      setCount(unreadCount(grants, seenAt));
    } catch {
      /* a badge is not worth surfacing an error for */
    }
  }, [studentId]);

  const markAllSeen = useCallback(async () => {
    if (!studentId) return;
    setCount(0); // instant feedback; the write + event keep other views in sync
    await markSeen(studentId);
  }, [studentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Any mark-seen anywhere (the bell tap, opening the page) recounts this badge.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onSeen = () => refresh();
    window.addEventListener(SEEN_EVENT, onSeen);
    return () => window.removeEventListener(SEEN_EVENT, onSeen);
  }, [refresh]);

  return { count, refresh, markAllSeen };
}
