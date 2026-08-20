import { completionPct } from './score';
import { activeQuestionsOn } from '@/lib/questions/active';
import { todayInRiyadh, addDays } from '@/lib/schedule-time/day';

/**
 * Consecutive complete days ending at `endDay` (today by default).
 *
 * A day counts toward the streak when its daily بنود reach the threshold AND
 * every مهمة مجموعة dated that day was completed ON TIME (on or before its date).
 * A late group task still earns points elsewhere, but breaks the streak here.
 * Days with neither questions nor group tasks are skipped, not broken.
 *
 * Passing an explicit day answers "what was my streak on the 14th" while looking
 * at the 14th — the number on a past day should describe that day, not today.
 *
 * `assignments` are the active group tasks ({ id, task_date }); `completedOn` maps
 * an assignment id to the day it was completed ('YYYY-MM-DD') or is absent when
 * not done. Both default empty, so callers without group tasks are unaffected.
 */
export function currentStreak({
  questions,
  answersByDay,
  schedule,
  now = new Date(),
  endDay,
  assignments = [],
  completedOn = {},
}) {
  const threshold = schedule.streak_threshold_pct ?? 100;

  // Group tasks bucketed by the day they belong to, for an O(1) per-day lookup.
  const groupByDay = {};
  for (const a of assignments) {
    (groupByDay[a.task_date] ??= []).push(a);
  }
  const completed = (id) =>
    completedOn instanceof Map ? completedOn.get(id) : completedOn?.[id];

  const groupOnTime = (day) =>
    (groupByDay[day] ?? []).every((a) => {
      const on = completed(a.id);
      return on && on <= day;
    });

  let day = endDay ?? todayInRiyadh(now);
  if (schedule.end_date && day > schedule.end_date) day = schedule.end_date;

  let streak = 0;
  while (day >= schedule.start_date) {
    const active = activeQuestionsOn(questions, day);
    const group = groupByDay[day] ?? [];
    if (active.length === 0 && group.length === 0) {
      day = addDays(day, -1);
      continue;
    }

    if (active.length > 0) {
      const answers = answersByDay?.[day];
      if (!answers) break;
      if (completionPct(active, answers) + 1e-9 < threshold) break;
    }

    if (!groupOnTime(day)) break;

    streak += 1;
    day = addDays(day, -1);
  }

  return streak;
}
