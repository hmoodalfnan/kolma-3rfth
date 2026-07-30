'use client';

import { useEffect, useState } from 'react';
import { QuestionCard } from '@/components/questions';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { SkeletonCard, SkeletonList } from '@/components/ui/Skeleton';
import { groupBySection } from '@/lib/questions/active';
import { formatDayArabic, lockReason, todayInRiyadh } from '@/lib/schedule-time/day';
import { useStudentContext } from '@/lib/student/useStudentContext';
import { useDay } from '@/lib/student/useDay';
import { DateStrip } from './DateStrip';
import { DayGrants } from './DayGrants';
import { CompactBoolSection } from '@/components/questions/CompactBoolSection';

/**
 * One sentence per reason a day is closed. A day that has not arrived yet had
 * been reported as a missed deadline, which is the opposite of what is true and
 * sent students looking for a way to appeal it.
 */
const LOCK_TEXT = {
  archived: () => 'هذه الرحلة مؤرشفة — للاطلاع فقط.',
  future: () => 'هذا اليوم لم يأتِ بعد — تعال إليه في وقته.',
  before_start: (s) => `هذا اليوم قبل بداية الرحلة (${s.start_date}).`,
  after_end: (s) => `انتهت الرحلة في ${s.end_date} — للاطلاع فقط.`,
  backfill_closed: () => 'انتهت مهلة التعديل على هذا اليوم.',
};

const LOCK_FALLBACK = 'لا يمكن التعديل على هذا اليوم.';

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
  const isToday = dayKey === todayInRiyadh();

  return (
    <div className="space-y-4">
      <header className="card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold">{ctx.student.full_name}</h1>

            {/* The trip and its dates: a student should not have to ask when
                what they are filling in actually ends. */}
            <p className="mt-1 text-sm">
              <span className="text-muted">رحلة: </span>
              <span className="font-semibold">{ctx.schedule.name}</span>
            </p>
            <p className="text-sm">
              <span className="text-muted">الفترة: </span>
              <span className="tabular-nums">
                {ctx.schedule.start_date} —{' '}
                {ctx.schedule.end_date ?? 'مستمرة'}
              </span>
            </p>

            <p className="mt-2 text-sm font-semibold">{formatDayArabic(dayKey)}</p>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {/* Reflects the day being looked at, so a past day reports the
                  streak as it stood then rather than today's. */}
              <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2.5 py-1 font-bold text-gold-700">
                <span aria-hidden="true">🔥</span>
                ستريك {day.streak} يوم
              </span>
              {!isToday && (
                <span className="text-xs text-muted">اليوم: {day.streakToday} يوم</span>
              )}
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
          {LOCK_TEXT[lockReason(ctx.schedule, dayKey)]?.(ctx.schedule) ?? LOCK_FALLBACK}
        </p>
      )}

      {day.error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-ink">
          {day.error}
        </p>
      )}

      {day.loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : (
        sections.map(({ section, items }) => {
          // A section of nothing but yes/no deeds collapses into one grid.
          // Five rawatib were five full-width rows for five checkboxes.
          const allBool = items.length > 1 && items.every((q) => q.type === 'bool');

          if (allBool) {
            return (
              <CompactBoolSection
                key={section}
                section={section}
                items={items}
                values={day.values}
                disabled={!day.editable}
                onChange={(id, v) => day.setValue(id, v)}
              />
            );
          }

          return (
            <section key={section} className="card p-4">
              <h2 className="mb-3 border-b border-line pb-2 text-sm font-bold text-brand">
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
          );
        })
      )}

      {!day.loading && day.questions.length === 0 && (
        <p className="card p-6 text-center text-sm text-muted">لا توجد بنود مجدولة لهذا اليوم.</p>
      )}

      <DayGrants studentId={ctx.student.id} dayKey={dayKey} />
    </div>
  );
}
