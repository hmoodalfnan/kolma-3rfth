'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStudentContext } from '@/lib/student/useStudentContext';

const ITEMS = [
  { href: '/today', label: 'اليوم', icon: '✓' },
  { href: '/board', label: 'الصدارة', icon: '★', needsBoard: true },
  { href: '/settings', label: 'الإعدادات', icon: '⚙' },
];

export function StudentNav() {
  const pathname = usePathname();
  const ctx = useStudentContext();

  // A trip can switch the leaderboard off for students. Linking to a page that
  // will refuse to show anything is worse than not offering it. The tab is only
  // dropped once the schedule is actually known to have it off — while loading,
  // the nav stays as it is rather than flickering an item away.
  const items = ITEMS.filter(
    (item) => !item.needsBoard || ctx.schedule?.students_see_leaderboard !== false,
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="التنقل"
    >
      <ul className="mx-auto flex max-w-2xl">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                prefetch
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-semibold transition ${
                  active ? 'text-brand' : 'text-muted'
                }`}
              >
                <span className="text-lg leading-none" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
