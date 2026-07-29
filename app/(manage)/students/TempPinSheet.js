'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

function buildMessage({ origin, scheduleName, fullName, tempPin, slug }) {
  return [
    `حياك الله ${fullName}، تم تسجيلك في ${scheduleName}.`,
    '',
    `الرابط: ${origin}/j/${slug}`,
    `اسمك في القائمة: ${fullName}`,
    `الرمز المؤقت: ${tempPin}`,
    '',
    'افتح الرابط، اختر اسمك من القائمة، ثم أدخل الرمز. سيُطلب منك تغييره عند أول دخول.',
  ].join('\n');
}

/**
 * Shows temporary PINs once, for handing over.
 *
 * These used to be printed and cut up. Copying a message per student matches how
 * they actually reach people — a chat app — and avoids leaving a sheet of live
 * credentials lying around. A PIN cannot be read back afterwards, only reset, so
 * this is the one chance to take it.
 */
export function TempPinSheet({ entries, scheduleName, slug, onClose }) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => setCopied(''), [entries]);

  if (!entries?.length) return null;

  const messageFor = (entry) =>
    buildMessage({
      origin,
      scheduleName,
      slug,
      fullName: entry.full_name,
      tempPin: entry.tempPin,
    });

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      // Denied outside a secure context and in some in-app browsers; the text
      // stays selectable on screen either way.
      setCopied('failed');
    }
  }

  return (
    <div className="card border-gold-500 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-brand">
            {entries.length === 1 ? 'الرمز المؤقت' : `الأرقام السرية المؤقتة (${entries.length})`}
          </h2>
          <p className="mt-1 text-xs text-rose-600">
            انسخ الرسائل الآن — لن تظهر هذه الأرقام مرة أخرى، ويمكنك فقط إعادة التعيين لاحقاً.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {entries.length > 1 && (
            <Button
              tone="gold"
              onClick={() => copy(entries.map(messageFor).join('\n\n———\n\n'), 'كل الرسائل')}
            >
              نسخ كل الرسائل
            </Button>
          )}
          <Button tone="ghost" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      </div>

      {copied === 'failed' && (
        <p role="alert" className="mb-2 text-xs font-semibold text-rose-600">
          تعذّر النسخ تلقائياً — حدّد الرمز وانسخه يدوياً.
        </p>
      )}
      {copied && copied !== 'failed' && (
        <p role="status" className="mb-2 text-xs font-semibold text-ok-ink">
          تم نسخ {copied}.
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((e) => (
          <li key={e.id} className="rounded-xl border border-line p-3">
            <p className="font-bold">{e.full_name}</p>
            <p className="mt-2 text-xs text-muted">الرمز المؤقت</p>
            <p className="select-all text-2xl font-bold tracking-widest tabular-nums" dir="ltr">
              {e.tempPin}
            </p>
            <Button
              className="mt-2 min-h-0 w-full px-3 py-1.5 text-xs"
              onClick={() => copy(messageFor(e), `رسالة ${e.full_name}`)}
            >
              نسخ الرسالة
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
