import 'server-only';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Full-privilege client. Never import this from a client component. */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  return createClient(URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Anon client carrying the caller's token, so every query is still filtered by RLS. */
export function createRequestClient(accessToken) {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
  });
}

/**
 * Which credentials are present, as booleans only — never a value or a fragment.
 * Lives here so this file remains the single place in the codebase that names the
 * service-role variable, which tests/security/bundle-safety.test.js enforces.
 */
export function configStatus() {
  const url = URL || '';
  let projectRef = null;
  try {
    projectRef = url ? new global.URL(url).hostname.split('.')[0] : null;
  } catch {
    projectRef = 'INVALID_URL';
  }

  return {
    projectRef,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(url),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(ANON),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      AUTH_EMAIL_DOMAIN: process.env.AUTH_EMAIL_DOMAIN || '(default) tracker.internal',
    },
  };
}
