'use client';

import { useEffect, useState } from 'react';
import { ErrorText } from '@/components/manage/Panel';
import { Button } from '@/components/ui/Button';
import { Field, Input, NumberInput } from '@/components/ui/Field';
import { SkeletonList } from '@/components/ui/Skeleton';
import { getProgram, updateProgram } from '@/lib/admin/program';

export function SettingsScreen() {
  const [program, setProgram] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [backfill, setBackfill] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [streakBusy, setStreakBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await getProgram();
        setProgram(p);
        setStartDate(p?.start_date ?? '');
        setBackfill(String(p?.backfill_days ?? 0));
      } catch {
        setError('تعذّر تحميل الإعدادات');
        setProgram(false);
      }
    })();
  }, []);

  async function toggleStreak() {
    if (!program) return;
    const next = !(program.show_streak !== false);
    setError('');
    setStreakBusy(true);
    try {
      await updateProgram(program.id, { show_streak: next });
      setProgram((p) => ({ ...p, show_streak: next }));
    } catch {
      setError('تعذّر حفظ إعداد السلسلة');
    } finally {
      setStreakBusy(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    setError('');
    setSaved(false);
    const n = Math.trunc(Number(backfill));
    if (!Number.isFinite(n) || n < 0 || n > 365) {
      setError('أدخل عدداً بين 0 و 365');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      setError('اختر تاريخ بداية صحيحاً');
      return;
    }
    if (program.end_date && startDate > program.end_date) {
      setError('تاريخ البداية بعد تاريخ نهاية البرنامج');
      return;
    }
    setBusy(true);
    try {
      await updateProgram(program.id, { backfill_days: n, start_date: startDate });
      setProgram((p) => ({ ...p, backfill_days: n, start_date: startDate }));
      setBackfill(String(n));
      setSaved(true);
    } catch {
      setError('تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-brand">الإعدادات</h1>

      {program === null ? (
        <SkeletonList rows={3} />
      ) : program === false ? (
        <ErrorText>{error}</ErrorText>
      ) : (
        <form onSubmit={save} className="card space-y-4 p-5">
          <Field
            label="تاريخ بداية البرنامج"
            htmlFor="start"
            hint="أول يوم في البرنامج. الأيام التي قبله تكون مغلقة، وهو بداية احتساب السلسلة والأيام الظاهرة."
          >
            <Input
              id="start"
              type="date"
              dir="ltr"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setSaved(false);
              }}
              max={program.end_date || undefined}
              className="max-w-48 text-lg"
            />
          </Field>

          <Field
            label="مهلة الرجوع للتعديل (بالأيام)"
            htmlFor="backfill"
            hint="كم يوماً يمكن للمستخدم الرجوع لتعديل بنود الأيام الماضية. 0 = اليوم فقط، 3 = اليوم والثلاثة أيام السابقة."
          >
            <NumberInput
              id="backfill"
              value={backfill}
              onChange={(e) => {
                setBackfill(e.target.value);
                setSaved(false);
              }}
              decimal={false}
              className="max-w-32 text-lg"
            />
          </Field>

          {error && <ErrorText>{error}</ErrorText>}

          <div className="flex items-center gap-3">
            <Button type="submit" loading={busy}>
              حفظ
            </Button>
            {saved && <span className="text-sm font-semibold text-brand">تم الحفظ ✓</span>}
          </div>

          <div className="border-t border-line pt-4">
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <span>
                <span className="block text-sm font-semibold text-ink">
                  إظهار السلسلة 🔥 (أيام الاستمرارية)
                </span>
                <span className="block text-xs text-muted">
                  عند الإيقاف تختفي السلسلة من كل مكان: شاشة اليوم ولوحة الصدارة.
                </span>
              </span>
              <input
                type="checkbox"
                checked={program.show_streak !== false}
                onChange={toggleStreak}
                disabled={streakBusy}
                className="mt-1 size-5 shrink-0 accent-[var(--color-accent)]"
              />
            </label>
          </div>
        </form>
      )}
    </div>
  );
}
