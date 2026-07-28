'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase/browser';
import { getStoredRole } from '@/lib/auth/session';
import { canAccess, homeFor } from '@/lib/auth/guard';
import { SkeletonList } from '@/components/ui/Skeleton';

export function RequireRole({ allow, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState({ status: 'checking', role: null, profile: null });

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await getBrowserClient().auth.getSession();
      if (!alive) return;

      if (!data?.session) {
        router.replace('/login');
        return;
      }

      const stored = getStoredRole();
      const role = stored?.role ?? null;

      if (!role || !allow.includes(role) || !canAccess(role, pathname)) {
        router.replace(homeFor(role));
        return;
      }

      setState({ status: 'ready', role, profile: stored });
    })();

    return () => {
      alive = false;
    };
  }, [router, pathname, allow]);

  if (state.status !== 'ready') {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <SkeletonList rows={6} />
      </div>
    );
  }

  return children;
}
