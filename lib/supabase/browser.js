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
  }
  return client;
}
