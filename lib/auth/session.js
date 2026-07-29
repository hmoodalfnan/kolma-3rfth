'use client';

import { getBrowserClient } from '@/lib/supabase/browser';
import { clearMirror } from '@/lib/offline/db';

const ROLE_KEY = 'tracker.role';

export async function applySession({
  session,
  role,
  displayName,
  studentId,
  scheduleSlug,
  mustChangePassword = false,
}) {
  await getBrowserClient().auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  window.localStorage.setItem(
    ROLE_KEY,
    JSON.stringify({ role, displayName, studentId, scheduleSlug, mustChangePassword }),
  );
}

export function getStoredRole() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem(ROLE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function patchStoredRole(patch) {
  const current = getStoredRole() ?? {};
  window.localStorage.setItem(ROLE_KEY, JSON.stringify({ ...current, ...patch }));
}

export async function signOut(redirectTo = '/login') {
  try {
    await getBrowserClient().auth.signOut();
  } catch {
    // Signing out locally matters more than reaching the server.
  }
  window.localStorage.removeItem(ROLE_KEY);
  window.localStorage.removeItem('tracker.schedule');
  await clearMirror().catch(() => {});
  window.location.href = redirectTo;
}
