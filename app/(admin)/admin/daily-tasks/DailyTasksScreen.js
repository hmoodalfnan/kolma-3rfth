'use client';

import { useEffect, useState } from 'react';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea, NumberInput } from '@/components/ui/Field';
import { Modal, ModalActions } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SkeletonList } from '@/components/ui/Skeleton';
import {
  listDailyTasks,
  createDailyTask,
  updateDailyTask,
  deleteDailyTask,
} from '@/lib/admin/tasks';

const EMPTY = { title: '', description: '', points: '5' };

export function DailyTasksScreen() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // task object or EMPTY (new)
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

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
    setEditing('new');
  }
  function openEdit(t) {
    setForm({ title: t.title, description: t.description || '', points: String(t.points) });
    setEditing(t.id);
  }

  async function save() {
    if (!form.title.trim()) {
      setError('العنوان مطلوب');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing === 'new') {
        await createDailyTask({ ...form, sort_order: (tasks?.length || 0) + 1 });
      } else {
        await updateDailyTask(editing, {
          title: form.title,
          description: form.description,
          points: Number(form.points) || 0,
        });
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
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className={`card flex items-center gap-3 p-3 ${t.is_active ? '' : 'opacity-60'}`}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{t.title}</p>
                {t.description && <p className="truncate text-xs text-muted">{t.description}</p>}
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
          <Field label="الوصف (اختياري)" htmlFor="t-desc">
            <Textarea id="t-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="النقاط" htmlFor="t-points">
            <NumberInput id="t-points" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
          </Field>
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
