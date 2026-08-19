'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';

/**
 * The persistent مهام مستمرة (assignments) for the signed-in student and which
 * they have completed. Unlike the daily بنود these are not tied to a date — done
 * once, they stay done — so they load independently of the day being viewed.
 * Toggles apply optimistically and roll back on server rejection.
 */
export function useAssignments(studentId) {
  const [state, setState] = useState({
    status: 'loading',
    assignments: [],
    done: new Set(),
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
            .select('id, kind, title, body_text, points, sort_order')
            .eq('is_active', true)
            .is('archived_at', null)
            .order('sort_order'),
          client.from('assignment_completions').select('assignment_id').eq('user_id', studentId),
        ]);
        if (!alive.current) return;
        setState({
          status: 'ready',
          assignments: assignmentsRes.data || [],
          done: new Set((acRes.data || []).map((r) => r.assignment_id)),
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
        if (wasDone) next.delete(assignmentId);
        else next.add(assignmentId);
        return { ...s, done: next };
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
          if (wasDone) next.add(assignmentId);
          else next.delete(assignmentId);
          return { ...s, done: next, error: 'تعذّر الحفظ، حاول مرة أخرى' };
        });
      }
    },
    [studentId, state.done],
  );

  return { ...state, toggle };
}
