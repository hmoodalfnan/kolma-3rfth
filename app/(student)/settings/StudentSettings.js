'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { SkeletonList } from '@/components/ui/Skeleton';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { signOut } from '@/lib/auth/session';
import { usePendingCount } from '@/lib/offline/useOnline';
import { useStudentContext } from '@/lib/student/useStudentContext';

export function StudentSettings() {
  const ctx = useStudentContext();
  const pending = usePendingCount();

  if (ctx.status !== 'ready') return <SkeletonList rows={6} />;

  const loginPath = ctx.schedule?.slug ? `/j/${ctx.schedule.slug}` : '/login';

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">الإعدادات</h1>

      <section className="card space-y-2 p-4 text-sm">
        <Row label="الاسم" value={ctx.student.full_name} />
        <Row label="الرحلة" value={ctx.schedule.name} />
        <Row
          label="الحالة"
          value={ctx.schedule.status === 'archived' ? 'مؤرشفة' : 'جارية'}
        />
        <Row label="بانتظار الرفع" value={`${pending} تغيير`} />
      </section>

      <section className="card space-y-3 p-4">
        <ThemeToggle />
        <Link
          href="/change-password"
          className="flex min-h-[44px] items-center justify-center rounded-xl border border-line font-semibold text-brand"
        >
          تغيير الرمز السري
        </Link>
        <Button tone="danger" className="w-full" onClick={() => signOut(loginPath)}>
          تسجيل الخروج
        </Button>
      </section>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
