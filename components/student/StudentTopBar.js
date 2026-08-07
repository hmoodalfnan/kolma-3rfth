'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUnreadNotifications } from '@/lib/student/useUnreadNotifications';

/**
 * A thin top row carrying the notifications bell. It lives above every student
 * page so the alert is reachable without giving up a slot in the bottom nav.
 */
export function StudentTopBar() {
  const pathname = usePathname();
  const { count } = useUnreadNotifications();
  const active = pathname === '/notifications';

  return (
    <div className="mx-auto flex w-full max-w-2xl items-center justify-end px-4 pt-3">
      <Link
        href="/notifications"
        prefetch
        aria-label={count > 0 ? `التنبيهات، ${count} غير مقروء` : 'التنبيهات'}
        aria-current={active ? 'page' : undefined}
        className={`relative flex size-10 items-center justify-center rounded-full border border-line text-lg transition ${
          active ? 'bg-accent text-accent-ink' : 'bg-panel text-brand hover:bg-chip'
        }`}
      >
        <span aria-hidden="true">🔔</span>
        {count > 0 && (
          <span className="absolute -end-1 -top-1 min-w-4 rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-4 text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </Link>
    </div>
  );
}
