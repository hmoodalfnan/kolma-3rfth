import { describe, it, expect } from 'vitest';
import { fetchGlobalBoard, normalizeName } from '@/lib/boards/global';

function fakeClient(rows = []) {
  const calls = { in: [], order: [] };
  const builder = {
    select: () => builder,
    in: (c, v) => {
      calls.in.push([c, v]);
      return builder;
    },
    order: (c, o) => {
      calls.order.push([c, o?.ascending]);
      return builder;
    },
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return { client: { from: () => builder }, calls };
}

const row = (over) => ({
  student_id: 's1',
  schedule_id: 'sch1',
  group_id: 'g1',
  full_name: 'محمد علي',
  normalized_name: 'محمد علي',
  group_name: 'غرفة 101',
  schedule_name: 'رحلة أ',
  answer_points: 10,
  grant_points: 5,
  total_points: 15,
  completed_items: 4,
  ...over,
});

describe('normalizeName', () => {
  it('normalizes Arabic names for cross-schedule aggregation', () => {
    expect(normalizeName('مُحَمَّد  علي')).toBe(normalizeName('محمد علي'));
    expect(normalizeName('محمـــد علي')).toBe(normalizeName('محمد علي'));
    expect(normalizeName('  أحمد ')).toBe(normalizeName('احمد'));
  });

  it('keeps genuinely different names apart', () => {
    expect(normalizeName('محمد علي')).not.toBe(normalizeName('محمود علي'));
  });
});

describe('fetchGlobalBoard', () => {
  it('applies no constraint when no filter is given', async () => {
    const { client, calls } = fakeClient([]);
    await fetchGlobalBoard(client, {});
    expect(calls.in).toEqual([]);
  });

  it('composes schedule and group filters', async () => {
    const { client, calls } = fakeClient([]);
    await fetchGlobalBoard(client, { scheduleIds: ['a', 'b'], groupIds: ['g1'] });
    expect(calls.in).toContainEqual(['schedule_id', ['a', 'b']]);
    expect(calls.in).toContainEqual(['group_id', ['g1']]);
  });

  it('falls back to total_points for an unknown sort key', async () => {
    const { client, calls } = fakeClient([]);
    await fetchGlobalBoard(client, { sortKey: 'DROP TABLE students' });
    expect(calls.order[0][0]).toBe('total_points');
  });

  it('honours ascending order when asked', async () => {
    const { client, calls } = fakeClient([]);
    await fetchGlobalBoard(client, { sortKey: 'total_points', sortDir: 'asc' });
    expect(calls.order[0]).toEqual(['total_points', true]);
  });

  it('returns per-student rows by default', async () => {
    const { client } = fakeClient([row(), row({ student_id: 's2', full_name: 'أحمد' })]);
    const { rows } = await fetchGlobalBoard(client, {});
    expect(rows).toHaveLength(2);
  });

  it('rolls up the same person across schedules when grouping by name', async () => {
    const { client } = fakeClient([
      row({ schedule_id: 'sch1', total_points: 15 }),
      row({ student_id: 's9', schedule_id: 'sch2', schedule_name: 'رحلة ب', total_points: 20 }),
      row({ student_id: 's3', full_name: 'أحمد', normalized_name: 'احمد', total_points: 7 }),
    ]);

    const { rows } = await fetchGlobalBoard(client, { groupBy: 'name' });

    expect(rows).toHaveLength(2);
    const merged = rows.find((r) => r.full_name === 'محمد علي');
    expect(merged.total_points).toBe(35);
    expect(merged.members).toBe(2);
    expect(merged.schedule_count).toBe(2);
  });

  it('rolls up by group within a schedule', async () => {
    const { client } = fakeClient([
      row({ student_id: 's1', group_id: 'g1', total_points: 10 }),
      row({ student_id: 's2', group_id: 'g1', total_points: 20 }),
      row({ student_id: 's3', group_id: 'g2', group_name: 'غرفة 102', total_points: 5 }),
    ]);

    const { rows } = await fetchGlobalBoard(client, { groupBy: 'group' });
    expect(rows).toHaveLength(2);
    expect(rows[0].total_points).toBe(30);
  });

  it('reports overall totals alongside the rows', async () => {
    const { client } = fakeClient([
      row({ total_points: 15 }),
      row({ student_id: 's2', schedule_id: 'sch2', total_points: 5 }),
    ]);
    const { totals } = await fetchGlobalBoard(client, {});
    expect(totals).toEqual({ students: 2, points: 20, schedules: 2 });
  });
});
