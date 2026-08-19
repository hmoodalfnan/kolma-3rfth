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

  // "Promote an existing user" flow: pick a registered user, grant the role.
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [candidates, setCandidates] = useState(null);
  const [search, setSearch] = useState('');
  const [promoting, setPromoting] = useState(null);

  async function reload() {
    const { data, error: e } = await getBrowserClient()
      .from('app_users')
      .select('id, display_name, username, is_active')
      .eq('role', 'super_admin')
      .order('display_name');
    if (e) {
      setError('تعذّر تحميل المشرفين');
      setAdmins([]);
      return [];
    }
    setAdmins(data || []);
    return data || [];
  }

  useEffect(() => {
    reload();
  }, []);

  // Registered users who are not already admins, for the promote picker.
  async function openPromote() {
    setSearch('');
    setCandidates(null);
    setPromoteOpen(true);
    const adminIds = new Set((admins || []).map((a) => a.id));
    const { data, error: e } = await getBrowserClient()
      .from('students')
      .select('auth_uid, full_name, email, emoji')
      .eq('is_active', true)
      .order('full_name');
    if (e) {
      setError('تعذّر تحميل المستخدمين');
      setCandidates([]);
      return;
    }
    setCandidates((data || []).filter((u) => u.auth_uid && !adminIds.has(u.auth_uid)));
  }

  async function promote(user) {
    setError('');
    setPromoting(user.auth_uid);
    try {
      await post('/api/admins/promote', { userId: user.auth_uid });
      const fresh = await reload();
      const freshIds = new Set(fresh.map((a) => a.id));
      setCandidates((rows) => (rows || []).filter((u) => !freshIds.has(u.auth_uid)));
    } catch (err) {
      setError(err.message || 'تعذّر ترقية المستخدم');
    } finally {
      setPromoting(null);
    }
  }

  const filtered = (candidates || []).filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  });

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
        <div className="flex gap-2">
          <Button tone="outline" onClick={openPromote}>ترقية مستخدم</Button>
          <Button onClick={() => { setForm(EMPTY); setOpen(true); }}>+ مشرف جديد</Button>
        </div>
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

      <Modal
        open={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        title="ترقية مستخدم موجود"
        description="امنح صلاحيات المشرف لمستخدم أنشأ حسابه بنفسه — لا حاجة لبريد أو كلمة مرور جديدة."
        size="md"
      >
        <div className="space-y-3">
          <Field label="بحث" htmlFor="pr-search">
            <Input
              id="pr-search"
              placeholder="ابحث بالاسم أو البريد"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>

          {candidates === null ? (
            <SkeletonList rows={5} />
          ) : filtered.length === 0 ? (
            <EmptyState>
              {candidates.length === 0 ? 'كل المستخدمين مشرفون بالفعل.' : 'لا نتائج مطابقة.'}
            </EmptyState>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {filtered.map((u) => (
                <li key={u.auth_uid} className="card flex items-center gap-3 p-3">
                  <span className="text-lg" aria-hidden="true">{u.emoji || '👤'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{u.full_name}</span>
                    {u.email && <span className="block truncate text-xs text-muted" dir="ltr">{u.email}</span>}
                  </span>
                  <Button
                    className="min-h-0 shrink-0 px-3 py-1.5 text-xs"
                    loading={promoting === u.auth_uid}
                    onClick={() => promote(u)}
                  >
                    ترقية
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <ModalActions>
            <Button tone="ghost" onClick={() => setPromoteOpen(false)}>إغلاق</Button>
          </ModalActions>
        </div>
      </Modal>
    </div>
  );
}
