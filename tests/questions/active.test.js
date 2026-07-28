import { describe, it, expect } from 'vitest';
import { isQuestionActiveOn, activeQuestionsOn } from '@/lib/questions/active';

const base = {
  id: 'q',
  active_weekdays: null,
  active_from: null,
  active_to: null,
  archived_at: null,
};

describe('isQuestionActiveOn', () => {
  it('is active every day when unrestricted', () => {
    expect(isQuestionActiveOn(base, '2026-08-05')).toBe(true);
  });

  it('honours a weekday restriction using PostgreSQL DOW numbering', () => {
    const friday = { ...base, active_weekdays: [5] };
    expect(isQuestionActiveOn(friday, '2026-08-07')).toBe(true);
    expect(isQuestionActiveOn(friday, '2026-08-08')).toBe(false);
  });

  it('honours an inclusive date sub-range', () => {
    const q = { ...base, active_from: '2026-08-05', active_to: '2026-08-07' };
    expect(isQuestionActiveOn(q, '2026-08-04')).toBe(false);
    expect(isQuestionActiveOn(q, '2026-08-05')).toBe(true);
    expect(isQuestionActiveOn(q, '2026-08-07')).toBe(true);
    expect(isQuestionActiveOn(q, '2026-08-08')).toBe(false);
  });

  it('combines weekday and date-range restrictions', () => {
    const q = { ...base, active_weekdays: [5], active_from: '2026-08-10', active_to: null };
    expect(isQuestionActiveOn(q, '2026-08-07')).toBe(false);
    expect(isQuestionActiveOn(q, '2026-08-14')).toBe(true);
  });

  it('is never active once archived', () => {
    const q = { ...base, archived_at: '2026-08-01T00:00:00Z' };
    expect(isQuestionActiveOn(q, '2026-08-05')).toBe(false);
  });

  it('treats an empty weekday array as unrestricted rather than never', () => {
    expect(isQuestionActiveOn({ ...base, active_weekdays: [] }, '2026-08-05')).toBe(true);
  });
});

describe('activeQuestionsOn', () => {
  it('filters and preserves sort_order', () => {
    const qs = [
      { ...base, id: 'b', sort_order: 2 },
      { ...base, id: 'a', sort_order: 1 },
      { ...base, id: 'c', sort_order: 3, archived_at: '2026-01-01T00:00:00Z' },
    ];
    expect(activeQuestionsOn(qs, '2026-08-05').map((q) => q.id)).toEqual(['a', 'b']);
  });
});
