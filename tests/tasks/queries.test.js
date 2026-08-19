import { describe, it, expect } from 'vitest';
import { programToday, earnedAssignments } from '@/lib/tasks/queries';

describe('programToday', () => {
  it('formats a known instant in Asia/Riyadh as YYYY-MM-DD', () => {
    // 2026-08-19T21:30:00Z is 2026-08-20 00:30 in Riyadh (+03).
    const d = new Date('2026-08-19T21:30:00Z');
    expect(programToday('Asia/Riyadh', d)).toBe('2026-08-20');
  });

  it('falls back to a UTC date on a bad timezone', () => {
    const d = new Date('2026-08-19T10:00:00Z');
    expect(programToday('Not/AZone', d)).toBe('2026-08-19');
  });
});

describe('earnedAssignments', () => {
  it('sums points of completed assignments', () => {
    const a = [
      { id: 'r', points: 8 },
      { id: 'l', points: 4 },
    ];
    expect(earnedAssignments(a, new Set(['r']))).toBe(8);
  });
});
