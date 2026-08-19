'use client';

import { useEffect, useState } from 'react';
import { EmptyState, ErrorText } from '@/components/manage/Panel';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { SkeletonList } from '@/components/ui/Skeleton';
import { isValidEmoji } from '@/lib/identity/emojis';
import { listEmojiChoices, addEmojiChoice, deleteEmojiChoice } from '@/lib/admin/emojis';

export function EmojisScreen() {
  const [rows, setRows] = useState(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setRows(await listEmojiChoices());
      } catch {
        setError('تعذّر تحميل الرموز');
        setRows([]);
      }
    })();
  }, []);

  async function add(event) {
    event.preventDefault();
    setError('');
    const emoji = draft.trim();
    if (!isValidEmoji(emoji)) {
      setError('أدخل رمزاً واحداً صالحاً (إيموجي)');
      return;
    }
    if (rows?.some((r) => r.emoji === emoji)) {
      setError('هذا الرمز موجود بالفعل');
      return;
    }
    setBusy(true);
    try {
      await addEmojiChoice(emoji);
      setRows(await listEmojiChoices());
      setDraft('');
    } catch (e) {
      setError(/duplicate|unique/i.test(e?.message || '') ? 'هذا الرمز موجود بالفعل' : 'تعذّرت الإضافة');
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    setError('');
    try {
      await deleteEmojiChoice(row.id);
      setRows((list) => list.filter((r) => r.id !== row.id));
    } catch {
      setError('تعذّر الحذف');
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-brand">الرموز</h1>
      <p className="text-sm text-muted">
        هذه الرموز يختار منها المستخدم هويته عند التسجيل. أضف أو احذف ما تشاء.
      </p>

      <form onSubmit={add} className="card flex items-end gap-3 p-4">
        <div className="flex-1">
          <Field label="رمز جديد" htmlFor="emoji" hint="ألصق إيموجي واحداً">
            <Input
              id="emoji"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={16}
              className="text-2xl"
              autoComplete="off"
            />
          </Field>
        </div>
        <Button type="submit" loading={busy} disabled={!draft.trim()}>
          إضافة
        </Button>
      </form>

      <ErrorText>{error}</ErrorText>

      {rows === null ? (
        <SkeletonList rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState>لا توجد رموز بعد — أضف أول رمز.</EmptyState>
      ) : (
        <div className="card p-3">
          <p className="mb-2 px-1 text-xs text-muted">{rows.length} رمزاً</p>
          <ul className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {rows.map((row) => (
              <li key={row.id} className="relative">
                <div className="flex aspect-square items-center justify-center rounded-lg bg-chip text-2xl">
                  <span aria-hidden="true">{row.emoji}</span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(row)}
                  aria-label={`حذف ${row.emoji}`}
                  className="absolute -end-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-rose-600 text-xs font-bold leading-none text-white shadow transition hover:opacity-90"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
