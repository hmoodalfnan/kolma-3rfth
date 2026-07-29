'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import { listStudents } from '@/lib/manage/api';
import { useTransientError } from '@/lib/ui/useTransientError';

/**
 * Every name on the trip, and nothing else.
 *
 * Sits at the bottom of the trip screen as a roll call — the question "who is
 * actually on this trip" was previously a trip to another tab. Deliberately just
 * names: any detail beyond that belongs on الطلاب, so each name links there
 * rather than growing a second half-copy of that screen here.
 */
export function ScheduleRoster({ schedule }) {
  const [students, setStudents] = useState(null);
  const [error, setError] = useTransientError();

  useEffect(() => {
    let alive = true;
    setStudents(null);

    listStudents(schedule.id)
      .then((rows) => alive && setStudents(rows))
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
        setStudents([]);
      });

    return () => {
      alive = false;
    };
  }, [schedule.id, setError]);

  return (
    <Panel
      title={`طلاب رحلة: ${schedule.name}`}
      action={
        students ? (
          <span className="text-xs font-semibold text-muted">{students.length} طالب</span>
        ) : null
      }
    >
      <ErrorText>{error}</ErrorText>

      {students === null ? (
        <SkeletonList rows={4} />
      ) : students.length === 0 ? (
        <EmptyState>لا يوجد طلاب في هذه الرحلة بعد.</EmptyState>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">اضغط على أي اسم للانتقال إلى شاشة الطلاب.</p>
          <ul className="flex flex-wrap gap-1.5">
            {students.map((s) => (
              <li key={s.id}>
                <Link
                  href="/students"
                  className={`block rounded-full px-3 py-1.5 text-sm font-semibold transition hover:opacity-80 ${
                    s.is_active ? 'chip' : 'bg-surface text-muted line-through'
                  }`}
                >
                  {s.full_name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
