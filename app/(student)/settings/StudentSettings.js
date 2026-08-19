'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SkeletonList } from '@/components/ui/Skeleton';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { EmojiPicker } from '@/components/ui/EmojiPicker';
import { PasskeyManager } from '@/components/auth/PasskeyManager';
import { signOut } from '@/lib/auth/session';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useStudentContext } from '@/lib/student/useStudentContext';

export function StudentSettings() {
  const ctx = useStudentContext();
  const [emoji, setEmoji] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  if (ctx.status !== 'ready') return <SkeletonList rows={6} />;

  const current = emoji ?? ctx.student.emoji ?? '';
  const dirty = emoji !== null && emoji !== ctx.student.emoji;

  async function saveEmoji() {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const { error: e } = await getBrowserClient()
        .from('students')
        .update({ emoji: current })
        .eq('id', ctx.student.id);
      if (e) throw e;
      ctx.student.emoji = current; // keep the in-memory copy in step
      setSaved(true);
    } catch {
      setError('تعذّر حفظ الرمز');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">الإعدادات</h1>

      <section className="card space-y-2 p-4 text-sm">
        <Row label="الاسم" value={ctx.student.full_name} />
        <Row label="رمزك" value={current || '—'} />
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-bold text-muted">غيّر رمزك</h2>
        <EmojiPicker value={current} onChange={(v) => { setEmoji(v); setSaved(false); }} />
        {error && <p className="text-xs font-semibold text-danger-ink">{error}</p>}
        {saved && <p className="text-xs font-semibold text-ok-ink">تم الحفظ</p>}
        <Button className="w-full" loading={saving} disabled={!dirty} onClick={saveEmoji}>
          حفظ الرمز
        </Button>
      </section>

      <PasskeyManager />

      <section className="card space-y-3 p-4">
        <ThemeToggle />
        <Button tone="danger" className="w-full" onClick={() => signOut('/login')}>
          تسجيل الخروج
        </Button>
      </section>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
