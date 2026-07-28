import { describe, it, expect, vi } from 'vitest';
import { fetchStudentTotals, fetchGroupTotals, rankRows } from '@/lib/boards/queries';

function fakeClient(rows = []) {
  const calls = { eq: [], order: [] };
  const builder = {
    select: () => builder,
    eq: (col, val) => {
      calls.eq.push([col, val]);
      return builder;
    },
    order: (col, opts) => {
      calls.order.push([col, opts?.ascending]);
      return builder;
    },
    limit: () => Promise.resolve({ data: rows, error: null }),
    then: (resolve) => resolve({ data: rows, error: null }),
  };
  return { client: { from: () => builder }, calls };
}

describe('fetchStudentTotals', () => {
  it('filters by schedule and sorts by points then name', async () => {
    const { client, calls } = fakeClient([]);
    await fetchStudentTotals(client, { scheduleId: 'sch1' });

    expect(calls.eq).toEqual([['schedule_id', 'sch1']]);
    expect(calls.order).toEqual([
      ['total_points', false],
      ['full_name', true],
    ]);
  });

  it('adds a group filter only when a group is supplied', async () => {
    const withGroup = fakeClient([]);
    await fetchStudentTotals(withGroup.client, { scheduleId: 'sch1', groupId: 'g1' });
    expect(withGroup.calls.eq).toContainEqual(['group_id', 'g1']);

    const withoutGroup = fakeClient([]);
    await fetchStudentTotals(withoutGroup.client, { scheduleId: 'sch1' });
    expect(withoutGroup.calls.eq.map(([c]) => c)).not.toContain('group_id');
  });

  it('propagates a query error rather than returning partial data', async () => {
    const failing = {
      from: () => {
        const b = {
          select: () => b,
          eq: () => b,
          order: () => b,
          limit: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
        };
        return b;
      },
    };
    await expect(fetchStudentTotals(failing, { scheduleId: 'x' })).rejects.toBeTruthy();
  });
});

describe('fetchGroupTotals', () => {
  it('filters by schedule and sorts descending', async () => {
    const { client, calls } = fakeClient([]);
    await fetchGroupTotals(client, { scheduleId: 'sch1' });
    expect(calls.eq).toEqual([['schedule_id', 'sch1']]);
    expect(calls.order).toEqual([['total_points', false]]);
  });
});

describe('rankRows', () => {
  it('numbers rows from one', () => {
    const ranked = rankRows([{ total_points: 10 }, { total_points: 8 }, { total_points: 5 }]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('gives tied rows the same rank and skips the next', () => {
    const ranked = rankRows([
      { total_points: 10 },
      { total_points: 10 },
      { total_points: 4 },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('handles an empty list', () => {
    expect(rankRows([])).toEqual([]);
  });
});
