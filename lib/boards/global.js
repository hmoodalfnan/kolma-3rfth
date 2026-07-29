'use client';

import { friendlyError } from '@/lib/errors/friendly';

/** Mirror of the SQL normalize_ar_name so client-side grouping agrees with the view. */
export function normalizeName(name) {
  return String(name ?? '')
    .replace(/[ـً-ْٰ]/g, '') // tatweel + harakat
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/\s+/g, ' ')
    .trim();
}

const SORTABLE = new Set([
  'total_points',
  'answer_points',
  'grant_points',
  'completed_items',
  'full_name',
  'group_name',
  'schedule_name',
]);

/**
 * The super-admin board. Every filter is optional and they compose;
 * `groupBy` decides whether rows stay per-student or roll up.
 */
export async function fetchGlobalBoard(
  client,
  {
    scheduleIds = [],
    groupIds = [],
    groupBy = 'student',
    sortKey = 'total_points',
    sortDir = 'desc',
    limit = 1000,
  } = {},
) {
  let query = client.from('v_global_student_totals').select('*');

  if (scheduleIds.length > 0) query = query.in('schedule_id', scheduleIds);
  if (groupIds.length > 0) query = query.in('group_id', groupIds);

  const orderKey = SORTABLE.has(sortKey) ? sortKey : 'total_points';
  const { data, error } = await query
    .order(orderKey, { ascending: sortDir === 'asc' })
    .order('full_name', { ascending: true })
    .limit(limit);

  if (error) throw new Error(friendlyError(error));

  const rows = data ?? [];
  if (groupBy === 'student') return { rows, totals: summarise(rows) };

  return { rows: rollUp(rows, groupBy, sortKey, sortDir), totals: summarise(rows) };
}

function summarise(rows) {
  return {
    students: rows.length,
    points: rows.reduce((sum, r) => sum + Number(r.total_points ?? 0), 0),
    schedules: new Set(rows.map((r) => r.schedule_id)).size,
  };
}

function rollUp(rows, groupBy, sortKey, sortDir) {
  const keyOf = (row) => {
    if (groupBy === 'name') return row.normalized_name ?? normalizeName(row.full_name);
    if (groupBy === 'group') return `${row.schedule_id}|${row.group_id ?? 'none'}`;
    return row.schedule_id;
  };

  const labelOf = (row) => {
    if (groupBy === 'name') return row.full_name;
    if (groupBy === 'group') return `${row.group_name ?? 'بدون مجموعة'} — ${row.schedule_name}`;
    return row.schedule_name;
  };

  const buckets = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!buckets.has(key)) {
      buckets.set(key, {
        id: key,
        label: labelOf(row),
        full_name: labelOf(row),
        group_name: row.group_name ?? '—',
        schedule_name: groupBy === 'name' ? 'عدة رحلات' : row.schedule_name,
        members: 0,
        answer_points: 0,
        grant_points: 0,
        total_points: 0,
        completed_items: 0,
        schedules: new Set(),
      });
    }

    const bucket = buckets.get(key);
    bucket.members += 1;
    bucket.answer_points += Number(row.answer_points ?? 0);
    bucket.grant_points += Number(row.grant_points ?? 0);
    bucket.total_points += Number(row.total_points ?? 0);
    bucket.completed_items += Number(row.completed_items ?? 0);
    bucket.schedules.add(row.schedule_id);
  }

  const out = [...buckets.values()].map((b) => ({
    ...b,
    schedule_count: b.schedules.size,
    schedule_name: groupBy === 'name' && b.schedules.size === 1 ? b.schedule_name : b.schedule_name,
    schedules: undefined,
  }));

  const dir = sortDir === 'asc' ? 1 : -1;
  const key = SORTABLE.has(sortKey) ? sortKey : 'total_points';
  return out.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av ?? '').localeCompare(String(bv ?? ''), 'ar') * dir;
  });
}
