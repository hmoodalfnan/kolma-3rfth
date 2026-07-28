import { completionPct } from './score';
import { activeQuestionsOn } from '@/lib/questions/active';
import { todayInRiyadh, addDays } from '@/lib/schedule-time/day';

export function currentStreak({ questions, answersByDay, schedule, now = new Date() }) {
  const threshold = schedule.streak_threshold_pct ?? 100;

  let day = todayInRiyadh(now);
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
