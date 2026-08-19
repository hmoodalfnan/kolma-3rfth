'use client';

import { useEffect, useState } from 'react';
import { EmptyState, ErrorText } from '@/components/manage/Panel';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea, NumberInput, Select } from '@/components/ui/Field';
import { Modal, ModalActions } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SkeletonList } from '@/components/ui/Skeleton';
import {
  listAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
} from '@/lib/admin/tasks';

const EMPTY = { kind: 'read', title: '', body_text: '', points: '10' };
const KIND_LABEL = { read: '📖 قراءة', listen: '🎧 استماع' };

export function AssignmentsScreen() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  async function reload() {
    try {
      setItems(await listAssignments());
    } catch {
      setError('تعذّر تحميل المهام');
      setItems([]);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function openNew() {
    setForm(EMPTY);
    setEditing('new');
  }
  function openEdit(a) {
    setForm({ kind: a.kind, title: a.title, body_text: a.body_text || '', points: String(a.points) });
    setEditing(a.id);
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
        await createAssignment({ ...form, sort_order: (items?.length || 0) + 1 });
      } else {
        await updateAssignment(editing, {
          kind: form.kind,
          title: form.title,
          body_text: form.body_text,
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

  async function toggleActive(a) {
    try {
      await updateAssignment(a.id, { is_active: !a.is_active });
      await reload();
    } catch {
      setError('تعذّر التحديث');
    }
  }

  async function remove() {
    const id = confirmDel;
    setConfirmDel(null);
    try {
      await deleteAssignment(id);
      await reload();
    } catch {
      setError('تعذّر الحذف');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand">المهام المستمرة</h1>
        <Button onClick={openNew}>+ مهمة جديدة</Button>
      </div>
      <p className="text-sm text-muted">
        مهام «قراءة» و«استماع» تبقى في قائمة المستخدم عبر الأيام حتى ينهيها.
      </p>

      <ErrorText>{error}</ErrorText>

      {items === null ? (
        <SkeletonList rows={3} />
      ) : items.length === 0 ? (
        <EmptyState>لا توجد مهام مستمرة بعد.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className={`card space-y-1 p-3 ${a.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 text-xs font-semibold text-chip-ink">
                  {KIND_LABEL[a.kind]}
                </span>
                <p className="min-w-0 flex-1 font-semibold text-ink">{a.title}</p>
                <span className="shrink-0 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-bold text-gold-700">
                  {a.points} نقطة
                </span>
              </div>
              {a.body_text && <p className="line-clamp-2 text-xs text-muted">{a.body_text}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => toggleActive(a)} className="rounded-lg border border-line px-2 py-1 text-xs font-semibold">
                  {a.is_active ? 'مفعّلة' : 'معطّلة'}
                </button>
                <button type="button" onClick={() => openEdit(a)} className="rounded-lg border border-line px-2 py-1 text-xs font-semibold text-brand">
                  تعديل
                </button>
                <button type="button" onClick={() => setConfirmDel(a.id)} className="rounded-lg border border-line px-2 py-1 text-xs font-semibold text-rose-600">
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'مهمة مستمرة جديدة' : 'تعديل المهمة'}
        size="md"
      >
        <div className="space-y-3">
          <Field label="النوع" htmlFor="a-kind">
            <Select id="a-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="read">قراءة</option>
              <option value="listen">استماع</option>
            </Select>
          </Field>
          <Field label="العنوان" htmlFor="a-title">
            <Input id="a-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field
            label="المحتوى"
            htmlFor="a-body"
            hint={form.kind === 'read' ? 'النص الذي سيقرؤه المستخدم داخل التطبيق.' : 'تعليمات الاستماع (المقطع يُرسل في مجتمع الواتساب).'}
          >
            <Textarea id="a-body" className="min-h-40" value={form.body_text} onChange={(e) => setForm({ ...form, body_text: e.target.value })} />
          </Field>
          <Field label="النقاط" htmlFor="a-points">
            <NumberInput id="a-points" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
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
