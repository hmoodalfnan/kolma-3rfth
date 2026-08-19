'use client';

import { useEffect, useState } from 'react';
import { EmptyState, ErrorText } from '@/components/manage/Panel';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { EmojiPicker } from '@/components/ui/EmojiPicker';
import { Modal, ModalActions } from '@/components/ui/Modal';
import { SkeletonList } from '@/components/ui/Skeleton';
import { getBrowserClient } from '@/lib/supabase/browser';
import { post } from '@/lib/manage/api';

const EMPTY = { fullName: '', email: '', password: '', emoji: '' };

export function AdminsScreen() {
  const [admins, setAdmins] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  async function reload() {
    const { data, error: e } = await getBrowserClient()
      .from('app_users')
      .select('id, display_name, username, is_active')
      .eq('role', 'super_admin')
      .order('display_name');
    if (e) {
      setError('تعذّر تحميل المشرفين');
      setAdmins([]);
    } else {
      setAdmins(data || []);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function save() {
    setError('');
    if (!form.fullName.trim() || !form.email.trim() || form.password.length < 8) {
      setError('أكمل الاسم والبريد وكلمة مرور من 8 أحرف على الأقل');
      return;
    }
    setSaving(true);
    try {
      await post('/api/admins/create', {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        ...(form.emoji ? { emoji: form.emoji } : {}),
      });
      setOpen(false);
      setForm(EMPTY);
      await reload();
    } catch (err) {
      setError(err.message || 'تعذّر إنشاء المشرف');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand">المشرفون</h1>
        <Button onClick={() => { setForm(EMPTY); setOpen(true); }}>+ مشرف جديد</Button>
      </div>
      <p className="text-sm text-muted">
        المشرف يملك كل الصلاحيات، وهو أيضاً مستخدم عادي يمكنه التبديل إلى وضع المستخدم.
      </p>

      <ErrorText>{error}</ErrorText>

      {admins === null ? (
        <SkeletonList rows={3} />
      ) : admins.length === 0 ? (
        <EmptyState>لا يوجد مشرفون.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {admins.map((a) => (
            <li key={a.id} className="card flex items-center gap-3 p-3">
              <span className="text-lg" aria-hidden="true">🛡️</span>
              <span className="min-w-0 flex-1 font-semibold text-ink">{a.display_name}</span>
              {!a.is_active && <span className="text-xs text-muted">معطّل</span>}
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="مشرف جديد" size="md">
        <div className="space-y-3">
          <Field label="الاسم" htmlFor="ad-name">
            <Input id="ad-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </Field>
          <Field label="البريد الإلكتروني" htmlFor="ad-email">
            <Input id="ad-email" type="email" dir="ltr" autoCapitalize="none" spellCheck={false} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="كلمة المرور" htmlFor="ad-pass" hint="8 أحرف على الأقل">
            <Input id="ad-pass" type="password" dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="الرمز (اختياري)">
            <EmojiPicker value={form.emoji} onChange={(v) => setForm({ ...form, emoji: v })} />
          </Field>
          <ModalActions>
            <Button loading={saving} onClick={save}>إنشاء</Button>
            <Button tone="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
          </ModalActions>
        </div>
      </Modal>
    </div>
  );
}
