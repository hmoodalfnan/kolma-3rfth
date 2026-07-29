'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';

/** Credentials disappear on their own after this long. */
const VISIBLE_MS = 10 * 60 * 1000;

function buildMessage({ origin, scheduleName, fullName, tempPin, slug }) {
  return [
    `حياك الله ${fullName}، تم تسجيلك في رحلة: ${scheduleName}.`,
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
 * Live credentials should not sit on a screen indefinitely, so the panel clears
 * itself after ten minutes — long enough to send them, short enough that a
 * forgotten tab in a shared room is not a list of working logins. Anyone who
 * runs out of time resets the PIN, which is a deliberate cost.
 */
export function TempPinSheet({ entries, scheduleName, slug, phones = {}, onClose }) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState('');
  const [remainingMs, setRemainingMs] = useState(VISIBLE_MS);

  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    if (!entries?.length) return undefined;

    const expiresAt = Date.now() + VISIBLE_MS;
    setCopied('');
    setRemainingMs(VISIBLE_MS);

    const tick = setInterval(() => {
      const left = expiresAt - Date.now();
      setRemainingMs(left);
      if (left <= 0) onClose();
    }, 1000);

    return () => clearInterval(tick);
  }, [entries, onClose]);

  const messageFor = useMemo(
    () => (entry) =>
      buildMessage({
        origin,
        scheduleName,
        slug,
        fullName: entry.full_name,
        tempPin: entry.tempPin,
      }),
    [origin, scheduleName, slug],
  );

  if (!entries?.length) return null;

  const minutes = Math.max(0, Math.floor(remainingMs / 60000));
  const seconds = Math.max(0, Math.floor((remainingMs % 60000) / 1000));

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied('failed');
    }
  }

  const allDetails = entries
    .map((e) => `${e.full_name} — الرمز: ${e.tempPin}`)
    .join('\n');

  return (
    <div className="card border-gold-500 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-brand">
            {entries.length === 1 ? 'الرمز المؤقت' : `الأرقام السرية المؤقتة (${entries.length})`}
          </h2>
          <p className="mt-1 text-xs text-rose-600">
            تختفي هذه البيانات تلقائياً بعد{' '}
            <span className="tabular-nums" dir="ltr">
              {minutes}:{String(seconds).padStart(2, '0')}
            </span>{' '}
            — انسخها الآن. بعدها لا يمكن استرجاعها، فقط إعادة التعيين.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            tone="gold"
            onClick={() => copy(entries.map(messageFor).join('\n\n———\n\n'), 'كل الرسائل')}
          >
            نسخ كل الرسائل
          </Button>
          <Button tone="outline" onClick={() => copy(allDetails, 'قائمة الأسماء والأرقام')}>
            نسخ الأسماء والأرقام
          </Button>
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
        {entries.map((e) => {
          const phone = phones[e.full_name];
          return (
            <li key={e.id} className="rounded-xl border border-line p-3">
              <p className="font-bold">{e.full_name}</p>
              <p className="mt-2 text-xs text-muted">الرمز المؤقت</p>
              <p className="select-all text-2xl font-bold tracking-widest tabular-nums" dir="ltr">
                {e.tempPin}
              </p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  className="min-h-0 flex-1 px-3 py-1.5 text-xs"
                  onClick={() => copy(messageFor(e), `رسالة ${e.full_name}`)}
                >
                  نسخ الرسالة
                </Button>

                {/* wa.me opens WhatsApp with the message already written, so
                    sending is one tap instead of copy, switch app, find the
                    contact, paste. */}
                {phone && (
                  <a
                    href={`https://wa.me/${phone}?text=${encodeURIComponent(messageFor(e))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-0 flex-1 items-center justify-center gap-1 rounded-xl bg-ok px-3 py-1.5 text-xs font-semibold text-ok-ink"
                  >
                    واتساب
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
