'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';

/**
 * Points a supervisor gave this student on the day being viewed.
 *
 * These already counted towards the total, but the student had no way to see
 * them — points appeared from nowhere and there was no way to know what they
 * were for. Group awards that were applied to members show up here too, which is
 * why the note matters: it is often the only explanation.
 */
export function DayGrants({ studentId, dayKey }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!studentId || !dayKey) return undefined;
    let alive = true;

    // The day the points are *about*, which since 0019 is a column of its own.
    // Matching on created_at meant an evening's tidying-up all landed on the day
    // it was typed, and anything entered after midnight landed on the next one.
    getBrowserClient()
      .from('point_events')
      .select('id, points, note, created_at, criteria(name)')
      .eq('student_id', studentId)
      .eq('entry_date', dayKey)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (alive) setRows(data ?? []);
      });

    return () => {
      alive = false;
    };
  }, [studentId, dayKey]);

  if (rows.length === 0) return null;

  return (
    <section className="card p-4">
      <h2 className="mb-3 border-b border-line pb-2 text-sm font-bold text-brand">
        تقييم المشرف في هذا اليوم
      </h2>

      <ul className="space-y-2">
        {rows.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{g.criteria?.name ?? 'تقييم'}</span>
              {g.note && <span className="block break-words text-xs text-muted">{g.note}</span>}
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
    </section>
  );
}
