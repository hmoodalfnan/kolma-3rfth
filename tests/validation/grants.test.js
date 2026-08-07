import { describe, it, expect } from 'vitest';
import { grantSchema } from '@/lib/validation/grants';

const base = {
  scheduleId: '11111111-1111-1111-1111-111111111111',
  criterionId: '22222222-2222-2222-2222-222222222222',
  points: 5,
};
const u = (n) =>
  `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-${n}${n}${n}${n}-${n}${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;

describe('grantSchema students variant', () => {
  it('accepts a list of student ids and defaults note to empty', () => {
    const parsed = grantSchema.safeParse({
      ...base,
      target: { kind: 'students', studentIds: [u('a'), u('b')] },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.target.studentIds).toHaveLength(2);
    expect(parsed.data.note).toBe('');
  });

  it('deduplicates repeated ids', () => {
    const parsed = grantSchema.safeParse({
      ...base,
      target: { kind: 'students', studentIds: [u('a'), u('a'), u('b')] },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.target.studentIds).toEqual([u('a'), u('b')]);
  });

  it('rejects an empty id list', () => {
    const parsed = grantSchema.safeParse({
      ...base,
      target: { kind: 'students', studentIds: [] },
    });
    expect(parsed.success).toBe(false);
  });

  it('still accepts the single-student variant', () => {
    const parsed = grantSchema.safeParse({
      ...base,
      target: { kind: 'student', studentId: u('a') },
    });
    expect(parsed.success).toBe(true);
  });
});
