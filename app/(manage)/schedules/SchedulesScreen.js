'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Modal, ModalActions } from '@/components/ui/Modal';
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
        action={<Button onClick={() => setCreating(true)}>رحلة جديدة</Button>}
      >
        <ScheduleForm
          open={creating}
          title="رحلة جديدة"
          submitLabel="إنشاء الرحلة"
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
                    s.id === currentId ? 'border-accent bg-chip' : 'border-line'
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
                        : 'bg-ok text-ok-ink'
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

function ScheduleForm({ open, initial, title, submitLabel = 'حفظ', onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const [start, setStart] = useState(todayInRiyadh());
  const [openEnded, setOpenEnded] = useState(true);
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);

  // Seed from `initial` each time it opens rather than at mount: the component
  // stays mounted between openings now that it is a modal.
  //
  // Depends on `open` alone on purpose. Callers pass `initial` as an object
  // literal, so it has a fresh identity on every render — depending on it would
  // re-seed the fields after every keystroke and wipe what was typed.
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setStart(initial?.start_date ?? todayInRiyadh());
    setEnd(initial?.end_date ?? '');
    setOpenEnded(!initial?.end_date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <form
        className="grid gap-3"
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

        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={openEnded}
            onChange={(e) => setOpenEnded(e.target.checked)}
            className="accent-[color:var(--color-accent)]"
          />
          رحلة مستمرة بدون تاريخ نهاية
        </label>

        {!openEnded && (
          <Field label="تاريخ النهاية" htmlFor="send">
            <Input
              id="send"
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        )}

        <ModalActions>
          <Button type="submit" loading={busy}>
            {submitLabel}
          </Button>
          <Button tone="ghost" onClick={onCancel}>
            إلغاء
          </Button>
        </ModalActions>
      </form>
    </Modal>
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
            className="size-5 accent-[color:var(--color-accent)]"
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
          <Button tone="ghost" onClick={() => setCloning(true)}>
            نسخ الرحلة
          </Button>
        </div>
      </div>

      <ScheduleForm
        open={cloning}
        title="نسخ الرحلة"
        submitLabel="نسخ"
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
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
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
    <Panel
      title="المجموعات (الغرف)"
      action={<Button onClick={() => setCreating(true)}>مجموعة جديدة</Button>}
    >
      <ErrorText>{error}</ErrorText>

      <GroupForm
        open={creating}
        title="مجموعة جديدة"
        submitLabel="إضافة"
        onCancel={() => setCreating(false)}
        onSubmit={async (value) => {
          try {
            const created = await createGroup(schedule.id, value, groups.length);
            setGroups((g) => [...g, created]);
            setCreating(false);
          } catch (err) {
            setError(err.message);
          }
        }}
      />

      <GroupForm
        open={Boolean(editing)}
        title="تعديل اسم المجموعة"
        initialName={editing?.name}
        onCancel={() => setEditing(null)}
        onSubmit={async (value) => {
          try {
            await updateGroup(editing.id, { name: value });
            setGroups((rows) =>
              rows.map((r) => (r.id === editing.id ? { ...r, name: value } : r)),
            );
            setEditing(null);
          } catch (err) {
            setError(err.message);
          }
        }}
      />

      {groups.length === 0 ? (
        <EmptyState>لا توجد مجموعات بعد.</EmptyState>
      ) : (
        <ul className="mt-3 space-y-3">
          {groups.map((g) => (
            <li key={g.id} className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-semibold">{g.name}</p>
                <Button tone="outline" onClick={() => setEditing(g)}>
                  تعديل
                </Button>
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

function GroupForm({ open, title, initialName, submitLabel = 'حفظ', onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) setName(initialName ?? '');
  }, [open]);

  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          setBusy(true);
          await onSubmit(trimmed);
          setBusy(false);
        }}
      >
        <Field label="اسم المجموعة" htmlFor="gname" hint="مثل: غرفة 101">
          <Input id="gname" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>

        <ModalActions>
          <Button type="submit" loading={busy}>
            {submitLabel}
          </Button>
          <Button tone="ghost" onClick={onCancel}>
            إلغاء
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}
