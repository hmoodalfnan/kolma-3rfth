'use client';

import { useEffect, useState } from 'react';
import { QuestionCard } from '@/components/questions';
import { CompactBoolSection } from '@/components/questions/CompactBoolSection';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { SkeletonCard, SkeletonList } from '@/components/ui/Skeleton';
import { groupBySection } from '@/lib/questions/active';
import {
  formatGregorianLong,
  formatHijri,
  lockReason,
  todayInRiyadh,
  weekdayLabel,
} from '@/lib/schedule-time/day';
import { useStudentContext } from '@/lib/student/useStudentContext';
import { useDay } from '@/lib/student/useDay';
import { useAssignments } from '@/lib/tasks/useAssignments';
import { DateStrip } from './DateStrip';
import { DayGrants } from './DayGrants';

// One sentence per reason a day is closed. A day that has not arrived yet is not
// a missed deadline, so the reasons are told apart rather than collapsed.
const LOCK_TEXT = {
  archived: () => 'هذا البرنامج مؤرشف — للاطلاع فقط.',
  future: () => 'هذا اليوم لم يأتِ بعد — تعال إليه في وقته.',
  before_start: (s) => `هذا اليوم قبل بداية البرنامج (${s.start_date}).`,
  after_end: (s) => `انتهى البرنامج في ${s.end_date} — للاطلاع فقط.`,
  backfill_closed: () => 'انتهت مهلة التعديل على هذا اليوم.',
};
const LOCK_FALLBACK = 'لا يمكن التعديل على هذا اليوم.';

const KIND = {
  read: { label: 'قراءة', icon: '📖' },
  listen: { label: 'استماع', icon: '🎧' },
};

function PointsChip({ points }) {
  return (
    <span className="shrink-0 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-bold text-gold-700">
      {points} نقطة
    </span>
  );
}

function CheckCircle({ done }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition ${
        done ? 'border-accent bg-accent text-accent-ink' : 'border-line text-transparent'
      }`}
    >
      ✓
    </span>
  );
}

export function DailySheet() {
  const ctx = useStudentContext();
  const [dayKey, setDayKey] = useState(() => todayInRiyadh());

  const day = useDay({ studentId: ctx.student?.id, schedule: ctx.schedule, dayKey });
  const asg = useAssignments(ctx.student?.id);

  useEffect(() => {
    if (ctx.status === 'unauthenticated') window.location.href = '/login';
  }, [ctx.status]);

  if (ctx.status !== 'ready') {
    return (
      <div className="space-y-4 pt-2">
        <SkeletonList rows={1} className="h-24" />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const isToday = dayKey === todayInRiyadh();
  const sections = groupBySection(day.questions);

  return (
    <div className="space-y-5 pt-2">
      <header className="card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {/* The day being viewed: weekday, Gregorian date, and Hijri date, so
                the student always knows exactly which day they are filling in. */}
            <p className="text-lg font-bold text-brand">{weekdayLabel(dayKey)}</p>
            <p className="mt-0.5 text-sm text-ink">{formatGregorianLong(dayKey)}</p>
            <p className="text-xs text-muted">{formatHijri(dayKey)}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2.5 py-1 font-bold text-gold-700">
                <span aria-hidden="true">🔥</span>
                {day.streak} يوم
              </span>
              {!isToday && <span className="text-xs text-muted">اليوم: {day.streakToday}</span>}
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

      {/* البنود اليومية */}
      {day.loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : sections.length === 0 ? (
        <p className="card p-6 text-center text-sm text-muted">لا توجد بنود مجدولة لهذا اليوم.</p>
      ) : (
        sections.map(({ section, items }) => {
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
              {section && section !== 'عام' && (
                <h2 className="mb-3 border-b border-line pb-2 text-sm font-bold text-brand">
                  {section}
                </h2>
              )}
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

      {/* المهام المستمرة — persistent, not tied to a day, so only on today. */}
      {isToday && asg.status === 'ready' && asg.assignments.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-bold text-muted">مهام مستمرة</h2>
          <ul className="space-y-2">
            {asg.assignments.map((a) => {
              const done = asg.done.has(a.id);
              const kind = KIND[a.kind] || KIND.read;
              return (
                <li key={a.id} className={`card space-y-2 p-4 ${done ? 'opacity-70' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-chip px-2 py-0.5 text-xs font-semibold text-chip-ink">
                      <span aria-hidden="true">{kind.icon}</span> {kind.label}
                    </span>
                    <h3 className="min-w-0 flex-1 font-bold text-ink">{a.title}</h3>
                    <PointsChip points={a.points} />
                  </div>
                  {a.body_text && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                      {a.body_text}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => asg.toggle(a.id)}
                    aria-pressed={done}
                    className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl font-semibold transition ${
                      done ? 'bg-ok text-ok-ink' : 'bg-accent text-accent-ink hover:opacity-90'
                    }`}
                  >
                    <CheckCircle done={done} />
                    {done ? 'منجز' : 'تم'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <DayGrants studentId={ctx.student.id} dayKey={dayKey} />
    </div>
  );
}
