'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useStudentContext } from '@/lib/student/useStudentContext';
import { programToday } from '@/lib/tasks/queries';
import { activeQuestionsOn } from '@/lib/questions/active';
import { validateValue } from '@/lib/questions/value-schema';

const QUESTION_COLUMNS =
  'id, section, title, help_text, type, config, points, active_weekdays, active_from, active_to, sort_order, archived_at';

/**
 * Loads the day's checklist for the signed-in user: active daily tasks (+ which
 * are done today), active persistent assignments (+ which are done), and the rich
 * daily بنود (questions) active today (+ the user's answers so far). Toggles and
 * answers apply optimistically and roll back on server rejection. Answer points
 * are scored server-side by a trigger, so the client never sends a point value.
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
    questions: [],
    doneTasks: new Set(),
    doneAssignments: new Set(),
    answers: {}, // question_id -> value
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
        const [tasksRes, assignmentsRes, questionsRes, dcRes, acRes, ansRes] = await Promise.all([
          client
            .from('daily_tasks')
            .select('id, title, description, category, points, sort_order')
            .eq('is_active', true)
            .is('archived_at', null)
            .or(`active_from.is.null,active_from.lte.${today}`)
            .or(`active_to.is.null,active_to.gte.${today}`)
            .order('sort_order'),
          client
            .from('assignments')
            .select('id, kind, title, body_text, points, sort_order')
            .eq('is_active', true)
            .is('archived_at', null)
            .order('sort_order'),
          // RLS limits questions to the student's program; the weekday/date window
          // is applied client-side by activeQuestionsOn.
          client.from('questions').select(QUESTION_COLUMNS).is('archived_at', null).order('sort_order'),
          client
            .from('daily_completions')
            .select('task_id')
            .eq('user_id', student.id)
            .eq('done_date', today),
          client
            .from('assignment_completions')
            .select('assignment_id')
            .eq('user_id', student.id),
          client
            .from('answers')
            .select('question_id, value')
            .eq('student_id', student.id)
            .eq('entry_date', today),
        ]);

        if (!alive.current) return;
        const answers = {};
        for (const row of ansRes.data || []) answers[row.question_id] = row.value;

        setState({
          status: 'ready',
          dailyTasks: tasksRes.data || [],
          assignments: assignmentsRes.data || [],
          questions: activeQuestionsOn(questionsRes.data || [], today),
          doneTasks: new Set((dcRes.data || []).map((r) => r.task_id)),
          doneAssignments: new Set((acRes.data || []).map((r) => r.assignment_id)),
          answers,
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

  const saveAnswer = useCallback(
    async (question, value) => {
      if (!student) return;
      const check = validateValue(question, value);
      if (!check.ok) {
        setState((s) => ({ ...s, error: check.error }));
        return;
      }
      const client = getBrowserClient();
      const prev = state.answers[question.id];

      // Optimistic: show the new value immediately.
      setState((s) => ({ ...s, answers: { ...s.answers, [question.id]: check.data }, error: '' }));

      const { error } = await client.from('answers').upsert(
        { student_id: student.id, question_id: question.id, entry_date: today, value: check.data },
        { onConflict: 'student_id,question_id,entry_date' },
      );

      if (error && alive.current) {
        setState((s) => ({
          ...s,
          answers: { ...s.answers, [question.id]: prev },
          error: 'تعذّر حفظ الإجابة، حاول مرة أخرى',
        }));
      }
    },
    [student, today, state.answers],
  );

  return { ...state, ctxStatus: ctx.status, toggleTask, toggleAssignment, saveAnswer };
}
