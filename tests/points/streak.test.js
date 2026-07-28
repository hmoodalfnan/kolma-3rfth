import { describe, it, expect } from 'vitest';
import { currentStreak } from '@/lib/points/streak';

const q = (id) => ({
  id,
  type: 'bool',
  config: {},
  points: 1,
  active_weekdays: null,
  active_from: null,
  active_to: null,
  archived_at: null,
  sort_order: 0,
});

const questions = [q('a'), q('b')];
const full = { a: true, b: true };
const half = { a: true, b: false };
const now = new Date('2026-08-10T09:00:00Z');
const schedule = { start_date: '2026-08-01', end_date: null, streak_threshold_pct: 100 };

describe('currentStreak', () => {
  it('counts consecutive fully-complete days ending today', () => {
    const answersByDay = { '2026-08-10': full, '2026-08-09': full, '2026-08-08': half };
    expect(currentStreak({ questions, answersByDay, schedule, now })).toBe(2);
  });

  it('breaks the streak on the first day below the threshold', () => {
    const answersByDay = { '2026-08-10': half, '2026-08-09': full };
    expect(currentStreak({ questions, answersByDay, schedule, now })).toBe(0);
  });

  it('honours a threshold below 100 percent', () => {
    const answersByDay = { '2026-08-10': half, '2026-08-09': half };
    const lenient = { ...schedule, streak_threshold_pct: 50 };
    expect(currentStreak({ questions, answersByDay, schedule: lenient, now })).toBe(2);
  });

  it('stops at the schedule start date', () => {
    const answersByDay = { '2026-08-10': full, '2026-08-09': full, '2026-08-08': full };
    const late = { ...schedule, start_date: '2026-08-09' };
    expect(currentStreak({ questions, answersByDay, schedule: late, now })).toBe(2);
  });

  it('is zero when today has no record at all', () => {
    expect(currentStreak({ questions, answersByDay: { '2026-08-09': full }, schedule, now })).toBe(0);
  });

  it('skips days on which no question was active instead of breaking the streak', () => {
    const fridayOnly = { ...q('f'), active_weekdays: [5] };
    const answersByDay = { '2026-08-10': full, '2026-08-09': full, '2026-08-08': full };
    expect(
      currentStreak({ questions: [...questions, fridayOnly], answersByDay, schedule, now }),
    ).toBe(3);
  });
});
