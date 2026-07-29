import { completionPct } from './score';
import { activeQuestionsOn } from '@/lib/questions/active';
import { todayInRiyadh, addDays } from '@/lib/schedule-time/day';

/**
 * Consecutive complete days ending at `endDay` (today by default).
 *
 * Passing an explicit day answers "what was my streak on the 14th" while looking
 * at the 14th — the number on a past day should describe that day, not today.
 */
export function currentStreak({ questions, answersByDay, schedule, now = new Date(), endDay }) {
  const threshold = schedule.streak_threshold_pct ?? 100;

  let day = endDay ?? todayInRiyadh(now);
  if (schedule.end_date && day > schedule.end_date) day = schedule.end_date;

  let streak = 0;
  while (day >= schedule.start_date) {
    const active = activeQuestionsOn(questions, day);
    if (active.length === 0) {
      day = addDays(day, -1);
      continue;
    }

    const answers = answersByDay?.[day];
    if (!answers) break;
    if (completionPct(active, answers) + 1e-9 < threshold) break;

    streak += 1;
    day = addDays(day, -1);
  }

  return streak;
}
