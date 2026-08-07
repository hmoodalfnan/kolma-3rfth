import { rankRows } from '@/lib/boards/queries';

const UNGROUPED = '__ungrouped__';
const avg = (total, count) => (count ? Math.round((Number(total) / count) * 10) / 10 : 0);

/**
 * Group rows with a fair per-student average and a ranking driven by the
 * chosen metric. Average divides the group's whole score (student points plus
 * collective awards) by head-count, so a small strong group is not buried under
 * a big average one. Loose students fold into a synthetic bucket so they still
 * appear.
 */
export function buildGroupRows({ groups, students, metric }) {
  const rows = groups.map((g) => ({
    group_id: g.group_id,
    group_name: g.group_name,
    member_count: Number(g.member_count) || 0,
    total_points: Number(g.total_points) || 0,
    group_points: Number(g.group_points) || 0,
    avg_points: avg(g.total_points, Number(g.member_count) || 0),
    ungrouped: false,
  }));

  const loose = students.filter((s) => !s.group_id);
  if (loose.length > 0) {
    const total = loose.reduce((sum, s) => sum + Number(s.total_points), 0);
    rows.push({
      group_id: UNGROUPED,
      group_name: 'بدون مجموعة',
      member_count: loose.length,
      total_points: total,
      group_points: 0,
      avg_points: avg(total, loose.length),
      ungrouped: true,
    });
  }

  const key = metric === 'avg_points' ? 'avg_points' : 'total_points';
  const sorted = [...rows].sort((a, b) => b[key] - a[key]);
  return rankRows(sorted, key);
}

export { UNGROUPED };
