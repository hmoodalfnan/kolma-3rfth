'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/manage/Panel';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchStudentGrants } from '@/lib/boards/queries';
import { fetchStudentDetail } from '@/lib/boards/student-detail';
import { PRAYER_LABELS } from '@/lib/questions/types';
import { formatDayArabic } from '@/lib/schedule-time/day';

const TABS = [
  { id: 'items', label: 'البنود' },
  { id: 'days', label: 'الأيام' },
  { id: 'grading', label: 'التقييم' },
];

/**
 * Where one student's points came from.
 *
 * A leaderboard answers "who is ahead" and stops. This answers what follows:
 * which items they keep up, which days they missed, and what they were graded
 * on.
 */
export function StudentBreakdown({ student, schedule, onClose }) {
  const [detail, setDetail] = useState(null);
  const [grants, setGrants] = useState(null);
  const [tab, setTab] = useState('items');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!student) return undefined;
    let alive = true;

    setDetail(null);
    setGrants(null);
    setTab('items');
    setError('');

    const client = getBrowserClient();
    Promise.all([
      fetchStudentDetail(client, { schedule, studentId: student.student_id }),
      fetchStudentGrants(client, { studentId: student.student_id }),
    ])
      .then(([d, g]) => {
        if (!alive) return;
        setDetail(d);
        setGrants(g);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
        setDetail(null);
        setGrants([]);
      });

    return () => {
      alive = false;
    };
  }, [student, schedule]);

  return (
    <Modal
      open={Boolean(student)}
      onClose={onClose}
      title={student?.full_name}
      description={
        student
          ? `مجموعة: ${student.group_name ?? 'بدون مجموعة'} · الإجمالي ${Number(student.total_points)} نقطة`
          : undefined
      }
      error={error}
      size="lg"
    >
      <div className="grid gap-2 sm:grid-cols-4">
        <Stat label="نقاط البنود" value={Number(student?.answer_points ?? 0)} />
        <Stat label="نقاط التقييم" value={Number(student?.grant_points ?? 0)} />
        <Stat label="ستريك 🔥" value={detail ? `${detail.streak} يوم` : '…'} />
        <Stat
          label="أيام ناقصة"
          value={detail ? detail.missedCount : '…'}
          tone={detail?.missedCount ? 'warn' : undefined}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
              tab === t.id ? 'chip-selected' : 'chip'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {tab === 'items' && <ItemsTab detail={detail} />}
        {tab === 'days' && <DaysTab detail={detail} />}
        {tab === 'grading' && <GradingTab grants={grants} />}
      </div>
    </Modal>
  );
}

function ItemsTab({ detail }) {
  if (!detail) return <SkeletonList rows={6} />;
  if (detail.perQuestion.length === 0) return <EmptyState>لم يُسجَّل أي بند بعد.</EmptyState>;

  return (
    <ul className="space-y-3">
      {detail.perQuestion.map((item) => (
        <li key={item.id}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 flex-1 text-sm font-semibold">{item.title}</span>
            <span className="shrink-0 text-sm font-bold tabular-nums text-brand">
              {item.earned}
            </span>
          </div>

          <p className="mt-0.5 text-xs text-muted">
            أُنجز {item.timesCompleted} من {item.timesAnswered} يوم · {item.pct}٪
          </p>

          <span className="mt-1 block h-2 rounded-full bg-line" aria-hidden="true">
            <span
              className={`block h-full rounded-full ${
                item.pct >= 100 ? 'bg-ok-ink' : 'bg-gold-500'
              }`}
              style={{ width: `${Math.max(2, item.pct)}%` }}
            />
          </span>

          {/* Explains a number like 25: five prayers at five points each. */}
          {item.prayers && (
            <div className="mt-1.5">
              <p className="text-xs text-muted">
                {item.prayers.ticked} من {item.prayers.possible} صلاة
                {item.prayers.perPrayerPoints > 0 &&
                  ` · ${item.prayers.perPrayerPoints} نقاط لكل صلاة`}
              </p>
              <ul className="mt-1 flex flex-wrap gap-1">
                {item.prayers.covered.map((p) => {
                  const done = item.prayers.counts[p];
                  const full = done >= item.timesAnswered && item.timesAnswered > 0;
                  return (
                    <li
                      key={p}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        full ? 'bg-ok text-ok-ink' : done > 0 ? 'chip' : 'bg-line text-muted'
                      }`}
                    >
                      {PRAYER_LABELS[p]} {done}/{item.timesAnswered}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function DaysTab({ detail }) {
  if (!detail) return <SkeletonList rows={8} />;
  if (detail.days.length === 0) return <EmptyState>لا توجد أيام بعد.</EmptyState>;

  return (
    <>
      <p className="mb-2 text-xs text-muted">
        اليوم يُحتسب مكتملاً عند بلوغ {detail.threshold}٪. الأيام الناقصة معلَّمة بالأحمر.
      </p>
      <ul className="space-y-1.5">
        {detail.days.map((d) => (
          <li
            key={d.day}
            className={`rounded-xl border p-2.5 ${
              d.met ? 'border-line' : 'border-rose-500/40 bg-danger-soft/40'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span aria-hidden="true" className="text-sm">
                {d.met ? '✓' : d.untouched ? '—' : '!'}
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold">{formatDayArabic(d.day)}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted" dir="ltr">
                {d.earned} / {d.possible}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  d.met ? 'bg-ok text-ok-ink' : 'bg-danger-soft text-danger-ink'
                }`}
              >
                {Math.round(d.pct)}٪
              </span>
            </div>

            {!d.met && d.missing.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                لم يُنجز: {d.missing.map((m) => m.title).join('، ')}
              </p>
            )}
            {d.untouched && <p className="mt-1 text-xs text-muted">لم يفتح هذا اليوم إطلاقاً.</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

function GradingTab({ grants }) {
  if (!grants) return <SkeletonList rows={4} />;
  if (grants.length === 0) return <EmptyState>لا توجد نقاط تقييم.</EmptyState>;

  return (
    <ul className="space-y-1.5">
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
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-line p-3 text-center">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-0.5 text-lg font-bold tabular-nums ${
          tone === 'warn' ? 'text-rose-600' : 'text-brand'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
