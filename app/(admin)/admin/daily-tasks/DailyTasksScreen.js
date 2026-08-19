'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmptyState, ErrorText } from '@/components/manage/Panel';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea, NumberInput, Select } from '@/components/ui/Field';
import { Modal, ModalActions } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SkeletonList } from '@/components/ui/Skeleton';
import {
  listDailyTasks,
  createDailyTask,
  updateDailyTask,
  deleteDailyTask,
} from '@/lib/admin/tasks';

const NEW_CATEGORY = '__new__';
const EMPTY = {
  title: '',
  description: '',
  category: '',
  points: '5',
  active_from: '',
  active_to: '',
};

export function DailyTasksScreen() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // task object or EMPTY (new)
  const [form, setForm] = useState(EMPTY);
  const [newCategory, setNewCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  // Distinct categories already in use, offered in the select so the admin
  // reuses an existing group instead of typing a near-duplicate.
  const categories = useMemo(() => {
    const set = new Set();
    for (const t of tasks || []) if (t.category) set.add(t.category);
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [tasks]);

  // Tasks grouped by category for display; '' becomes the "بدون قسم" bucket.
  const groups = useMemo(() => {
    const map = new Map();
    for (const t of tasks || []) {
      const key = t.category || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === b) return 0;
      if (a === '') return 1; // uncategorised last
      if (b === '') return -1;
      return a.localeCompare(b, 'ar');
    });
  }, [tasks]);

  async function reload() {
    try {
      setTasks(await listDailyTasks());
    } catch {
      setError('تعذّر تحميل المهام');
      setTasks([]);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function openNew() {
    setForm(EMPTY);
    setNewCategory(false);
    setEditing('new');
  }
  function openEdit(t) {
    setForm({
      title: t.title,
      description: t.description || '',
      category: t.category || '',
      points: String(t.points),
      active_from: t.active_from || '',
      active_to: t.active_to || '',
    });
    // An existing category not offered in the list only happens transiently; the
    // select still shows it because it is seeded from the tasks themselves.
    setNewCategory(false);
    setEditing(t.id);
  }

  async function save() {
    if (!form.title.trim()) {
      setError('العنوان مطلوب');
      return;
    }
    if (form.active_from && form.active_to && form.active_to < form.active_from) {
      setError('تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description,
        category: form.category.trim(),
        points: Number(form.points) || 0,
        active_from: form.active_from || null,
        active_to: form.active_to || null,
      };
      if (editing === 'new') {
        await createDailyTask({ ...payload, sort_order: (tasks?.length || 0) + 1 });
      } else {
        await updateDailyTask(editing, payload);
      }
      setEditing(null);
      await reload();
    } catch {
      setError('تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t) {
    try {
      await updateDailyTask(t.id, { is_active: !t.is_active });
      await reload();
    } catch {
      setError('تعذّر التحديث');
    }
  }

  async function remove() {
    const id = confirmDel;
    setConfirmDel(null);
    try {
      await deleteDailyTask(id);
      await reload();
    } catch {
      setError('تعذّر الحذف');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand">المهام اليومية</h1>
        <Button onClick={openNew}>+ مهمة جديدة</Button>
      </div>
      <p className="text-sm text-muted">مهام تتكرر كل يوم ويكسب المستخدم نقاطها عند إتمامها.</p>

      <ErrorText>{error}</ErrorText>

      {tasks === null ? (
        <SkeletonList rows={4} />
      ) : tasks.length === 0 ? (
        <EmptyState>لا توجد مهام بعد. أضف أول مهمة.</EmptyState>
      ) : (
        <div className="space-y-5">
          {groups.map(([category, items]) => (
            <section key={category || '__none__'} className="space-y-2">
              <h2 className="px-1 text-sm font-bold text-muted">{category || 'بدون قسم'}</h2>
              <ul className="space-y-2">
                {items.map((t) => (
                  <li
                    key={t.id}
                    className={`card flex items-center gap-3 p-3 ${t.is_active ? '' : 'opacity-60'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{t.title}</p>
                      {t.description && <p className="truncate text-xs text-muted">{t.description}</p>}
                      {(t.active_from || t.active_to) && (
                        <p className="text-[11px] text-muted">
                          {t.active_from && `من ${t.active_from}`}
                          {t.active_from && t.active_to && ' — '}
                          {t.active_to && `إلى ${t.active_to}`}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-bold text-gold-700">
                      {t.points} نقطة
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleActive(t)}
                      className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs font-semibold"
                    >
                      {t.is_active ? 'مفعّلة' : 'معطّلة'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs font-semibold text-brand"
                    >
                      تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDel(t.id)}
                      className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs font-semibold text-rose-600"
                    >
                      حذف
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'مهمة جديدة' : 'تعديل المهمة'}
        size="md"
      >
        <div className="space-y-3">
          <Field label="العنوان" htmlFor="t-title">
            <Input id="t-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>

          <Field
            label="القسم"
            htmlFor="t-category"
            hint={
              newCategory
                ? 'سيُنشأ قسم جديد بهذا الاسم.'
                : 'اختر قسماً موجوداً، أو «قسم جديد…» لإنشاء واحد.'
            }
          >
            <Select
              id="t-category"
              value={newCategory ? NEW_CATEGORY : form.category}
              onChange={(e) => {
                if (e.target.value === NEW_CATEGORY) {
                  setNewCategory(true);
                  setForm({ ...form, category: '' });
                } else {
                  setNewCategory(false);
                  setForm({ ...form, category: e.target.value });
                }
              }}
            >
              <option value="">بدون قسم</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={NEW_CATEGORY}>قسم جديد…</option>
            </Select>
            {newCategory && (
              <Input
                aria-label="اسم القسم الجديد"
                placeholder="اسم القسم الجديد"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-2"
                autoFocus
              />
            )}
          </Field>

          <Field label="الوصف (اختياري)" htmlFor="t-desc">
            <Textarea id="t-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="النقاط" htmlFor="t-points">
            <NumberInput id="t-points" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="يبدأ من (اختياري)" htmlFor="t-from">
              <Input
                id="t-from"
                type="date"
                value={form.active_from}
                onChange={(e) => setForm({ ...form, active_from: e.target.value })}
              />
            </Field>
            <Field label="ينتهي في (اختياري)" htmlFor="t-to">
              <Input
                id="t-to"
                type="date"
                value={form.active_to}
                onChange={(e) => setForm({ ...form, active_to: e.target.value })}
              />
            </Field>
          </div>

          <ModalActions>
            <Button loading={saving} onClick={save}>حفظ</Button>
            <Button tone="ghost" onClick={() => setEditing(null)}>إلغاء</Button>
          </ModalActions>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDel !== null}
        title="حذف المهمة"
        message="سيُحذف سجل إتمام هذه المهمة لكل المستخدمين. لا يمكن التراجع."
        confirmLabel="حذف"
        onConfirm={remove}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
