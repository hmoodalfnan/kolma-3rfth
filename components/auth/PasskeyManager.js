'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import {
  biometricAvailable,
  registerPasskey,
  listPasskeys,
  deletePasskey,
} from '@/lib/webauthn/client';

export function PasskeyManager() {
  const toast = useToast();
  const [available, setAvailable] = useState(null);
  const [keys, setKeys] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setKeys(await listPasskeys());
    } catch (err) {
      setError(err.message);
      setKeys([]);
    }
  }, []);

  useEffect(() => {
    biometricAvailable().then(setAvailable);
    load();
  }, [load]);

  return (
    <Panel title="الدخول بالبصمة">
      <ErrorText>{error}</ErrorText>

      <p className="mb-3 text-sm text-muted">
        سجّل بصمة هذا الجهاز لتدخل بلمسة واحدة بدل كتابة كلمة المرور. كلمة المرور تبقى كما هي
        ويمكنك استخدامها في أي وقت. البصمة لا تغادر جهازك — يُحفظ مفتاح عام فقط.
      </p>

      {available === false && (
        <p className="mb-3 rounded-xl bg-amber-50 p-2.5 text-sm text-amber-800">
          هذا الجهاز أو المتصفح لا يدعم البصمة. جرّب من متصفح الهاتف.
        </p>
      )}

      {available && (
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const label =
                window.prompt('اسم هذا الجهاز (مثال: جوالي)', 'جهازي') || 'جهازي';
              await registerPasskey(label);
              await load();
              toast.push('تم تفعيل الدخول بالبصمة', 'success');
            } catch (err) {
              if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
                setError(err.message || 'تعذّر تسجيل البصمة');
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          تفعيل البصمة على هذا الجهاز
        </Button>
      )}

      <div className="mt-4">
        {keys === null ? (
          <SkeletonList rows={2} />
        ) : keys.length === 0 ? (
          <EmptyState>لا توجد أجهزة مسجّلة.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{k.device_label}</p>
                  <p className="text-xs text-muted">
                    سُجّل{' '}
                    {new Date(k.created_at).toLocaleDateString('ar-SA', {
                      timeZone: 'Asia/Riyadh',
                    })}
                    {k.last_used_at
                      ? ` · آخر استخدام ${new Date(k.last_used_at).toLocaleDateString('ar-SA', { timeZone: 'Asia/Riyadh' })}`
                      : ' · لم يُستخدم بعد'}
                  </p>
                </div>

                <Button
                  tone="danger"
                  className="min-h-0 px-2 py-1 text-xs"
                  onClick={async () => {
                    if (!window.confirm(`حذف «${k.device_label}»؟`)) return;
                    setKeys((prev) => prev.filter((x) => x.id !== k.id));
                    try {
                      await deletePasskey(k.id);
                      toast.push('تم حذف الجهاز', 'success');
                    } catch (err) {
                      setError(err.message);
                      load();
                    }
                  }}
                >
                  حذف
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
