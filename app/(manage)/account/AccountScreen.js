'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Panel } from '@/components/manage/Panel';
import { PasskeyManager } from '@/components/auth/PasskeyManager';
import { getStoredRole, signOut } from '@/lib/auth/session';
import { ROLE_LABELS } from '@/lib/auth/guard';

export function AccountScreen() {
  const stored = typeof window === 'undefined' ? null : getStoredRole();

  return (
    <div className="space-y-4">
      <Panel title="حسابي">
        <p className="font-semibold">{stored?.displayName ?? '—'}</p>
        <p className="text-sm text-muted">{ROLE_LABELS[stored?.role] ?? ''}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/change-password">
            <Button tone="outline">تغيير كلمة المرور</Button>
          </Link>
          <Button tone="danger" onClick={signOut}>
            تسجيل الخروج
          </Button>
        </div>
      </Panel>

      <PasskeyManager />

      <Panel title="المظهر">
        <ThemeToggle />
      </Panel>
    </div>
  );
}
