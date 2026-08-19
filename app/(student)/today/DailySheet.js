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
  const showStreak = ctx.schedule?.show_streak !== false;

  // البنود اليومية round up to 100%. مهام المجموعة are a bonus counted ON TOP of
  // that, so completing them pushes the day total above 100% (only on today,
  // since they are not tied to a past day).
  const asgReady = asg.status === 'ready';
  const includeAsg = isToday && asgReady;
  const asgEarned = includeAsg
    ? asg.assignments.reduce((s, a) => (asg.done.has(a.id) ? s + Number(a.points || 0) : s), 0)
    : 0;
  const dailyPossible = day.points.possible;
  const earned = day.points.earned + asgEarned;
  const ringValue =
    dailyPossible > 0 ? Math.round((earned / dailyPossible) * 1000) / 10 : day.completion;

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
              {showStreak && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2.5 py-1 font-bold text-gold-700">
                  <span aria-hidden="true">🔥</span>
                  {day.streak} يوم
                </span>
              )}
              {showStreak && !isToday && (
                <span className="text-xs text-muted">اليوم: {day.streakToday}</span>
              )}
              <span className="tabular-nums text-muted" dir="ltr">
                {earned} / {dailyPossible}
              </span>
            </div>
          </div>
          <ProgressRing value={ringValue} />
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

      {/* مهام المجموعة — sent in the community chat, not tied to a day, so only on
          today. One compact tappable row each; points count on top of 100%. */}
      {isToday && asg.status === 'ready' && asg.assignments.length > 0 && (
        <section className="space-y-2">
          <div className="px-1">
            <h2 className="text-sm font-bold text-muted">مهام المجموعة</h2>
            <p className="text-xs text-muted">
              مهام مُرسَلة في المجموعة، تبقى معك من يوم لآخر حتى تُنهيها، ونقاطها إضافية فوق الـ100%.
            </p>
          </div>
          <ul className="space-y-2">
            {asg.assignments.map((a) => {
              const done = asg.done.has(a.id);
              const kind = KIND[a.kind] || KIND.read;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => asg.toggle(a.id)}
                    aria-pressed={done}
                    className={`card flex w-full items-start gap-3 p-3 text-start transition ${
                      done ? 'bg-accent-soft' : ''
                    }`}
                  >
                    <CheckCircle done={done} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm" aria-hidden="true">
                          {kind.icon}
                        </span>
                        <span className="font-semibold text-ink">{a.title}</span>
                      </span>
                      {a.body_text && (
                        <span className="mt-0.5 line-clamp-2 block whitespace-pre-wrap text-xs leading-relaxed text-muted">
                          {a.body_text}
                        </span>
                      )}
                    </span>
                    <PointsChip points={a.points} />
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
