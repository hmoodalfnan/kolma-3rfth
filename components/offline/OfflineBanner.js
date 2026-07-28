'use client';

import { useOnline, usePendingCount } from '@/lib/offline/useOnline';

export function OfflineBanner() {
  const online = useOnline();
  const pending = usePendingCount();

  if (online && pending === 0) return null;

  const offline = !online;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-40 px-4 py-2 text-center text-sm font-semibold ${
        offline ? 'bg-gold-500 text-navy-900' : 'bg-navy-700 text-white'
      }`}
    >
      {offline
        ? `تعمل الآن بدون إنترنت — التغييرات محفوظة${pending > 0 ? ` (${pending} بانتظار الرفع)` : ''} وسترفع تلقائياً`
        : `جارٍ المزامنة… (${pending})`}
    </div>
  );
}
