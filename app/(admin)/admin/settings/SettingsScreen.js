'use client';

import { useEffect, useState } from 'react';
import { ErrorText } from '@/components/manage/Panel';
import { Button } from '@/components/ui/Button';
import { Field, NumberInput } from '@/components/ui/Field';
import { SkeletonList } from '@/components/ui/Skeleton';
import { getProgram, updateProgram } from '@/lib/admin/program';

export function SettingsScreen() {
  const [program, setProgram] = useState(null);
  const [backfill, setBackfill] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await getProgram();
        setProgram(p);
        setBackfill(String(p?.backfill_days ?? 0));
      } catch {
        setError('تعذّر تحميل الإعدادات');
        setProgram(false);
      }
    })();
  }, []);

  async function save(event) {
    event.preventDefault();
    setError('');
    setSaved(false);
    const n = Math.trunc(Number(backfill));
    if (!Number.isFinite(n) || n < 0 || n > 365) {
      setError('أدخل عدداً بين 0 و 365');
      return;
    }
    setBusy(true);
    try {
      await updateProgram(program.id, { backfill_days: n });
      setProgram((p) => ({ ...p, backfill_days: n }));
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
            label="مهلة الرجوع للتعديل (بالأيام)"
            htmlFor="backfill"
            hint="كم يوماً يمكن للمستخدم الرجوع لتعديل بنود الأيام الماضية. 0 = اليوم فقط، 3 = اليوم والثلاثة أيام السابقة."
            error={error}
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

          <div className="flex items-center gap-3">
            <Button type="submit" loading={busy}>
              حفظ
            </Button>
            {saved && <span className="text-sm font-semibold text-brand">تم الحفظ ✓</span>}
          </div>
        </form>
      )}
    </div>
  );
}
