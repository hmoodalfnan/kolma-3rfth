'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export function JoinLinkRow({ label, slug, onRotate }) {
  const toast = useToast();
  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  if (!slug) return null;
  const url = `${origin}/j/${slug}`;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code
          dir="ltr"
          className="min-w-0 flex-1 truncate rounded-lg bg-surface px-2 py-2 text-xs text-ink"
        >
          {url}
        </code>
        <Button
          tone="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            toast.push('تم نسخ الرابط', 'success');
          }}
        >
          نسخ
        </Button>
        <Button
          tone="ghost"
          loading={busy}
          onClick={async () => {
            if (!window.confirm('تجديد الرابط سيوقف الرابط القديم فوراً. متابعة؟')) return;
            setBusy(true);
            try {
              await onRotate();
            } finally {
              setBusy(false);
            }
          }}
        >
          تجديد
        </Button>
      </div>
    </div>
  );
}
