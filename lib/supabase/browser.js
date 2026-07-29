'use client';

import { createClient } from '@supabase/supabase-js';
import { PUBLIC_URL, PUBLIC_KEY } from './env';

let client;

export function getBrowserClient() {
  if (!client) {
    if (!PUBLIC_URL || !PUBLIC_KEY) {
      throw new Error(
        'إعدادات الاتصال بقاعدة البيانات غير مكتملة. راجع /api/health لمعرفة المتغيّر الناقص.',
      );
    }

    client = createClient(PUBLIC_URL, PUBLIC_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'tracker.session',
      },
    });

    // Auto-refresh only ticks while the tab is in the foreground. A phone with
    // the app in the background for a few hours comes back to an access token
    // that expired quietly, and the first write fails as a permissions error
    // rather than as a sign-in prompt. Refreshing the moment the tab is visible
    // again closes that window.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        client.auth.getSession().then(({ data }) => {
          if (data?.session) client.auth.refreshSession().catch(() => {});
        });
      });
    }
  }
  return client;
}
