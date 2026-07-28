'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import { useSchedule } from '@/lib/manage/useSchedule';
import {
  createSchedule,
  updateSchedule,
  rotateScheduleSlug,
  listGroups,
  createGroup,
  updateGroup,
  rotateGroupSlug,
  deleteGroup,
  post,
} from '@/lib/manage/api';
import { todayInRiyadh } from '@/lib/schedule-time/day';
import { JoinLinkRow } from './JoinLinkRow';

export function SchedulesScreen() {
  const { schedules, current, currentId, select, reload } = useSchedule();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  if (schedules === null) return <SkeletonList rows={5} className="h-24" />;

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>

      <Panel
        title="الرحلات"
        action={
          <Button onClick={() => setCreating((v) => !v)}>
            {creating ? 'إلغاء' : 'رحلة جديدة'}
          </Button>
        }
      >
        {creating && (
          <ScheduleForm
            onCancel={() => setCreating(false)}
            onSubmit={async (values) => {
              try {
                const created = await createSchedule(values);
                await reload();
                select(created.id);
                setCreating(false);
                toast.push('تم إنشاء الرحلة', 'success');
              } catch (err) {
                setError(err.message);
              }
            }}
          />
        )}

        {schedules.length === 0 ? (
          <EmptyState>لا توجد رحلات بعد — أنشئ أول رحلة.</EmptyState>
        ) : (
          <ul className="mt-3 space-y-2">
            {schedules.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => select(s.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-right transition ${
                    s.id === currentId ? 'border-navy-700 bg-navy-50' : 'border-line'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{s.name}</span>
                    <span className="block text-xs text-muted">
                      {s.start_date} — {s.end_date ?? 'بدون نهاية'}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      s.status === 'archived'
                        ? 'bg-line text-muted'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {s.status === 'archived' ? 'مؤرشفة' : 'جارية'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {current && <ScheduleSettings key={current.id} schedule={current} onChanged={reload} />}
      {current && <GroupsPanel key={`g-${current.id}`} schedule={current} />}
    </div>
  );
}

function ScheduleForm({ initial, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [start, setStart] = useState(initial?.start_date ?? todayInRiyadh());
  const [openEnded, setOpenEnded] = useState(!initial?.end_date);
  const [end, setEnd] = useState(initial?.end_date ?? '');
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit({
          name: name.trim(),
          start_date: start,
          end_date: openEnded ? null : end || null,
        });
        setBusy(false);
      }}
    >
      <Field label="اسم الرحلة" htmlFor="sname">
        <Input id="sname" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>

      <Field label="تاريخ البداية" htmlFor="sstart">
        <Input
          id="sstart"
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
        />
      </Field>

      <Field label="تاريخ النهاية" htmlFor="send" hint="اتركها بدون نهاية للرحلات المستمرة">
        <Input
          id="send"
          type="date"
          value={end}
          disabled={openEnded}
          min={start}
          onChange={(e) => setEnd(e.target.value)}
        />
      </Field>

      <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={openEnded}
          onChange={(e) => setOpenEnded(e.target.checked)}
          className="size-5 accent-[color:var(--color-navy-700)]"
        />
        بدون تاريخ نهاية
      </label>

      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={busy}>
          حفظ
        </Button>
        <Button tone="ghost" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

function ScheduleSettings({ schedule, onChanged }) {
  const toast = useToast();
  const [row, setRow] = useState(schedule);
  const [error, setError] = useState('');
  const [cloning, setCloning] = useState(false);

  useEffect(() => setRow(schedule), [schedule]);

  async function patch(values) {
    const before = row;
    setRow({ ...row, ...values }); // optimistic
    try {
      await updateSchedule(schedule.id, values);
      onChanged();
    } catch (err) {
      setRow(before);
      setError(err.message);
    }
  }

  return (
    <Panel title={`إعدادات: ${schedule.name}`}>
      <ErrorText>{error}</ErrorText>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={`حد السلسلة المتواصلة: ${row.streak_threshold_pct}٪`}
          htmlFor="threshold"
          hint="النسبة التي يجب بلوغها في اليوم ليُحتسب ضمن السلسلة"
        >
          <input
            id="threshold"
            type="range"
            min={10}
            max={100}
            step={5}
            value={row.streak_threshold_pct}
            onChange={(e) => setRow({ ...row, streak_threshold_pct: Number(e.target.value) })}
            onMouseUp={(e) => patch({ streak_threshold_pct: Number(e.target.value) })}
            onTouchEnd={(e) => patch({ streak_threshold_pct: Number(e.target.value) })}
            className="w-full"
          />
        </Field>

        <Field label="أيام التعديل بأثر رجعي" htmlFor="backfill">
          <Select
            id="backfill"
            value={row.backfill_days}
            onChange={(e) => patch({ backfill_days: Number(e.target.value) })}
          >
            {[0, 1, 2, 3, 5, 7, 14, 30].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'اليوم فقط' : `${n} أيام`}
              </option>
            ))}
          </Select>
        </Field>

        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={row.students_see_leaderboard}
            onChange={(e) => patch({ students_see_leaderboard: e.target.checked })}
            className="size-5 accent-[color:var(--color-navy-700)]"
          />
          إظهار لوحة الصدارة للطلاب
        </label>

        <div className="flex flex-wrap items-end gap-2">
          <Button
            tone="outline"
            onClick={() =>
              patch({
                status: row.status === 'archived' ? 'active' : 'archived',
                archived_at: row.status === 'archived' ? null : new Date().toISOString(),
              })
            }
          >
            {row.status === 'archived' ? 'إعادة فتح الرحلة' : 'أرشفة الرحلة'}
          </Button>
          <Button tone="ghost" onClick={() => setCloning((v) => !v)}>
            نسخ الرحلة
          </Button>
        </div>
      </div>

      {cloning && (
        <div className="mt-3">
          <ScheduleForm
            initial={{ name: `${schedule.name} (نسخة)`, start_date: todayInRiyadh() }}
            onCancel={() => setCloning(false)}
            onSubmit={async (values) => {
              try {
                await post('/api/schedules/clone', {
                  scheduleId: schedule.id,
                  name: values.name,
                  startDate: values.start_date,
                  endDate: values.end_date,
                });
                setCloning(false);
                onChanged();
                toast.push('تم نسخ الرحلة مع بنودها ومجموعاتها', 'success');
              } catch (err) {
                setError(err.message);
              }
            }}
          />
        </div>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <JoinLinkRow
          label="رابط الرحلة (كل الطلاب)"
          slug={row.slug}
          onRotate={async () => {
            const updated = await rotateScheduleSlug(schedule.id);
            setRow(updated);
            onChanged();
            toast.push('تم تجديد الرابط — الرابط القديم لم يعد يعمل', 'info');
          }}
        />
      </div>
    </Panel>
  );
}

function GroupsPanel({ schedule }) {
  const toast = useToast();
  const [groups, setGroups] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    listGroups(schedule.id)
      .then((rows) => alive && setGroups(rows))
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [schedule.id]);

  if (groups === null) {
    return (
      <Panel title="المجموعات">
        <SkeletonList rows={3} />
      </Panel>
    );
  }

  return (
    <Panel title="المجموعات (الغرف)">
      <ErrorText>{error}</ErrorText>

      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          setName('');
          try {
            const created = await createGroup(schedule.id, trimmed, groups.length);
            setGroups((g) => [...g, created]);
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسم المجموعة، مثل: غرفة 101"
          aria-label="اسم المجموعة"
        />
        <Button type="submit">إضافة</Button>
      </form>

      {groups.length === 0 ? (
        <EmptyState>لا توجد مجموعات بعد.</EmptyState>
      ) : (
        <ul className="mt-3 space-y-3">
          {groups.map((g) => (
            <li key={g.id} className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-2">
                <Input
                  defaultValue={g.name}
                  aria-label={`اسم المجموعة ${g.name}`}
                  onBlur={async (e) => {
                    const value = e.target.value.trim();
                    if (!value || value === g.name) return;
                    try {
                      await updateGroup(g.id, { name: value });
                      setGroups((rows) =>
                        rows.map((r) => (r.id === g.id ? { ...r, name: value } : r)),
                      );
                    } catch (err) {
                      setError(err.message);
                    }
                  }}
                />
                <Button
                  tone="danger"
                  onClick={async () => {
                    try {
                      await deleteGroup(g.id);
                      setGroups((rows) => rows.filter((r) => r.id !== g.id));
                      toast.push('تم حذف المجموعة — بقي الطلاب بدون مجموعة', 'info');
                    } catch (err) {
                      setError(err.message);
                    }
                  }}
                >
                  حذف
                </Button>
              </div>

              <div className="mt-2">
                <JoinLinkRow
                  label="رابط هذه المجموعة"
                  slug={g.join_slug}
                  onRotate={async () => {
                    const updated = await rotateGroupSlug(g.id);
                    setGroups((rows) => rows.map((r) => (r.id === g.id ? updated : r)));
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
