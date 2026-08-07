import { describe, it, expect } from 'vitest';
import { buildGroupRows } from '@/lib/boards/group-metrics';

const groups = [
  { group_id: 'g1', group_name: 'أ', member_count: 2, total_points: 100, group_points: 0 },
  { group_id: 'g2', group_name: 'ب', member_count: 5, total_points: 150, group_points: 0 },
];
const students = [
  { student_id: 's1', group_id: 'g1', total_points: 50 },
  { student_id: 's2', group_id: 'g1', total_points: 50 },
  { student_id: 's3', group_id: 'g2', total_points: 30 },
];

describe('buildGroupRows', () => {
  it('computes average as total over member count', () => {
    const rows = buildGroupRows({ groups, students, metric: 'total_points' });
    const g1 = rows.find((r) => r.group_id === 'g1');
    expect(g1.avg_points).toBe(50);
  });

  it('ranks by total when metric is total_points', () => {
    const rows = buildGroupRows({ groups, students, metric: 'total_points' });
    expect(rows.map((r) => r.group_id)).toEqual(['g2', 'g1']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('ranks by average when metric is avg_points (small strong group wins)', () => {
    const rows = buildGroupRows({ groups, students, metric: 'avg_points' });
    // g1 avg 50 > g2 avg 30
    expect(rows.map((r) => r.group_id)).toEqual(['g1', 'g2']);
  });

  it('adds an ungrouped bucket for loose students and flags it', () => {
    const rows = buildGroupRows({
      groups,
      students: [...students, { student_id: 's9', group_id: null, total_points: 200 }],
      metric: 'avg_points',
    });
    const loose = rows.find((r) => r.ungrouped);
    expect(loose).toBeTruthy();
    expect(loose.member_count).toBe(1);
    expect(loose.avg_points).toBe(200);
  });

  it('never divides by zero for an empty group', () => {
    const rows = buildGroupRows({
      groups: [{ group_id: 'g0', group_name: 'ف', member_count: 0, total_points: 0, group_points: 0 }],
      students: [],
      metric: 'avg_points',
    });
    expect(rows[0].avg_points).toBe(0);
  });
});
