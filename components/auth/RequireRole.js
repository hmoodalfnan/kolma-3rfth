'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase/browser';
import { getStoredRole, patchStoredRole } from '@/lib/auth/session';
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

      let stored = getStoredRole();
      let role = stored?.role ?? null;

      // A user who just confirmed their email arrives with a valid Supabase
      // session but no locally-stored role — they never passed through the login
      // route. Resolve their (active) student profile once so the confirmation
      // link lands them straight in the app instead of bouncing to /login.
      if (!role) {
        const { data: auth } = await getBrowserClient().auth.getUser();
        const uid = auth?.user?.id;
        if (uid) {
          const { data: profile } = await getBrowserClient()
            .from('students')
            .select('id, full_name, is_active')
            .eq('auth_uid', uid)
            .maybeSingle();
          if (!alive) return;
          if (profile && profile.is_active !== false) {
            patchStoredRole({
              role: 'student',
              displayName: profile.full_name,
              studentId: profile.id,
            });
            stored = getStoredRole();
            role = 'student';
          }
        }
      }

      if (!alive) return;
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
