import 'server-only';
import { createClient } from '@supabase/supabase-js';
import {
  serverUrl,
  serverPublicKey,
  serverSecretKey,
  browserReady,
  ACCEPTED_NAMES,
} from './env.server';

/** Full-privilege client. Never import this from a client component. */
export function createServiceClient() {
  const url = serverUrl();
  const key = serverSecretKey();

  if (!url) throw new Error('Supabase URL is not configured');
  if (!key) throw new Error('Supabase secret key is not configured');

  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Anon client carrying the caller's token, so every query is still filtered by RLS. */
export function createRequestClient(accessToken) {
  const url = serverUrl();
  const key = serverPublicKey();

  if (!url) throw new Error('Supabase URL is not configured');
  if (!key) throw new Error('Supabase anon key is not configured');

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
  });
}

/** Which credentials are present, as booleans only — never a value or a fragment. */
export function configStatus() {
  const url = serverUrl();

  let projectRef = null;
  try {
    projectRef = url ? new global.URL(url).hostname.split('.')[0] : null;
  } catch {
    projectRef = 'INVALID_URL';
  }

  return {
    projectRef,
    present: {
      url: Boolean(url),
      publicKey: Boolean(serverPublicKey()),
      secretKey: Boolean(serverSecretKey()),
    },
    // The browser bundle can only see NEXT_PUBLIC_* names; a server-only URL
    // would leave the client unable to reach Supabase at all.
    browserReady: browserReady(),
    authEmailDomain: process.env.AUTH_EMAIL_DOMAIN || '(default) tracker.internal',
    acceptedNames: ACCEPTED_NAMES,
  };
}
