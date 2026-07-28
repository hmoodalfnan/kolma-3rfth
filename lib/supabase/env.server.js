import 'server-only';
import { PUBLIC_URL, PUBLIC_KEY, PUBLIC_NAMES } from './env';

/**
 * Server-only Supabase config. Kept apart from env.js so nothing that names a
 * secret can be reached from a client component, even accidentally.
 *
 * Read at request time, so plain lookups are fine here — no build-time inlining
 * is involved.
 */

export function serverUrl() {
  return PUBLIC_URL || process.env.SUPABASE_URL || '';
}

export function serverPublicKey() {
  return PUBLIC_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
}

export function serverSecretKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ''
  );
}

export const browserReady = () => Boolean(PUBLIC_URL && PUBLIC_KEY);

/** Names actually accepted, so the health endpoint can tell you what to set. */
export const ACCEPTED_NAMES = Object.freeze({
  url: [...PUBLIC_NAMES.url, 'SUPABASE_URL'],
  publicKey: [...PUBLIC_NAMES.publicKey, 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY'],
  secretKey: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_KEY'],
});
