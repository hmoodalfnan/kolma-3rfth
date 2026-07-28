'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { SkeletonList } from '@/components/ui/Skeleton';
import { fetchStudentTotals, rankRows } from '@/lib/boards/queries';
import { useStudentContext } from '@/lib/student/useStudentContext';

const MEDALS = ['🥇', '🥈', '🥉'];

export function StudentBoard() {
  const ctx = useStudentContext();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (ctx.status !== 'ready' || !ctx.schedule?.students_see_leaderboard) return;
    let alive = true;

    fetchStudentTotals(getBrowserClient(), { scheduleId: ctx.schedule.id })
      .then((data) => {
        if (alive) setRows(rankRows(data));
      })
      .catch(() => {
        if (alive) setRows([]);
      });

    return () => {
      alive = false;
    };
  }, [ctx.status, ctx.schedule]);

  if (ctx.status !== 'ready') return <SkeletonList rows={8} />;

  if (!ctx.schedule.students_see_leaderboard) {
    return (
      <div className="card p-6 text-center">
        <p className="font-semibold">لوحة الصدارة مخفية</p>
        <p className="mt-2 text-sm text-muted">أخفى المشرف الترتيب في هذه الرحلة.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold">لوحة الصدارة</h1>
        <p className="text-sm text-muted">{ctx.schedule.name}</p>
      </header>

      {rows === null ? (
        <SkeletonList rows={10} />
      ) : (
        <ol className="space-y-1.5">
          {rows.map((row) => {
            const isMe = row.student_id === ctx.student.id;
            return (
              <li
                key={row.student_id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  isMe ? 'border-accent bg-chip' : 'border-line bg-panel'
                }`}
              >
                <span className="w-8 shrink-0 text-center text-lg font-bold tabular-nums">
                  {row.rank <= 3 ? MEDALS[row.rank - 1] : row.rank}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{row.full_name}</span>
                  <span className="block truncate text-xs text-muted">
                    {row.group_name ?? 'بدون مجموعة'}
                  </span>
                </span>
                <span className="shrink-0 font-bold tabular-nums text-brand" dir="ltr">
                  {Number(row.total_points)}
                </span>
              </li>
            );
          })}
          {rows.length === 0 && (
            <li className="card p-6 text-center text-sm text-muted">لا توجد نتائج بعد.</li>
          )}
        </ol>
      )}
    </div>
  );
}
