'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredRole } from '@/lib/auth/session';

/**
 * Admins are also normal users. This toggles between the admin dashboard and the
 * user app within the same login. It is a UI convenience only — the server always
 * authorizes by the real role, so switching to "user" grants nothing.
 *
 * `mode` is which app we are currently in ('admin' | 'user').
 */
export function ViewSwitch({ mode }) {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(getStoredRole()?.role === 'super_admin');
  }, []);

  if (!isAdmin) return null;

  const target = mode === 'admin' ? '/today' : '/admin/daily-tasks';
  const label = mode === 'admin' ? 'وضع المستخدم' : 'وضع المشرف';

  return (
    <button
      type="button"
      onClick={() => router.push(target)}
      className="rounded-full border border-accent bg-accent-soft px-3 py-1.5 text-xs font-bold text-brand transition hover:opacity-90"
    >
      ⇄ {label}
    </button>
  );
}
