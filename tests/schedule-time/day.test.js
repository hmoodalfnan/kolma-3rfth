import { describe, it, expect } from 'vitest';
import {
  todayInRiyadh,
  addDays,
  dayOfWeek,
  daysBetween,
  backfillWindow,
  isWithinBackfill,
  lockReason,
  scheduleDayRange,
} from '@/lib/schedule-time/day';

describe('todayInRiyadh', () => {
  it('uses the Riyadh calendar day, not UTC', () => {
    expect(todayInRiyadh(new Date('2026-03-10T21:30:00Z'))).toBe('2026-03-11');
  });

  it('stays on the same day just before the Riyadh rollover', () => {
    expect(todayInRiyadh(new Date('2026-03-10T20:30:00Z'))).toBe('2026-03-10');
  });
});

describe('addDays', () => {
  it('moves forward and backward across month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('dayOfWeek', () => {
  it('returns 0 for Sunday, matching PostgreSQL DOW', () => {
    expect(dayOfWeek('2026-08-02')).toBe(0);
    expect(dayOfWeek('2026-08-07')).toBe(5);
  });
});

describe('daysBetween', () => {
  it('counts calendar days in both directions', () => {
    expect(daysBetween('2026-08-02', '2026-08-05')).toBe(3);
    expect(daysBetween('2026-08-05', '2026-08-02')).toBe(-3);
  });
});

describe('backfillWindow', () => {
  const now = new Date('2026-08-10T09:00:00Z');

  it('spans backfill_days before today', () => {
    const w = backfillWindow({ start_date: '2026-08-01', end_date: null, backfill_days: 3 }, now);
    expect(w).toEqual({ earliest: '2026-08-07', latest: '2026-08-10' });
  });

  it('never reaches before the schedule start date', () => {
    const w = backfillWindow({ start_date: '2026-08-09', end_date: null, backfill_days: 5 }, now);
    expect(w.earliest).toBe('2026-08-09');
  });

  it('never reaches past the schedule end date', () => {
    const w = backfillWindow(
      { start_date: '2026-08-01', end_date: '2026-08-08', backfill_days: 3 },
      now,
    );
    expect(w.latest).toBe('2026-08-08');
  });

  it('treats backfill_days of 0 as today only', () => {
    const w = backfillWindow({ start_date: '2026-08-01', end_date: null, backfill_days: 0 }, now);
    expect(w).toEqual({ earliest: '2026-08-10', latest: '2026-08-10' });
  });
});

describe('isWithinBackfill', () => {
  const now = new Date('2026-08-10T09:00:00Z');
  const schedule = { start_date: '2026-08-01', end_date: null, backfill_days: 3 };

  it('accepts today and the edge of the window', () => {
    expect(isWithinBackfill(schedule, '2026-08-10', now)).toBe(true);
    expect(isWithinBackfill(schedule, '2026-08-07', now)).toBe(true);
  });

  it('rejects one day past the window and any future day', () => {
    expect(isWithinBackfill(schedule, '2026-08-06', now)).toBe(false);
    expect(isWithinBackfill(schedule, '2026-08-11', now)).toBe(false);
  });
});

describe('scheduleDayRange', () => {
  const now = new Date('2026-08-10T09:00:00Z');

  it('runs start to end for a closed schedule', () => {
    const days = scheduleDayRange({ start_date: '2026-08-01', end_date: '2026-08-03' }, now);
    expect(days).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
  });

  it('runs start to today for an open-ended schedule', () => {
    const days = scheduleDayRange({ start_date: '2026-08-08', end_date: null }, now);
    expect(days).toEqual(['2026-08-08', '2026-08-09', '2026-08-10']);
  });

  it('returns an empty array for a schedule that has not started', () => {
    expect(scheduleDayRange({ start_date: '2026-09-01', end_date: null }, now)).toEqual([]);
  });
});

describe('lockReason', () => {
  const now = new Date('2026-08-10T09:00:00Z');
  const live = {
    status: 'active',
    start_date: '2026-08-01',
    end_date: null,
    backfill_days: 3,
  };

  it('gives no reason for a day still inside the window', () => {
    expect(lockReason(live, '2026-08-10', now)).toBe(null);
    expect(lockReason(live, '2026-08-07', now)).toBe(null);
  });

  it('calls a day that has not arrived future, not a missed deadline', () => {
    expect(lockReason(live, '2026-08-11', now)).toBe('future');
  });

  it('separates before the start from past the backfill window', () => {
    expect(lockReason(live, '2026-07-31', now)).toBe('before_start');
    expect(lockReason(live, '2026-08-06', now)).toBe('backfill_closed');
  });

  it('reports a day after a finished trip as after_end', () => {
    const ended = { ...live, end_date: '2026-08-05' };
    expect(lockReason(ended, '2026-08-08', now)).toBe('after_end');
  });

  it('lets archiving outrank every other reason', () => {
    expect(lockReason({ ...live, status: 'archived' }, '2026-08-10', now)).toBe('archived');
  });
});
