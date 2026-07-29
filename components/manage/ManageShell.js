'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Select } from '@/components/ui/Field';
import { useSchedule } from '@/lib/manage/useSchedule';
import { getStoredRole, signOut } from '@/lib/auth/session';
import { ROLE_LABELS } from '@/lib/auth/guard';

// Only meaningful once a trip exists — every one of these screens reads from the
// current schedule, so the whole group is hidden rather than shown dead.
const TRIP_TABS = [
  { href: '/students', label: 'الطلاب' },
  { href: '/questions', label: 'البنود' },
  { href: '/grading', label: 'التقييم' },
  { href: '/boards', label: 'الصدارة' },
  { href: '/export', label: 'تصدير' },
  { href: '/log', label: 'السجل' },
];

const GENERAL_TABS = [
  { href: '/schedules', label: 'الرحلات' },
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setProfile(getStoredRole());
  }, []);

  // Navigating is the end of the drawer's job — leaving it open would cover the
  // page the user just asked for.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const hasSchedules = Boolean(schedules && schedules.length > 0);

  const groups = [
    hasSchedules && { key: 'trip', title: 'الرحلة الحالية', tabs: TRIP_TABS, picker: true },
    { key: 'general', title: 'عام', tabs: GENERAL_TABS },
    profile?.role === 'super_admin' && { key: 'admin', title: 'إدارة النظام', tabs: ADMIN_TABS },
  ].filter(Boolean);

  const currentTab = [...TRIP_TABS, ...GENERAL_TABS, ...ADMIN_TABS].find(
    (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`),
  );

  const nav = (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-4" aria-label="أقسام الإدارة">
      <div className="px-2">
        <p className="text-sm font-bold text-brand">المتابع الإيماني</p>
        {currentTab && <p className="text-sm font-semibold text-ink">{currentTab.label}</p>}
        <p className="truncate text-xs text-muted">
          {profile?.displayName} · {ROLE_LABELS[profile?.role] ?? ''}
        </p>
      </div>

      {groups.map((group) => (
        <div key={group.key}>
          <p className="px-2 pb-1.5 text-[11px] font-bold tracking-wide text-muted">{group.title}</p>

          {group.picker && (
            <div className="px-2 pb-2">
              <Select
                aria-label="اختر الرحلة"
                value={currentId ?? ''}
                onChange={(e) => select(e.target.value)}
                className="text-sm"
              >
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.status === 'archived' ? ' (مؤرشفة)' : ''}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <ul className="space-y-0.5">
            {group.tabs.map((tab) => {
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
        </div>
      ))}

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
      {/* Phone and tablet: a bar carrying the drawer trigger. */}
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
          <p className="truncate text-sm font-bold text-brand">المتابع الإيماني</p>
          {currentTab && (
            <p className="truncate text-xs text-muted">{currentTab.label}</p>
          )}
        </div>
      </header>

      {/* Desktop: always present, no toggle. */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-s border-line bg-panel lg:block">
        {nav}
      </aside>

      {/* Phone and tablet: the same nav as an overlay drawer. */}
      <div
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden ${
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        // The app is RTL throughout, so the drawer lives on the right edge and
        // slides out to the right.
        className={`fixed inset-y-0 right-0 z-50 w-72 max-w-[85vw] border-s border-line bg-panel transition-transform duration-200 lg:hidden ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        inert={drawerOpen ? undefined : ''}
      >
        {nav}
      </aside>

      <main className="mx-auto w-full max-w-6xl px-4 py-5 lg:min-w-0 lg:flex-1">{children}</main>
    </div>
  );
}
