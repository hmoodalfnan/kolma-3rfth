import { describe, it, expect } from 'vitest';
import { scoreAnswer, maxPoints, completionPct } from '@/lib/points/score';

const boolQ = { id: 'q1', type: 'bool', config: {}, points: 5 };
const prayerQ = {
  id: 'q2',
  type: 'per_prayer',
  config: { prayers: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'], points_per_prayer: 2 },
  points: 0,
};
const singleQ = {
  id: 'q3',
  type: 'single_choice',
  config: {
    options: [
      { id: 'walk', label: 'مشي', points: 5 },
      { id: 'car', label: 'بسيارة', points: 2 },
      { id: 'none', label: 'لم أذهب', points: -2 },
    ],
  },
  points: 0,
};
const multiQ = {
  id: 'q4',
  type: 'multi_choice',
  config: {
    options: [
      { id: 'a', label: 'أ', points: 3 },
      { id: 'b', label: 'ب', points: 4 },
      { id: 'c', label: 'ج', points: -1 },
    ],
  },
  points: 0,
};
const counterQ = { id: 'q5', type: 'counter', config: { points_per_unit: 2, max: 10 }, points: 0 };
const ratingQ = { id: 'q6', type: 'rating', config: { max: 5, points_per_star: 3 }, points: 0 };
const textQ = { id: 'q7', type: 'text', config: { max_length: 500 }, points: 0 };

describe('scoreAnswer', () => {
  it('awards flat points for a checked bool and zero otherwise', () => {
    expect(scoreAnswer(boolQ, true)).toBe(5);
    expect(scoreAnswer(boolQ, false)).toBe(0);
  });

  it('awards per-prayer points only for configured prayers marked true', () => {
    expect(scoreAnswer(prayerQ, { fajr: true, dhuhr: true, asr: false })).toBe(4);
    expect(scoreAnswer(prayerQ, { fajr: true, tahajjud: true })).toBe(2);
    expect(scoreAnswer(prayerQ, {})).toBe(0);
  });

  it('awards the chosen option points, including negatives', () => {
    expect(scoreAnswer(singleQ, 'walk')).toBe(5);
    expect(scoreAnswer(singleQ, 'none')).toBe(-2);
    expect(scoreAnswer(singleQ, 'unknown')).toBe(0);
  });

  it('sums the selected option points for multi_choice', () => {
    expect(scoreAnswer(multiQ, ['a', 'b'])).toBe(7);
    expect(scoreAnswer(multiQ, ['a', 'c'])).toBe(2);
    expect(scoreAnswer(multiQ, [])).toBe(0);
  });

  it('multiplies counter values and clamps to the configured max', () => {
    expect(scoreAnswer(counterQ, 4)).toBe(8);
    expect(scoreAnswer(counterQ, 99)).toBe(20);
    expect(scoreAnswer(counterQ, -5)).toBe(0);
  });

  it('multiplies rating stars and clamps to the configured max', () => {
    expect(scoreAnswer(ratingQ, 4)).toBe(12);
    expect(scoreAnswer(ratingQ, 9)).toBe(15);
  });

  it('always scores text as zero', () => {
    expect(scoreAnswer(textQ, 'أي نص')).toBe(0);
  });

  it('scores a null or undefined value as zero for every type', () => {
    for (const q of [boolQ, prayerQ, singleQ, multiQ, counterQ, ratingQ, textQ]) {
      expect(scoreAnswer(q, null)).toBe(0);
      expect(scoreAnswer(q, undefined)).toBe(0);
    }
  });

  it('scores an unknown type as zero rather than throwing', () => {
    expect(scoreAnswer({ type: 'freeform', config: {}, points: 9 }, 'x')).toBe(0);
  });
});

describe('maxPoints', () => {
  it('returns the best achievable score per type', () => {
    expect(maxPoints(boolQ)).toBe(5);
    expect(maxPoints(prayerQ)).toBe(10);
    expect(maxPoints(singleQ)).toBe(5);
    expect(maxPoints(multiQ)).toBe(7);
    expect(maxPoints(counterQ)).toBe(20);
    expect(maxPoints(ratingQ)).toBe(15);
    expect(maxPoints(textQ)).toBe(0);
  });

  it('never returns a negative maximum when every option is negative', () => {
    const q = {
      type: 'single_choice',
      config: {
        options: [
          { id: 'a', label: 'أ', points: -1 },
          { id: 'b', label: 'ب', points: -3 },
        ],
      },
      points: 0,
    };
    expect(maxPoints(q)).toBe(0);
  });
});

describe('completionPct', () => {
  it('is the ratio of earned to achievable points', () => {
    const pct = completionPct([boolQ, prayerQ], { q1: true, q2: { fajr: true } });
    expect(pct).toBe(46.7);
  });

  it('excludes zero-max questions such as text from the denominator', () => {
    expect(completionPct([boolQ, textQ], { q1: true, q7: 'ملاحظة' })).toBe(100);
  });

  it('floors at zero when negative options outweigh the positives', () => {
    expect(completionPct([singleQ], { q3: 'none' })).toBe(0);
  });

  it('returns zero for an empty question list rather than dividing by zero', () => {
    expect(completionPct([], {})).toBe(0);
  });
});
