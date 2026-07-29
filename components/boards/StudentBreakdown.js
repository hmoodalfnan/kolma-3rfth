'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/manage/Panel';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchStudentQuestionBreakdown, fetchStudentGrants } from '@/lib/boards/queries';

/**
 * Where one student's points came from.
 *
 * A leaderboard answers "who is ahead" and nothing else. This answers the
 * question that follows it — which items they actually kept up, and what
 * grading points they were given and why.
 */
export function StudentBreakdown({ student, scheduleId, onClose }) {
  const [items, setItems] = useState(null);
  const [grants, setGrants] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!student) return undefined;
    let alive = true;

    setItems(null);
    setGrants(null);
    setError('');

    const client = getBrowserClient();
    Promise.all([
      fetchStudentQuestionBreakdown(client, { scheduleId, studentId: student.student_id }),
      fetchStudentGrants(client, { studentId: student.student_id }),
    ])
      .then(([q, g]) => {
        if (!alive) return;
        setItems(q);
        setGrants(g);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
        setItems([]);
        setGrants([]);
      });

    return () => {
      alive = false;
    };
  }, [student, scheduleId]);

  const best = items?.reduce((max, i) => Math.max(max, Number(i.points)), 0) || 1;

  return (
    <Modal
      open={Boolean(student)}
      onClose={onClose}
      title={student?.full_name}
      description={student ? `${student.group_name ?? 'بدون مجموعة'} · الإجمالي ${Number(student.total_points)} نقطة` : undefined}
      error={error}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <Stat label="نقاط البنود" value={Number(student?.answer_points ?? 0)} />
        <Stat label="نقاط التقييم" value={Number(student?.grant_points ?? 0)} />
        <Stat label="بنود مكتملة" value={Number(student?.completed_items ?? 0)} />
      </div>

      <h3 className="mt-5 text-sm font-bold text-brand">تفصيل البنود</h3>
      {items === null ? (
        <SkeletonList rows={6} />
      ) : items.length === 0 ? (
        <EmptyState>لم يُسجَّل أي بند بعد.</EmptyState>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item.question_id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {item.question_title}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-brand">
                  {Number(item.points)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">أُنجز {item.times_completed} مرة</p>
              {/* Relative to this student's own best item, so the bars compare
                  their habits with each other rather than with the group. */}
              <span className="mt-1 block h-1.5 rounded-full bg-line" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-gold-500"
                  style={{ width: `${Math.max(2, (Number(item.points) / best) * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-5 text-sm font-bold text-brand">نقاط التقييم</h3>
      {grants === null ? (
        <SkeletonList rows={3} />
      ) : grants.length === 0 ? (
        <EmptyState>لا توجد نقاط تقييم.</EmptyState>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {grants.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{g.criteria?.name ?? 'تقييم'}</span>
                {g.note && <span className="block text-xs text-muted">{g.note}</span>}
              </span>
              <span
                className={`shrink-0 font-bold tabular-nums ${
                  Number(g.points) < 0 ? 'text-rose-600' : 'text-ok-ink'
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
    </Modal>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-line p-3 text-center">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-brand">{value}</p>
    </div>
  );
}
