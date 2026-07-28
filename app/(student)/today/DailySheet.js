'use client';

import { useEffect, useState } from 'react';
import { QuestionCard } from '@/components/questions';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { SkeletonCard, SkeletonList } from '@/components/ui/Skeleton';
import { groupBySection } from '@/lib/questions/active';
import { formatDayArabic, todayInRiyadh } from '@/lib/schedule-time/day';
import { useStudentContext } from '@/lib/student/useStudentContext';
import { useDay } from '@/lib/student/useDay';
import { DateStrip } from './DateStrip';

export function DailySheet() {
  const ctx = useStudentContext();
  const [dayKey, setDayKey] = useState(() => todayInRiyadh());

  const day = useDay({
    studentId: ctx.student?.id,
    schedule: ctx.schedule,
    dayKey,
  });

  useEffect(() => {
    if (ctx.status === 'unauthenticated') window.location.href = '/login';
  }, [ctx.status]);

  if (ctx.status !== 'ready') {
    return (
      <div className="space-y-4">
        <SkeletonList rows={1} className="h-20" />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const sections = groupBySection(day.questions);

  return (
    <div className="space-y-4">
      <header className="card p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted">{ctx.schedule.name}</p>
            <h1 className="mt-0.5 text-lg font-bold">{ctx.student.full_name}</h1>
            <p className="mt-1 text-sm text-muted">{formatDayArabic(dayKey)}</p>
            <div className="mt-2 flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2.5 py-1 font-bold text-gold-700">
                <span aria-hidden="true">🔥</span>
                {day.streak} يوم
              </span>
              <span className="tabular-nums text-muted" dir="ltr">
                {day.points.earned} / {day.points.possible}
              </span>
            </div>
          </div>
          <ProgressRing value={day.completion} />
        </div>
      </header>

      <DateStrip
        schedule={ctx.schedule}
        selected={dayKey}
        onSelect={setDayKey}
        completionFor={day.completionFor}
      />

      {!day.editable && (
        <p className="rounded-xl bg-gold-100 px-3 py-2 text-center text-sm font-semibold text-gold-700">
          {ctx.schedule.status === 'archived'
            ? 'هذه الرحلة مؤرشفة — للاطلاع فقط.'
            : 'انتهت مهلة التعديل على هذا اليوم.'}
        </p>
      )}

      {day.error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {day.error}
        </p>
      )}

      {day.loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : (
        sections.map(({ section, items }) => (
          <section key={section} className="card p-4">
            <h2 className="mb-3 border-b border-line pb-2 text-sm font-bold text-navy-700">
              {section}
            </h2>
            <div className="space-y-3">
              {items.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  value={day.values[q.id]}
                  disabled={!day.editable}
                  onChange={(v) => day.setValue(q.id, v)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {!day.loading && day.questions.length === 0 && (
        <p className="card p-6 text-center text-sm text-muted">لا توجد بنود مجدولة لهذا اليوم.</p>
      )}
    </div>
  );
}
