'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { db } from '@/lib/offline/db';

const CACHE_KEY = 'student_context';

/**
 * Resolve the signed-in student and their schedule. Reads the cached copy first
 * so the app boots offline, then refreshes from the server when online.
 */
export function useStudentContext() {
  const [state, setState] = useState({ status: 'loading', student: null, schedule: null });

  useEffect(() => {
    let alive = true;

    (async () => {
      const cached = await db.meta.get(CACHE_KEY);
      if (alive && cached?.value) {
        setState({ status: 'ready', ...cached.value });
      }

      if (!navigator.onLine) {
        if (alive && !cached?.value) setState({ status: 'offline-empty' });
        return;
      }

      const client = getBrowserClient();
      const { data: auth } = await client.auth.getUser();
      if (!auth?.user) {
        if (alive) setState({ status: 'unauthenticated' });
        return;
      }

      const { data: student } = await client
        .from('students')
        .select('id, schedule_id, group_id, full_name, emoji, must_change_password')
        .eq('auth_uid', auth.user.id)
        .maybeSingle();

      if (!student) {
        if (alive && !cached?.value) setState({ status: 'unauthenticated' });
        return;
      }

      const { data: schedule } = await client
        .from('schedules')
        .select(
          'id, name, slug, start_date, end_date, status, streak_threshold_pct, backfill_days, students_see_leaderboard, show_streak, timezone',
        )
        .eq('id', student.schedule_id)
        .maybeSingle();

      const value = { student, schedule };
      await db.meta.put({ key: CACHE_KEY, value });
      if (alive) setState({ status: 'ready', ...value });
    })();

    return () => {
      alive = false;
    };
  }, []);

  return state;
}
