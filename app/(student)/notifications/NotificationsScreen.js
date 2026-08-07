'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchStudentGrants } from '@/lib/boards/queries';
import { markSeen } from '@/lib/student/notifications';
import { useStudentContext } from '@/lib/student/useStudentContext';
import { formatDayArabic } from '@/lib/schedule-time/day';

export function NotificationsScreen() {
  const ctx = useStudentContext();
  const studentId = ctx.student?.id;
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!studentId) return undefined;
    let alive = true;
    fetchStudentGrants(getBrowserClient(), { studentId }).then((data) => {
      if (!alive) return;
      setRows(data);
      // Opening the tab clears the badge.
      markSeen(studentId);
    });
    return () => {
      alive = false;
    };
  }, [studentId]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-brand">التنبيهات</h1>

      {rows === null ? (
        <p className="text-sm text-muted">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-line p-6 text-center text-sm text-muted">
          لا توجد تنبيهات بعد. ستظهر هنا نقاط المشرفين ومنها سبب كل تقييم.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((g) => (
            <li key={g.id} className="card flex flex-wrap items-center gap-2 p-4 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{g.criteria?.name ?? 'تقييم'}</span>
                {g.note && <span className="block break-words text-xs text-muted">{g.note}</span>}
                <span className="mt-0.5 block text-xs text-muted">
                  {formatDayArabic(String(g.created_at).slice(0, 10))}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${
                  Number(g.points) < 0 ? 'bg-danger-soft text-danger-ink' : 'bg-ok text-ok-ink'
                }`}
                dir="ltr"
              >
                {Number(g.points) > 0 ? '+' : ''}
                {Number(g.points)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
