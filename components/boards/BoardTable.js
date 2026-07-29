'use client';

import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/manage/Panel';

const MEDALS = ['🥇', '🥈', '🥉'];

export function RankBadge({ rank }) {
  if (rank <= 3) {
    return (
      <span className="text-lg" aria-label={`المركز ${rank}`}>
        {MEDALS[rank - 1]}
      </span>
    );
  }
  return <span className="font-bold tabular-nums text-muted">{rank}</span>;
}

/**
 * Sortable table shared by every leaderboard.
 * `columns` is `[{ key, label, align, render, sortable }]`.
 *
 * `mobileCard(row, index)` is what a row looks like below 1024px. A leaderboard
 * is seven columns wide, which on a phone meant sideways scrolling past the
 * name to reach the score — the two things you actually came to compare. Where
 * a caller supplies it, phones get cards and the table starts at lg. Callers
 * that do not are left on the old horizontal scroll.
 */
export function BoardTable({
  columns,
  rows,
  loading,
  sortKey,
  sortDir = 'desc',
  onSort,
  empty,
  mobileCard,
}) {
  if (loading) return <SkeletonList rows={10} />;
  if (!rows || rows.length === 0) return <EmptyState>{empty ?? 'لا توجد نتائج.'}</EmptyState>;

  return (
    <>
      {mobileCard && (
        <ul className="space-y-2 lg:hidden">
          {rows.map((row, index) => (
            <li key={row.id ?? row.student_id ?? row.group_id ?? index}>
              {mobileCard(row, index)}
            </li>
          ))}
        </ul>
      )}

      <div className={mobileCard ? 'hidden overflow-x-auto lg:block' : 'overflow-x-auto'}>
      <table className={`w-full text-right text-sm ${mobileCard ? '' : 'min-w-[640px]'}`}>
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="p-2 font-semibold">
                {col.sortable === false || !onSort ? (
                  col.label
                ) : (
                  <button
                    type="button"
                    onClick={() => onSort(col.key)}
                    className="font-semibold hover:text-brand"
                    aria-label={`ترتيب حسب ${col.label}`}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span aria-hidden="true">{sortDir === 'desc' ? ' ↓' : ' ↑'}</span>
                    )}
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id ?? row.student_id ?? row.group_id ?? index} className="border-b border-line/60">
              {columns.map((col) => (
                <td key={col.key} className="p-2">
                  {col.render ? col.render(row, index) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
