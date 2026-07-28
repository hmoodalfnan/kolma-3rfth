'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { db, deviceId } from '@/lib/offline/db';
import { enqueue } from '@/lib/offline/outbox';
import { flush, mirror, startAutoSync } from '@/lib/offline/sync';
import { activeQuestionsOn } from '@/lib/questions/active';
import { completionPct, dayPoints } from '@/lib/points/score';
import { currentStreak } from '@/lib/points/streak';
import { addDays, isWithinBackfill, todayInRiyadh } from '@/lib/schedule-time/day';

const MIRROR_DAYS = 30;

export function useDay({ studentId, schedule, dayKey }) {
  const [questions, setQuestions] = useState([]);
  const [answersByDay, setAnswersByDay] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const previous = useRef({});

  const client = useMemo(() => getBrowserClient(), []);

  const readLocal = useCallback(async () => {
    if (!studentId || !schedule?.id) return;

    const [qs, rows] = await Promise.all([
      db.questions.where('schedule_id').equals(schedule.id).toArray(),
      db.answers.where('student_id').equals(studentId).toArray(),
    ]);

    const byDay = {};
    for (const row of rows) {
      byDay[row.entry_date] ??= {};
      byDay[row.entry_date][row.question_id] = row.value;
    }

    setQuestions(qs);
    setAnswersByDay(byDay);
  }, [studentId, schedule?.id]);

  useEffect(() => {
    let alive = true;

    (async () => {
      await readLocal();
      if (alive) setLoading(false);

      if (navigator.onLine && studentId && schedule?.id) {
        try {
          await mirror(client, {
            studentId,
            scheduleId: schedule.id,
            from: addDays(todayInRiyadh(), -MIRROR_DAYS),
          });
          if (alive) await readLocal();
        } catch {
          // Offline or transient: the local mirror is already rendered.
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [client, readLocal, studentId, schedule?.id]);

  useEffect(() => {
    if (!studentId) return undefined;
    return startAutoSync(client, (result) => {
      if (result.rejected.length > 0) {
        setError(result.rejected[0].error);
        readLocal();
      }
    });
  }, [client, studentId, readLocal]);

  const active = useMemo(() => activeQuestionsOn(questions, dayKey), [questions, dayKey]);
  const values = answersByDay[dayKey] ?? {};

  const editable =
    Boolean(schedule) && schedule.status === 'active' && isWithinBackfill(schedule, dayKey);

  const setValue = useCallback(
    async (questionId, value) => {
      if (!editable) return;

      setError('');
      previous.current[questionId] = answersByDay[dayKey]?.[questionId];

      // Optimistic: paint immediately, persist locally, push when possible.
      setAnswersByDay((prev) => ({
        ...prev,
        [dayKey]: { ...(prev[dayKey] ?? {}), [questionId]: value },
      }));

      const device = await deviceId();
      await enqueue({
        studentId,
        questionId,
        entryDate: dayKey,
        value,
        clientUpdatedAt: new Date().toISOString(),
        deviceId: device,
      });

      if (navigator.onLine) {
        const result = await flush(client);
        const rejection = result.rejected.find((r) => r.op.questionId === questionId);
        if (rejection) {
          setError(rejection.error);
          setAnswersByDay((prev) => {
            const day = { ...(prev[dayKey] ?? {}) };
            const restored = previous.current[questionId];
            if (restored === undefined) delete day[questionId];
            else day[questionId] = restored;
            return { ...prev, [dayKey]: day };
          });
          await db.answers.delete([studentId, questionId, dayKey]);
        }
      }
    },
    [client, dayKey, editable, studentId, answersByDay],
  );

  const completion = useMemo(() => completionPct(active, values), [active, values]);
  const points = useMemo(() => dayPoints(active, values), [active, values]);
  const streak = useMemo(
    () => (schedule ? currentStreak({ questions, answersByDay, schedule }) : 0),
    [questions, answersByDay, schedule],
  );

  const completionFor = useCallback(
    (key) => completionPct(activeQuestionsOn(questions, key), answersByDay[key] ?? {}),
    [questions, answersByDay],
  );

  return {
    questions: active,
    allQuestions: questions,
    values,
    answersByDay,
    setValue,
    completion,
    completionFor,
    points,
    streak,
    loading,
    editable,
    error,
    clearError: () => setError(''),
  };
}
