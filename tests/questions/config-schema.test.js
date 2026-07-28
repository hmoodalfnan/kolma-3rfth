import { describe, it, expect } from 'vitest';
import { QUESTION_TYPES, parseConfig } from '@/lib/questions/config-schema';

describe('QUESTION_TYPES', () => {
  it('contains exactly the seven supported types', () => {
    expect([...QUESTION_TYPES]).toEqual([
      'bool',
      'per_prayer',
      'single_choice',
      'multi_choice',
      'counter',
      'rating',
      'text',
    ]);
  });
});

describe('parseConfig', () => {
  it('accepts an empty config for bool and text', () => {
    expect(parseConfig('bool', {}).ok).toBe(true);
    expect(parseConfig('text', {}).ok).toBe(true);
  });

  it('accepts a per_prayer config and defaults to all five prayers', () => {
    const res = parseConfig('per_prayer', { points_per_prayer: 3 });
    expect(res.ok).toBe(true);
    expect(res.data.prayers).toEqual(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);
    expect(res.data.points_per_prayer).toBe(3);
  });

  it('rejects a per_prayer config naming an unknown prayer', () => {
    const res = parseConfig('per_prayer', { prayers: ['fajr', 'tahajjud'], points_per_prayer: 1 });
    expect(res.ok).toBe(false);
  });

  it('accepts choice options carrying negative points', () => {
    const res = parseConfig('single_choice', {
      options: [
        { id: 'walk', label: 'مشي', points: 5 },
        { id: 'car', label: 'بسيارة', points: 2 },
        { id: 'none', label: 'لم أذهب', points: -2 },
      ],
    });
    expect(res.ok).toBe(true);
    expect(res.data.options).toHaveLength(3);
  });

  it('rejects duplicate option ids', () => {
    const res = parseConfig('multi_choice', {
      options: [
        { id: 'a', label: 'أ', points: 1 },
        { id: 'a', label: 'ب', points: 2 },
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/مكرر/);
  });

  it('rejects a choice config with no options', () => {
    expect(parseConfig('single_choice', { options: [] }).ok).toBe(false);
  });

  it('accepts a counter config and rejects a non-positive max', () => {
    expect(parseConfig('counter', { points_per_unit: 2, max: 20, unit_label: 'صفحة' }).ok).toBe(true);
    expect(parseConfig('counter', { points_per_unit: 2, max: 0 }).ok).toBe(false);
  });

  it('caps rating stars at 10 and requires at least 2', () => {
    expect(parseConfig('rating', { max: 5, points_per_star: 1 }).ok).toBe(true);
    expect(parseConfig('rating', { max: 1, points_per_star: 1 }).ok).toBe(false);
    expect(parseConfig('rating', { max: 11, points_per_star: 1 }).ok).toBe(false);
  });

  it('rejects an unknown question type', () => {
    expect(parseConfig('freeform', {}).ok).toBe(false);
  });

  it('strips unknown keys rather than trusting them', () => {
    const res = parseConfig('bool', { evil: 'x' });
    expect(res.ok).toBe(true);
    expect(res.data.evil).toBeUndefined();
  });
});
