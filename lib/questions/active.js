import { dayOfWeek } from '@/lib/schedule-time/day';

export function isQuestionActiveOn(question, dayKey) {
  if (question.archived_at) return false;

  const weekdays = question.active_weekdays;
  if (Array.isArray(weekdays) && weekdays.length > 0 && !weekdays.includes(dayOfWeek(dayKey))) {
    return false;
  }
  if (question.active_from && dayKey < question.active_from) return false;
  if (question.active_to && dayKey > question.active_to) return false;

  return true;
}

export function activeQuestionsOn(questions, dayKey) {
  return questions
    .filter((q) => isQuestionActiveOn(q, dayKey))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export function groupBySection(questions) {
  const sections = new Map();
  for (const q of questions) {
    const key = q.section || 'عام';
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key).push(q);
  }
  return [...sections.entries()].map(([section, items]) => ({ section, items }));
}
