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
 */
export function BoardTable({ columns, rows, loading, sortKey, sortDir = 'desc', onSort, empty }) {
  if (loading) return <SkeletonList rows={10} />;
  if (!rows || rows.length === 0) return <EmptyState>{empty ?? 'لا توجد نتائج.'}</EmptyState>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-right text-sm">
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
  );
}
