'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { applySession } from '@/lib/auth/session';
import { biometricAvailable, loginWithPasskey } from '@/lib/webauthn/client';

export function PasskeyButton({ onError }) {
  const router = useRouter();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    biometricAvailable().then((ok) => {
      if (alive) setAvailable(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!available) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-muted">أو</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <Button
        type="button"
        tone="outline"
        className="w-full"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          onError('');
          try {
            const result = await loginWithPasskey();
            await applySession(result);
            router.replace(result.redirect);
          } catch (err) {
            // A cancelled prompt is not a failure worth shouting about.
            if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
              onError(err.message || 'تعذّر الدخول بالبصمة');
            }
            setBusy(false);
          }
        }}
      >
        الدخول بالبصمة
      </Button>
    </div>
  );
}
