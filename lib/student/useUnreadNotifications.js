'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchStudentGrants } from '@/lib/boards/queries';
import { unreadCount, getSeenAt } from '@/lib/student/notifications';
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

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { count, refresh };
}
