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
