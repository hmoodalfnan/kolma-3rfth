'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Select } from '@/components/ui/Field';
import { useSchedule } from '@/lib/manage/useSchedule';
import { getStoredRole, signOut } from '@/lib/auth/session';
import { ROLE_LABELS } from '@/lib/auth/guard';

const MANAGE_TABS = [
  { href: '/schedules', label: 'الرحلات' },
  { href: '/students', label: 'الطلاب' },
  { href: '/questions', label: 'البنود' },
  { href: '/grading', label: 'التقييم' },
  { href: '/boards', label: 'الصدارة' },
  { href: '/export', label: 'تصدير' },
  { href: '/log', label: 'السجل' },
  { href: '/account', label: 'حسابي' },
];

const ADMIN_TABS = [
  { href: '/admin/global-board', label: 'الصدارة العامة' },
  { href: '/admin/staff', label: 'المشرفون' },
  { href: '/admin/library', label: 'مكتبة البنود' },
  { href: '/admin/global-log', label: 'سجل النظام' },
];

export function ManageShell({ children }) {
  const pathname = usePathname();
  const { schedules, currentId, select } = useSchedule();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    setProfile(getStoredRole());
  }, []);

  const tabs = profile?.role === 'super_admin' ? [...MANAGE_TABS, ...ADMIN_TABS] : MANAGE_TABS;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-navy-700">سجل الأعمال</p>
            <p className="truncate text-xs text-muted">
              {profile?.displayName} · {ROLE_LABELS[profile?.role] ?? ''}
            </p>
          </div>

          {schedules && schedules.length > 0 && (
            <Select
              aria-label="اختر الرحلة"
              value={currentId ?? ''}
              onChange={(e) => select(e.target.value)}
              className="w-auto min-w-48 max-w-full"
            >
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.status === 'archived' ? ' (مؤرشفة)' : ''}
                </option>
              ))}
            </Select>
          )}

          <button
            type="button"
            onClick={() => signOut()}
            className="rounded-xl border border-line px-3 py-2 text-sm font-semibold text-rose-600"
          >
            خروج
          </button>
        </div>

        <nav className="mx-auto max-w-6xl overflow-x-auto px-4 pb-2" aria-label="أقسام الإدارة">
          <ul className="flex gap-1.5">
            {tabs.map((tab) => {
              const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    prefetch
                    aria-current={active ? 'page' : undefined}
                    className={`block whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      active ? 'bg-navy-700 text-white' : 'bg-navy-50 text-navy-700'
                    }`}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-5">{children}</main>
    </div>
  );
}
