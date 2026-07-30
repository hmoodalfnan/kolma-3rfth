'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Modal, ModalActions } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import { useSchedule } from '@/lib/manage/useSchedule';
import {
  listGroups,
  listStudents,
  createStudents,
  resetStudentPin,
  updateStudent,
  deleteStudent,
} from '@/lib/manage/api';
import { fetchStudentTotals } from '@/lib/boards/queries';
import { getBrowserClient } from '@/lib/supabase/browser';
import { ImportWizard } from './ImportWizard';
import { TempPinSheet } from './TempPinSheet';
import { StudentBreakdown } from '@/components/boards/StudentBreakdown';
import { useTransientError } from '@/lib/ui/useTransientError';

export function StudentsScreen() {
  const { current } = useSchedule();
  const toast = useToast();

  const [students, setStudents] = useState(null);
  const [groups, setGroups] = useState([]);
  const [totals, setTotals] = useState([]);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [mode, setMode] = useState(null);
  const [pinSheet, setPinSheet] = useState([]);
  const [pinPhones, setPinPhones] = useState({});
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useTransientError();
  // A dialog covers the banner behind it, so failures raised while one is open
  // are reported inside it instead.
  const [dialogError, setDialogError] = useTransientError();

  const load = useCallback(async () => {
    if (!current) return;
    setStudents(null);
    try {
      const [s, g, t] = await Promise.all([
        listStudents(current.id),
        listGroups(current.id),
        fetchStudentTotals(getBrowserClient(), { scheduleId: current.id }).catch(() => []),
      ]);
      setStudents(s);
      setGroups(g);
      setTotals(t);
    } catch (err) {
      setError(err.message);
      setStudents([]);
    }
  }, [current]);

  useEffect(() => {
    load();
  }, [load]);

  const totalFor = useMemo(() => {
    const map = new Map(totals.map((t) => [t.student_id, t]));
    return (id) => map.get(id);
  }, [totals]);

  const visible = useMemo(() => {
    if (!students) return [];
    const term = search.trim();
    return students.filter(
      (s) =>
        (groupFilter === 'all' || s.group_id === groupFilter) &&
        (!term || s.full_name.includes(term)),
    );
  }, [students, search, groupFilter]);

  if (!current) return <EmptyState>اختر رحلة أولاً.</EmptyState>;

  const groupName = (id) => groups.find((g) => g.id === id)?.name ?? 'بدون مجموعة';

  // Shared by the card and table layouts below so the two never drift apart.
  // Each writes optimistically and rolls back the single field it touched.
  const patchRow = (id, patch) =>
    setStudents((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  async function setGroup(student, groupId) {
    const before = student.group_id;
    patchRow(student.id, { group_id: groupId });
    try {
      await updateStudent(student.id, { group_id: groupId });
    } catch (err) {
      patchRow(student.id, { group_id: before });
      setError(err.message);
    }
  }

  async function toggleActive(student) {
    const next = !student.is_active;
    patchRow(student.id, { is_active: next });
    try {
      await updateStudent(student.id, { is_active: next });
    } catch (err) {
      patchRow(student.id, { is_active: !next });
      setError(err.message);
    }
  }

  async function resetPin(student) {
    try {
      const res = await resetStudentPin(student.id);
      setPinSheet([{ id: student.id, full_name: res.full_name, tempPin: res.tempPin }]);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveEdit(student, values) {
    const before = { full_name: student.full_name, group_id: student.group_id };
    patchRow(student.id, values);
    try {
      await updateStudent(student.id, values);
      setEditing(null);
      toast.push('تم حفظ بيانات الطالب', 'success');
    } catch (err) {
      patchRow(student.id, before);
      setDialogError(err.message);
    }
  }

  async function removeStudent(student) {
    try {
      await deleteStudent(student.id);
      setStudents((rows) => rows.filter((r) => r.id !== student.id));
      setRemoving(null);
      if (viewing?.id === student.id) setViewing(null);
      toast.push('تم حذف الطالب', 'success');
    } catch (err) {
      setDialogError(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>

      {pinSheet.length > 0 && (
        <TempPinSheet
          entries={pinSheet}
          scheduleName={current.name}
          slug={current.slug}
          phones={pinPhones}
          onClose={() => {
            setPinSheet([]);
            setPinPhones({});
          }}
        />
      )}

      <Panel
        title={`الطلاب — ${current.name}`}
        action={
          <div className="flex gap-2">
            <Button onClick={() => setMode('add')}>إضافة طالب</Button>
            <Button tone="outline" onClick={() => setMode('import')}>
              استيراد Excel
            </Button>
          </div>
        }
      >
        <AddStudentForm
          open={mode === 'add'}
          error={error}
          groups={groups}
          onCancel={() => setMode(null)}
          onSubmit={async (payload) => {
            try {
              const result = await createStudents({ scheduleId: current.id, ...payload });
              setPinSheet(result.created);
              setMode(null);
              await load();
              toast.push('تمت إضافة الطالب', 'success');
            } catch (err) {
              setError(err.message);
            }
          }}
        />

        <Modal
          open={mode === 'import'}
          onClose={() => setMode(null)}
          title="استيراد الطلاب من Excel"
          size="lg"
        >
          {mode === 'import' && (
            <ImportWizard
              groups={groups}
              scheduleName={current.name}
              onCancel={() => setMode(null)}
              onImport={async ({ phones, ...payload }) => {
                const result = await createStudents({ scheduleId: current.id, ...payload });
                setPinSheet((prev) => [...prev, ...result.created]);
                // Phones are never sent to the server, so they are merged in
                // here purely to build the WhatsApp links.
                setPinPhones((prev) => ({ ...prev, ...(phones ?? {}) }));
                await load();
                return result;
              }}
            />
          )}
        </Modal>

        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم…"
            aria-label="ابحث بالاسم"
            className="max-w-xs"
          />
          <Select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            aria-label="تصفية بالمجموعة"
            className="max-w-48"
          >
            <option value="all">كل المجموعات</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>

        {students === null ? (
          <div className="mt-3">
            <SkeletonList rows={10} />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState>لا يوجد طلاب مطابقون.</EmptyState>
        ) : (
          <>
            {/* Phones get cards. The table needed 680px to lay out, which meant
                sideways scrolling on every phone — the columns were there but
                unreadable. */}
            <ul className="mt-3 space-y-2 lg:hidden">
              {visible.map((s) => (
                <li key={s.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setViewing(s)}
                        className="text-right font-semibold underline decoration-dotted underline-offset-4"
                      >
                        {s.full_name}
                      </button>
                      <p className="mt-0.5 text-xs break-words text-muted">
                        مجموعة: {groupName(s.group_id)}
                      </p>
                    </div>
                    <p className="shrink-0 text-lg font-bold tabular-nums text-brand">
                      {Number(totalFor(s.id)?.total_points ?? 0)}
                    </p>
                  </div>

                  <p className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-muted">
                    <span className="rounded-full bg-line px-2 py-0.5">
                      بنود {Number(totalFor(s.id)?.answer_points ?? 0)}
                    </span>
                    <span className="rounded-full bg-line px-2 py-0.5">
                      تقييم {Number(totalFor(s.id)?.grant_points ?? 0)}
                    </span>
                    {s.must_change_password && (
                      <span className="rounded-full bg-gold-100 px-2 py-0.5 font-bold text-gold-700">
                        رمز مؤقت
                      </span>
                    )}
                  </p>

                  {/* The group picker shares no row with the buttons any more.
                      Squeezed between them it rendered «بدون مج…», which is not
                      a group name and not "no group" either. */}
                  <div className="mt-2.5 space-y-2">
                    <Select
                      value={s.group_id ?? ''}
                      aria-label={`مجموعة ${s.full_name}`}
                      className="min-h-0 w-full py-1.5 text-xs"
                      onChange={(e) => setGroup(s, e.target.value || null)}
                    >
                      <option value="">بدون مجموعة</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </Select>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleActive(s)}
                        aria-pressed={s.is_active}
                        title="اضغط لتغيير الحالة"
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition hover:opacity-80 ${
                          s.is_active
                            ? 'border-ok-ink/30 bg-ok text-ok-ink'
                            : 'border-line bg-surface text-muted'
                        }`}
                      >
                        <span aria-hidden="true">{s.is_active ? '●' : '○'}</span>
                        {s.is_active ? 'نشط' : 'معطّل'}
                        <span aria-hidden="true" className="opacity-60">
                          ⇄
                        </span>
                      </button>

                      <Button
                        tone="outline"
                        className="min-h-0 px-3 py-1.5 text-xs"
                        onClick={() => setEditing(s)}
                      >
                        تعديل
                      </Button>

                      <Button
                        tone="outline"
                        className="min-h-0 px-3 py-1.5 text-xs"
                        onClick={() => resetPin(s)}
                      >
                        إعادة تعيين الرمز
                      </Button>

                      <Button
                        tone="danger"
                        className="min-h-0 px-3 py-1.5 text-xs"
                        onClick={() => setRemoving(s)}
                      >
                        حذف
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-3 hidden overflow-x-auto lg:block">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-line text-xs text-muted">
                  <tr>
                    <th className="p-2 font-semibold">الطالب</th>
                    <th className="p-2 font-semibold">المجموعة</th>
                    <th className="p-2 font-semibold">نقاط البنود</th>
                    <th className="p-2 font-semibold">نقاط التقييم</th>
                    <th className="p-2 font-semibold">الإجمالي</th>
                    <th className="p-2 font-semibold">الحالة</th>
                    <th className="p-2 font-semibold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => {
                    const t = totalFor(s.id);
                    return (
                      <tr key={s.id} className="border-b border-line/60">
                        <td className="p-2 font-semibold">
                          <button
                            type="button"
                            onClick={() => setViewing(s)}
                            className="font-semibold underline decoration-dotted underline-offset-4 hover:text-brand"
                          >
                            {s.full_name}
                          </button>
                          {s.must_change_password && (
                            <span className="ms-2 rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-bold text-gold-700">
                              رمز مؤقت
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          <Select
                            value={s.group_id ?? ''}
                            aria-label={`مجموعة ${s.full_name}`}
                            className="min-h-0 py-1 text-xs"
                            onChange={(e) => setGroup(s, e.target.value || null)}
                          >
                            <option value="">بدون</option>
                            {groups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="p-2 tabular-nums">{Number(t?.answer_points ?? 0)}</td>
                        <td className="p-2 tabular-nums">{Number(t?.grant_points ?? 0)}</td>
                        <td className="p-2 font-bold tabular-nums text-brand">
                          {Number(t?.total_points ?? 0)}
                        </td>
                        <td className="p-2">
                          <button
                            type="button"
                            onClick={() => toggleActive(s)}
                            aria-pressed={s.is_active}
                            title="اضغط لتغيير الحالة"
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition hover:opacity-80 ${
                              s.is_active
                                ? 'border-ok-ink/30 bg-ok text-ok-ink'
                                : 'border-line bg-surface text-muted'
                            }`}
                          >
                            <span aria-hidden="true">{s.is_active ? '●' : '○'}</span>
                            {s.is_active ? 'نشط' : 'معطّل'}
                            <span aria-hidden="true" className="opacity-60">
                              ⇄
                            </span>
                          </button>
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              tone="outline"
                              className="min-h-0 px-3 py-1.5 text-xs"
                              onClick={() => setEditing(s)}
                            >
                              تعديل
                            </Button>
                            <Button
                              tone="outline"
                              className="min-h-0 px-3 py-1.5 text-xs"
                              onClick={() => resetPin(s)}
                            >
                              إعادة تعيين الرمز
                            </Button>
                            <Button
                              tone="danger"
                              className="min-h-0 px-3 py-1.5 text-xs"
                              onClick={() => setRemoving(s)}
                            >
                              حذف
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <EditStudentForm
        student={editing}
        groups={groups}
        error={dialogError}
        onCancel={() => setEditing(null)}
        onSubmit={(values) => saveEdit(editing, values)}
      />

      <DeleteStudentDialog
        student={removing}
        error={dialogError}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removeStudent(removing)}
      />

      {/* The same record the leaderboard opens. One screen for "what has this
          student done", reachable from wherever the question comes up. */}
      <StudentBreakdown
        student={
          viewing
            ? {
                student_id: viewing.id,
                full_name: viewing.full_name,
                group_name: groupName(viewing.group_id),
                answer_points: totalFor(viewing.id)?.answer_points ?? 0,
                grant_points: totalFor(viewing.id)?.grant_points ?? 0,
                total_points: totalFor(viewing.id)?.total_points ?? 0,
              }
            : null
        }
        schedule={current}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}

function EditStudentForm({ student, groups, error, onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);

  // Seeded each time it opens on a student, not at mount: the dialog stays
  // mounted between openings and would otherwise show the previous one.
  useEffect(() => {
    if (!student) return;
    setName(student.full_name);
    setGroupId(student.group_id ?? '');
  }, [student]);

  return (
    <Modal
      open={Boolean(student)}
      onClose={onCancel}
      title="تعديل بيانات الطالب"
      error={error}
      description="الرمز السري لا يتغيّر من هنا — استخدم «إعادة تعيين الرمز»."
      size="sm"
    >
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          setBusy(true);
          await onSubmit({ full_name: trimmed, group_id: groupId || null });
          setBusy(false);
        }}
      >
        <Field label="اسم الطالب" htmlFor="edit-stname">
          <Input
            id="edit-stname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>

        <Field label="المجموعة" htmlFor="edit-stgroup">
          <Select id="edit-stgroup" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">بدون مجموعة</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>

        <ModalActions>
          <Button type="submit" loading={busy}>
            حفظ
          </Button>
          <Button tone="ghost" onClick={onCancel}>
            إلغاء
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}

/**
 * Deleting a student takes their answers and their points with them, and there
 * is no undo. The name has to be typed back to confirm — the button sits next
 * to «تعديل» on a phone, and a mis-tap should not be able to erase a term's
 * worth of a student's record.
 */
function DeleteStudentDialog({ student, error, onConfirm, onCancel }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setTyped(''), [student]);

  const matches = student ? typed.trim() === student.full_name.trim() : false;

  return (
    <Modal
      open={Boolean(student)}
      onClose={onCancel}
      title="حذف الطالب"
      error={error}
      size="sm"
    >
      {student && (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!matches) return;
            setBusy(true);
            await onConfirm();
            setBusy(false);
          }}
        >
          <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-ink">
            سيُحذف <span className="font-bold">{student.full_name}</span> نهائياً مع كل إجاباته
            ونقاطه وحساب دخوله. لا يمكن التراجع عن هذا.
          </p>
          <p className="text-xs text-muted">
            لإيقاف الطالب مؤقتاً دون فقدان سجلّه، اضغط «نشط» بدلاً من الحذف.
          </p>

          <Field label="اكتب اسم الطالب للتأكيد" htmlFor="del-stname">
            <Input
              id="del-stname"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={student.full_name}
              autoComplete="off"
            />
          </Field>

          <ModalActions>
            <Button type="submit" tone="danger" loading={busy} disabled={!matches}>
              حذف نهائياً
            </Button>
            <Button tone="ghost" onClick={onCancel}>
              إلغاء
            </Button>
          </ModalActions>
        </form>
      )}
    </Modal>
  );
}

function AddStudentForm({ open, groups, error, onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setGroupId(groups[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="إضافة طالب"
      error={error}
      description="يُنشأ رمز دخول مؤقت للطالب بعد الحفظ."
      size="sm"
    >
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          await onSubmit({ groupId: groupId || null, students: [{ full_name: name.trim() }] });
          setBusy(false);
        }}
      >
        <Field label="اسم الطالب" htmlFor="stname">
          <Input id="stname" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>

        <Field label="المجموعة" htmlFor="stgroup">
          <Select id="stgroup" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">بدون مجموعة</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>

        <ModalActions>
          <Button type="submit" loading={busy}>
            إضافة
          </Button>
          <Button tone="ghost" onClick={onCancel}>
            إلغاء
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}
