import { describe, it, expect } from 'vitest';
import { validateValue } from '@/lib/questions/value-schema';

const q = (type, config) => ({ type, config });

describe('validateValue', () => {
  it('accepts booleans for bool and rejects anything else', () => {
    expect(validateValue(q('bool', {}), true).ok).toBe(true);
    expect(validateValue(q('bool', {}), false).ok).toBe(true);
    expect(validateValue(q('bool', {}), 'true').ok).toBe(false);
    expect(validateValue(q('bool', {}), 1).ok).toBe(false);
  });

  it('accepts a per_prayer map limited to the configured prayers', () => {
    const question = q('per_prayer', { prayers: ['fajr', 'isha'], points_per_prayer: 2 });
    expect(validateValue(question, { fajr: true, isha: false }).ok).toBe(true);
    expect(validateValue(question, { fajr: true, asr: true }).ok).toBe(false);
  });

  it('accepts only a configured option id for single_choice', () => {
    const question = q('single_choice', {
      options: [
        { id: 'walk', label: 'مشي', points: 5 },
        { id: 'car', label: 'بسيارة', points: 2 },
      ],
    });
    expect(validateValue(question, 'walk').ok).toBe(true);
    expect(validateValue(question, 'plane').ok).toBe(false);
    expect(validateValue(question, ['walk']).ok).toBe(false);
  });

  it('accepts a deduplicated subset of option ids for multi_choice', () => {
    const question = q('multi_choice', {
      options: [
        { id: 'a', label: 'أ', points: 1 },
        { id: 'b', label: 'ب', points: 1 },
      ],
    });
    expect(validateValue(question, ['a', 'b']).ok).toBe(true);
    expect(validateValue(question, []).ok).toBe(true);
    expect(validateValue(question, ['a', 'a']).ok).toBe(false);
    expect(validateValue(question, ['a', 'z']).ok).toBe(false);
  });

  it('bounds counter values to the configured max', () => {
    const question = q('counter', { points_per_unit: 1, max: 10 });
    expect(validateValue(question, 0).ok).toBe(true);
    expect(validateValue(question, 10).ok).toBe(true);
    expect(validateValue(question, 11).ok).toBe(false);
    expect(validateValue(question, -1).ok).toBe(false);
    expect(validateValue(question, 2.5).ok).toBe(false);
  });

  it('bounds rating values to the configured star count', () => {
    const question = q('rating', { max: 5, points_per_star: 1 });
    expect(validateValue(question, 5).ok).toBe(true);
    expect(validateValue(question, 6).ok).toBe(false);
    expect(validateValue(question, 0).ok).toBe(true);
  });

  it('bounds text length', () => {
    const question = q('text', { max_length: 10 });
    expect(validateValue(question, 'قصير').ok).toBe(true);
    expect(validateValue(question, 'x'.repeat(11)).ok).toBe(false);
  });

  it('rejects a value for an unknown type', () => {
    expect(validateValue(q('freeform', {}), 'x').ok).toBe(false);
  });
});
