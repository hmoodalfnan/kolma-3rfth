'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useStudentContext } from '@/lib/student/useStudentContext';
import { programToday } from '@/lib/tasks/queries';

/**
 * Loads the day's checklist for the signed-in user: active daily tasks (+ which
 * are done today) and active persistent assignments (+ which are done). Toggles
 * apply optimistically and roll back on server rejection.
 */
export function useToday() {
  const ctx = useStudentContext();
  const student = ctx.student;
  const tz = ctx.schedule?.timezone;
  const today = programToday(tz);

  const [state, setState] = useState({
    status: 'loading',
    dailyTasks: [],
    assignments: [],
    doneTasks: new Set(),
    doneAssignments: new Set(),
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
    if (ctx.status !== 'ready' || !student) return;
    (async () => {
      try {
        const client = getBrowserClient();
        const [tasksRes, assignmentsRes, dcRes, acRes] = await Promise.all([
          client
            .from('daily_tasks')
            .select('id, title, description, points, sort_order')
            .eq('is_active', true)
            .is('archived_at', null)
            .order('sort_order'),
          client
            .from('assignments')
            .select('id, kind, title, body_text, points, sort_order')
            .eq('is_active', true)
            .is('archived_at', null)
            .order('sort_order'),
          client
            .from('daily_completions')
            .select('task_id')
            .eq('user_id', student.id)
            .eq('done_date', today),
          client
            .from('assignment_completions')
            .select('assignment_id')
            .eq('user_id', student.id),
        ]);

        if (!alive.current) return;
        setState({
          status: 'ready',
          dailyTasks: tasksRes.data || [],
          assignments: assignmentsRes.data || [],
          doneTasks: new Set((dcRes.data || []).map((r) => r.task_id)),
          doneAssignments: new Set((acRes.data || []).map((r) => r.assignment_id)),
          error: '',
        });
      } catch {
        if (alive.current) setState((s) => ({ ...s, status: 'error' }));
      }
    })();
  }, [ctx.status, student, today]);

  const toggleTask = useCallback(
    async (taskId) => {
      if (!student) return;
      const client = getBrowserClient();
      const wasDone = state.doneTasks.has(taskId);

      setState((s) => {
        const next = new Set(s.doneTasks);
        if (wasDone) next.delete(taskId);
        else next.add(taskId);
        return { ...s, doneTasks: next };
      });

      const op = wasDone
        ? client
            .from('daily_completions')
            .delete()
            .eq('user_id', student.id)
            .eq('task_id', taskId)
            .eq('done_date', today)
        : client
            .from('daily_completions')
            .insert({ user_id: student.id, task_id: taskId, done_date: today });

      const { error } = await op;
      if (error && alive.current) {
        // Roll back.
        setState((s) => {
          const next = new Set(s.doneTasks);
          if (wasDone) next.add(taskId);
          else next.delete(taskId);
          return { ...s, doneTasks: next, error: 'تعذّر الحفظ، حاول مرة أخرى' };
        });
      }
    },
    [student, today, state.doneTasks],
  );

  const toggleAssignment = useCallback(
    async (assignmentId) => {
      if (!student) return;
      const client = getBrowserClient();
      const wasDone = state.doneAssignments.has(assignmentId);

      setState((s) => {
        const next = new Set(s.doneAssignments);
        if (wasDone) next.delete(assignmentId);
        else next.add(assignmentId);
        return { ...s, doneAssignments: next };
      });

      const op = wasDone
        ? client
            .from('assignment_completions')
            .delete()
            .eq('user_id', student.id)
            .eq('assignment_id', assignmentId)
        : client
            .from('assignment_completions')
            .insert({ user_id: student.id, assignment_id: assignmentId });

      const { error } = await op;
      if (error && alive.current) {
        setState((s) => {
          const next = new Set(s.doneAssignments);
          if (wasDone) next.add(assignmentId);
          else next.delete(assignmentId);
          return { ...s, doneAssignments: next, error: 'تعذّر الحفظ، حاول مرة أخرى' };
        });
      }
    },
    [student, state.doneAssignments],
  );

  return { ...state, ctxStatus: ctx.status, toggleTask, toggleAssignment };
}
