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
} from '@/lib/manage/api';
import { fetchStudentTotals } from '@/lib/boards/queries';
import { getBrowserClient } from '@/lib/supabase/browser';
import { ImportWizard } from './ImportWizard';
import { TempPinSheet } from './TempPinSheet';

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
  const [error, setError] = useState('');

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

  const groupName = (id) => groups.find((g) => g.id === id)?.name ?? '—';

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>

      {pinSheet.length > 0 && (
        <TempPinSheet
          entries={pinSheet}
          scheduleName={current.name}
          slug={current.slug}
          onClose={() => setPinSheet([])}
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
              onCancel={() => setMode(null)}
              onImport={async (payload) => {
                const result = await createStudents({ scheduleId: current.id, ...payload });
                setPinSheet((prev) => [...prev, ...result.created]);
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
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] text-right text-sm">
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
                        {s.full_name}
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
                          onChange={async (e) => {
                            const groupId = e.target.value || null;
                            const before = s.group_id;
                            setStudents((rows) =>
                              rows.map((r) => (r.id === s.id ? { ...r, group_id: groupId } : r)),
                            );
                            try {
                              await updateStudent(s.id, { group_id: groupId });
                            } catch (err) {
                              setStudents((rows) =>
                                rows.map((r) => (r.id === s.id ? { ...r, group_id: before } : r)),
                              );
                              setError(err.message);
                            }
                          }}
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
                          onClick={async () => {
                            const next = !s.is_active;
                            setStudents((rows) =>
                              rows.map((r) => (r.id === s.id ? { ...r, is_active: next } : r)),
                            );
                            try {
                              await updateStudent(s.id, { is_active: next });
                            } catch (err) {
                              setStudents((rows) =>
                                rows.map((r) =>
                                  r.id === s.id ? { ...r, is_active: !next } : r,
                                ),
                              );
                              setError(err.message);
                            }
                          }}
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            s.is_active ? 'bg-ok text-ok-ink' : 'bg-line text-muted'
                          }`}
                        >
                          {s.is_active ? 'نشط' : 'معطّل'}
                        </button>
                      </td>
                      <td className="p-2">
                        <Button
                          tone="ghost"
                          className="min-h-0 px-2 py-1 text-xs"
                          onClick={async () => {
                            try {
                              const res = await resetStudentPin(s.id);
                              setPinSheet([
                                { id: s.id, full_name: res.full_name, tempPin: res.tempPin },
                              ]);
                              await load();
                            } catch (err) {
                              setError(err.message);
                            }
                          }}
                        >
                          إعادة تعيين الرمز
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
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
