'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { toDayKey } from '@/lib/schedule-time/day';

/**
 * The مهام المجموعة (assignments) for the signed-in student and which they have
 * completed. Each assignment carries a task_date — the day it belongs to — and it
 * shows on that day. Completing one anytime earns its points; doing it after its
 * date is "late" (still counted, but flagged and excluded from the streak).
 *
 * `completedOn` maps an assignment id to the program-day it was completed, so the
 * streak and late badges can tell on-time from late. Toggles apply optimistically
 * and roll back on server rejection.
 */
export function useAssignments(studentId) {
  const [state, setState] = useState({
    status: 'loading',
    assignments: [],
    done: new Set(),
    completedOn: {},
    error: '',
  });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!studentId) return;
    (async () => {
      try {
        const client = getBrowserClient();
        const [assignmentsRes, acRes] = await Promise.all([
          client
            .from('assignments')
            .select('id, kind, title, body_text, points, task_date, sort_order')
            .eq('is_active', true)
            .is('archived_at', null)
            .order('task_date', { ascending: false })
            .order('sort_order'),
          client
            .from('assignment_completions')
            .select('assignment_id, completed_at')
            .eq('user_id', studentId),
        ]);
        if (!alive.current) return;
        const completions = acRes.data || [];
        setState({
          status: 'ready',
          assignments: assignmentsRes.data || [],
          done: new Set(completions.map((r) => r.assignment_id)),
          completedOn: Object.fromEntries(
            completions.map((r) => [r.assignment_id, toDayKey(new Date(r.completed_at))]),
          ),
          error: '',
        });
      } catch {
        if (alive.current) setState((s) => ({ ...s, status: 'error' }));
      }
    })();
  }, [studentId]);

  const toggle = useCallback(
    async (assignmentId) => {
      if (!studentId) return;
      const client = getBrowserClient();
      const wasDone = state.done.has(assignmentId);

      setState((s) => {
        const next = new Set(s.done);
        const on = { ...s.completedOn };
        if (wasDone) {
          next.delete(assignmentId);
          delete on[assignmentId];
        } else {
          next.add(assignmentId);
          on[assignmentId] = toDayKey(new Date());
        }
        return { ...s, done: next, completedOn: on };
      });

      const op = wasDone
        ? client
            .from('assignment_completions')
            .delete()
            .eq('user_id', studentId)
            .eq('assignment_id', assignmentId)
        : client
            .from('assignment_completions')
            .insert({ user_id: studentId, assignment_id: assignmentId });

      const { error } = await op;
      if (error && alive.current) {
        setState((s) => {
          const next = new Set(s.done);
          const on = { ...s.completedOn };
          if (wasDone) {
            next.add(assignmentId);
            on[assignmentId] = toDayKey(new Date());
          } else {
            next.delete(assignmentId);
            delete on[assignmentId];
          }
          return { ...s, done: next, completedOn: on, error: 'تعذّر الحفظ، حاول مرة أخرى' };
        });
      }
    },
    [studentId, state.done],
  );

  return { ...state, toggle };
}
