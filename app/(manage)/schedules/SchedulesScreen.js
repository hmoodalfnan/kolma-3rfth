'use client';

import { useCallback, useEffect, useState } from 'react';
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
  listStudents,
  updateStudent,
  createGroup,
  updateGroup,
  deleteGroup,
  post,
} from '@/lib/manage/api';
import { todayInRiyadh } from '@/lib/schedule-time/day';
import { JoinLinkRow } from './JoinLinkRow';
import { ScheduleStaffPanel } from './ScheduleStaffPanel';
import { ScheduleRoster } from './ScheduleRoster';
import { GroupMembersPicker } from './GroupMembersPicker';
import { useTransientError } from '@/lib/ui/useTransientError';

export function SchedulesScreen() {
  const { schedules, current, currentId, select, reload } = useSchedule();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useTransientError();

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
          error={error}
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
      {current && <ScheduleStaffPanel key={`st-${current.id}`} schedule={current} />}
      {current && <GroupsPanel key={`g-${current.id}`} schedule={current} />}
      {current && <ScheduleRoster key={`r-${current.id}`} schedule={current} />}
    </div>
  );
}

function ScheduleForm({ open, initial, title, submitLabel = 'حفظ', error, onSubmit, onCancel }) {
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
    <Modal open={open} onClose={onCancel} title={title} error={error} size="sm">
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
  const [error, setError] = useTransientError();
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
        {/* A slider needed a precise drag to land on a round number, and saved
            on mouseup — which on a phone fired at the wrong moment or not at
            all. Discrete choices are the whole useful range anyway. */}
        <Field
          label="حد الستريك 🔥"
          hint="النسبة التي يجب على الطالب بلوغها في اليوم ليُحتسب ضمن الستريك"
        >
          <div className="flex flex-wrap gap-1.5">
            {[50, 60, 70, 80, 90, 100].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => patch({ streak_threshold_pct: n })}
                aria-pressed={row.streak_threshold_pct === n}
                className={`min-w-14 rounded-lg px-3 py-2 text-sm font-bold tabular-nums ${
                  row.streak_threshold_pct === n ? 'chip-selected' : 'chip'
                }`}
              >
                {n}٪
              </button>
            ))}
          </div>
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
        error={error}
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
          label="رابط الرحلة — يصلح لكل الطلاب"
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
  const [students, setStudents] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [members, setMembers] = useState(null);
  const [error, setError] = useTransientError();

  const reload = useCallback(async () => {
    const [g, st] = await Promise.all([listGroups(schedule.id), listStudents(schedule.id)]);
    setGroups(g);
    setStudents(st);
  }, [schedule.id]);

  useEffect(() => {
    let alive = true;
    reload().catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [reload, setError]);

  // A group is only useful once it has people in it, so membership is settled
  // in the same breath as creating or renaming it rather than one student at a
  // time from another screen.
  async function saveMembers(groupId, chosen) {
    const before = students;
    const ids = [...chosen];

    setStudents((rows) =>
      rows.map((r) => {
        if (ids.includes(r.id)) return { ...r, group_id: groupId };
        if (r.group_id === groupId) return { ...r, group_id: null };
        return r;
      }),
    );

    try {
      const added = before.filter((r) => ids.includes(r.id) && r.group_id !== groupId);
      const removed = before.filter((r) => !ids.includes(r.id) && r.group_id === groupId);

      await Promise.all([
        ...added.map((r) => updateStudent(r.id, { group_id: groupId })),
        ...removed.map((r) => updateStudent(r.id, { group_id: null })),
      ]);
      await reload();
    } catch (err) {
      setStudents(before);
      setError(err.message);
    }
  }

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
        error={error}
        title="مجموعة جديدة"
        submitLabel="إضافة"
        onCancel={() => setCreating(false)}
        onSubmit={async (value) => {
          try {
            const created = await createGroup(schedule.id, value, groups.length);
            setGroups((g) => [...g, created]);
            setCreating(false);
            // Straight into "who is in it" — an empty group is not finished.
            if (students.length > 0) setMembers(created);
          } catch (err) {
            setError(err.message);
          }
        }}
      />

      <GroupForm
        open={Boolean(editing)}
        error={error}
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

      <MembersModal
        group={members}
        students={students}
        groups={groups}
        onClose={() => setMembers(null)}
        onSave={saveMembers}
      />

      {students.some((st) => !st.group_id) && groups.length > 0 && (
        <p className="mt-3 rounded-xl bg-gold-100 px-3 py-2 text-sm font-semibold text-gold-700">
          {students.filter((st) => !st.group_id).length} طالب بلا مجموعة — افتح «الطلاب» في أي
          مجموعة لإضافتهم.
        </p>
      )}

      {groups.length === 0 ? (
        <EmptyState>لا توجد مجموعات بعد.</EmptyState>
      ) : (
        <ul className="mt-3 space-y-3">
          {groups.map((g) => (
            <li key={g.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">مجموعة: {g.name}</span>
                  <span className="block text-xs text-muted">
                    {students.filter((st) => st.group_id === g.id).length} طالب
                  </span>
                </p>
                <Button tone="outline" onClick={() => setMembers(g)}>
                  الطلاب
                </Button>
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

            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function GroupForm({ open, title, initialName, submitLabel = 'حفظ', error, onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) setName(initialName ?? '');
  }, [open]);

  return (
    <Modal open={open} onClose={onCancel} title={title} error={error} size="sm">
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

function MembersModal({ group, students, groups, onClose, onSave }) {
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  // Seeded from the group's current membership each time it opens.
  useEffect(() => {
    if (!group) return;
    setSelected(new Set(students.filter((s) => s.group_id === group.id).map((s) => s.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  return (
    <Modal
      open={Boolean(group)}
      onClose={onClose}
      title={group ? `طلاب مجموعة: ${group.name}` : ''}
      description="اختر من ينتمي لهذه المجموعة. غير المحدَّدين يخرجون منها."
    >
      {group && (
        <>
          <GroupMembersPicker
            students={students}
            groups={groups}
            currentGroupId={group.id}
            selected={selected}
            onChange={setSelected}
          />

          <ModalActions>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await onSave(group.id, selected);
                setBusy(false);
                onClose();
              }}
            >
              حفظ
            </Button>
            <Button tone="ghost" onClick={onClose}>
              إلغاء
            </Button>
          </ModalActions>
        </>
      )}
    </Modal>
  );
}
