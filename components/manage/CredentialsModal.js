'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal, ModalActions } from '@/components/ui/Modal';

function buildMessage({ origin, displayName, username, password }) {
  return [
    `حياك الله${displayName ? ` يا ${displayName}` : ''}، تم إنشاء حسابك في سجل الأعمال.`,
    '',
    `الرابط: ${origin}/login`,
    `اسم المستخدم: ${username}`,
    `كلمة المرور المؤقتة: ${password}`,
    '',
    'كلمة المرور مؤقتة — سيُطلب منك تغييرها عند أول دخول.',
  ].join('\n');
}

/**
 * Shows a generated password exactly once.
 *
 * The value is never stored in the clear and cannot be read back, so this dialog
 * is the only chance to hand it over — hence the warning and the fact that the
 * dismiss button says "I have copied it" rather than "cancel".
 */
export function CredentialsModal({ open, onClose, title, displayName, username, password }) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (open) setCopied('');
  }, [open]);

  if (!username || !password) return null;

  const message = buildMessage({ origin, displayName, username, password });

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      // Clipboard access is denied outside a secure context and on some
      // in-app browsers; the text stays selectable on screen either way.
      setCopied('failed');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="rounded-xl bg-gold-100 px-3 py-2 text-sm font-semibold text-gold-700">
        انسخ هذه البيانات الآن — لن تظهر كلمة المرور مرة أخرى بعد إغلاق هذه النافذة.
      </p>

      <dl className="mt-3 space-y-2">
        <div className="rounded-xl border border-line p-3">
          <dt className="text-xs text-muted">اسم المستخدم</dt>
          <dd className="mt-0.5 text-lg font-bold" dir="ltr">
            {username}
          </dd>
        </div>
        <div className="rounded-xl border border-line p-3">
          <dt className="text-xs text-muted">كلمة المرور المؤقتة</dt>
          <dd className="mt-0.5 select-all font-mono text-lg font-bold tracking-wider" dir="ltr">
            {password}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-muted">نص الرسالة الجاهزة للإرسال:</p>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-surface p-3 text-xs">
        {message}
      </pre>

      {copied === 'failed' && (
        <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">
          تعذّر النسخ تلقائياً — حدّد النص أعلاه وانسخه يدوياً.
        </p>
      )}
      {copied && copied !== 'failed' && (
        <p role="status" className="mt-2 text-xs font-semibold text-ok-ink">
          تم نسخ {copied}.
        </p>
      )}

      <ModalActions>
        <Button onClick={() => copy(message, 'الرسالة')}>نسخ الرسالة</Button>
        <Button tone="outline" onClick={() => copy(password, 'كلمة المرور')}>
          نسخ كلمة المرور فقط
        </Button>
        <Button tone="ghost" onClick={onClose}>
          تم النسخ، إغلاق
        </Button>
      </ModalActions>
    </Modal>
  );
}
