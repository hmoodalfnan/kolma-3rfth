import { describe } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_SERVICE_KEY;
const anon = process.env.SUPABASE_TEST_ANON_KEY;

export const dbEnabled = Boolean(url && key);

if (!dbEnabled) {
  console.warn(
    '[db tests] skipped — set SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_KEY to run them',
  );
}

export const dbTest = dbEnabled ? describe : describe.skip;

// `describe.skip` still evaluates its callback to collect the skipped tests, so
// these factories must not throw when credentials are absent. The stub is never
// exercised because every test inside a skipped suite is skipped too.
const STUB = new Proxy(
  {},
  {
    get() {
      throw new Error('[db tests] Supabase credentials are not configured');
    },
  },
);

export function serviceClient() {
  if (!dbEnabled) return STUB;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function anonClient() {
  if (!dbEnabled) return STUB;
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Throwaway names so parallel runs never collide. */
export const uniq = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
export const uniqSlug = () =>
  Array.from({ length: 16 }, () => '0123456789abcdefghjkmnpqrstvwxyz'[Math.floor(Math.random() * 32)]).join('');
