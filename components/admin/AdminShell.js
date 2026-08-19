'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getStoredRole, signOut } from '@/lib/auth/session';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { ViewSwitch } from '@/components/admin/ViewSwitch';

const TABS = [
  { href: '/admin/daily-tasks', label: 'المهام اليومية' },
  { href: '/admin/assignments', label: 'المهام المستمرة' },
  { href: '/admin/users', label: 'المستخدمون' },
  { href: '/admin/leaderboard', label: 'لوحة الصدارة' },
  { href: '/admin/admins', label: 'المشرفون' },
];

export function AdminShell({ children }) {
  const pathname = usePathname();
  const [profile, setProfile] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setProfile(getStoredRole()), []);
  useEffect(() => setDrawerOpen(false), [pathname]);

  const currentTab = TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));

  const nav = (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto px-3 py-4" aria-label="أقسام الإدارة">
      <div className="px-2">
        <BrandLogo className="h-9" />
        <p className="mt-2 truncate text-xs text-muted">{profile?.displayName} · مشرف</p>
      </div>

      <div className="px-2">
        <ViewSwitch mode="admin" />
      </div>

      <ul className="space-y-0.5">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                prefetch
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  active ? 'chip-selected' : 'text-ink hover:bg-chip'
                }`}
              >
                <span aria-hidden="true" className="w-3 text-center">
                  {active ? '•' : ''}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => signOut()}
        className="mt-auto rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-rose-600"
      >
        تسجيل الخروج
      </button>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:flex">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-panel/95 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="فتح القائمة"
          aria-expanded={drawerOpen}
          className="rounded-xl border border-line px-3 py-2 text-lg leading-none"
        >
          ☰
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-brand">لوحة المشرف</p>
          {currentTab && <p className="truncate text-xs text-muted">{currentTab.label}</p>}
        </div>
        <ViewSwitch mode="admin" />
      </header>

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-s border-line bg-panel lg:block">
        {nav}
      </aside>

      <div
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden ${
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-72 max-w-[85vw] border-s border-line bg-panel transition-transform duration-200 lg:hidden ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        inert={drawerOpen ? undefined : ''}
      >
        {nav}
      </aside>

      <main className="mx-auto w-full max-w-4xl px-4 py-5 lg:min-w-0 lg:flex-1">{children}</main>
    </div>
  );
}
