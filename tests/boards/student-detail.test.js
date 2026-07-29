import { describe, it, expect } from 'vitest';
import { buildStudentDetail } from '@/lib/boards/student-detail';

const schedule = {
  id: 's1',
  start_date: '2026-07-27',
  end_date: null,
  streak_threshold_pct: 100,
};

const NOW = new Date('2026-07-29T12:00:00+03:00');

const boolQuestion = {
  id: 'q-bool',
  schedule_id: 's1',
  title: 'سنة المغرب',
  section: 'السنن الرواتب',
  type: 'bool',
  config: {},
  points: 5,
  sort_order: 1,
};

const prayerQuestion = {
  id: 'q-prayer',
  schedule_id: 's1',
  title: 'تكبيرة الإحرام مع الإمام',
  section: 'تكبيرة الإحرام',
  type: 'per_prayer',
  config: { prayers: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'], points_per_prayer: 5 },
  points: 0,
  sort_order: 2,
};

describe('buildStudentDetail — per-question progress', () => {
  it('shows a five-point deed done once as 100%, not as a fraction of a bigger item', () => {
    const detail = buildStudentDetail({
      schedule,
      questions: [boolQuestion, prayerQuestion],
      answers: [
        { question_id: 'q-bool', entry_date: '2026-07-29', value: true, points: 5 },
        {
          question_id: 'q-prayer',
          entry_date: '2026-07-29',
          value: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
          points: 25,
        },
      ],
      now: NOW,
    });

    const bool = detail.perQuestion.find((q) => q.id === 'q-bool');
    expect(bool.earned).toBe(5);
    expect(bool.pct).toBe(100);
  });

  it('explains a 25 as five prayers out of five', () => {
    const detail = buildStudentDetail({
      schedule,
      questions: [prayerQuestion],
      answers: [
        {
          question_id: 'q-prayer',
          entry_date: '2026-07-29',
          value: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
          points: 25,
        },
      ],
      now: NOW,
    });

    const item = detail.perQuestion[0];
    expect(item.earned).toBe(25);
    expect(item.pct).toBe(100);
    expect(item.prayers.ticked).toBe(5);
    expect(item.prayers.possible).toBe(5);
    expect(item.prayers.perPrayerPoints).toBe(5);
  });

  it('reports a partial per-prayer day honestly', () => {
    const detail = buildStudentDetail({
      schedule,
      questions: [prayerQuestion],
      answers: [
        {
          question_id: 'q-prayer',
          entry_date: '2026-07-29',
          value: { fajr: true, dhuhr: true, asr: false, maghrib: false, isha: false },
          points: 10,
        },
      ],
      now: NOW,
    });

    const item = detail.perQuestion[0];
    expect(item.pct).toBe(40);
    expect(item.prayers.ticked).toBe(2);
    expect(item.prayers.counts.asr).toBe(0);
  });
});

describe('buildStudentDetail — days', () => {
  it('marks a day with nothing recorded as untouched and missed', () => {
    const detail = buildStudentDetail({
      schedule,
      questions: [boolQuestion],
      answers: [{ question_id: 'q-bool', entry_date: '2026-07-29', value: true, points: 5 }],
      now: NOW,
    });

    const byDay = Object.fromEntries(detail.days.map((d) => [d.day, d]));
    expect(byDay['2026-07-29'].met).toBe(true);
    expect(byDay['2026-07-28'].met).toBe(false);
    expect(byDay['2026-07-28'].untouched).toBe(true);
    expect(detail.missedCount).toBe(2); // the 27th and the 28th
  });

  it('names what was left undone on a partial day', () => {
    const detail = buildStudentDetail({
      schedule,
      questions: [boolQuestion, prayerQuestion],
      answers: [{ question_id: 'q-bool', entry_date: '2026-07-29', value: true, points: 5 }],
      now: NOW,
    });

    const today = detail.days.find((d) => d.day === '2026-07-29');
    expect(today.met).toBe(false);
    expect(today.missing.map((m) => m.title)).toEqual(['تكبيرة الإحرام مع الإمام']);
  });

  it('counts a streak of consecutive complete days', () => {
    const full = (date) => [
      { question_id: 'q-bool', entry_date: date, value: true, points: 5 },
    ];

    const detail = buildStudentDetail({
      schedule,
      questions: [boolQuestion],
      answers: [...full('2026-07-29'), ...full('2026-07-28'), ...full('2026-07-27')],
      now: NOW,
    });

    expect(detail.streak).toBe(3);
    expect(detail.missedCount).toBe(0);
  });
});
