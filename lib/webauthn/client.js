'use client';

import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser';
import { getBrowserClient } from '@/lib/supabase/browser';

async function post(path, body, withAuth = false) {
  const headers = { 'content-type': 'application/json' };

  if (withAuth) {
    const { data } = await getBrowserClient().auth.getSession();
    headers.authorization = `Bearer ${data?.session?.access_token ?? ''}`;
  }

  const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'تعذّر تنفيذ العملية');
  return json;
}

/** True when this device can do a biometric/PIN-gated passkey. */
export async function biometricAvailable() {
  if (!browserSupportsWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

export async function registerPasskey(label) {
  const { options, challengeId } = await post('/api/auth/webauthn/register', {
    action: 'options',
  }, true);

  const credential = await startRegistration({ optionsJSON: options });

  return post('/api/auth/webauthn/register', {
    action: 'verify',
    challengeId,
    label,
    credential,
  }, true);
}

export async function loginWithPasskey() {
  const { options, challengeId } = await post('/api/auth/webauthn/login', {
    action: 'options',
  });

  const credential = await startAuthentication({ optionsJSON: options });

  return post('/api/auth/webauthn/login', {
    action: 'verify',
    challengeId,
    credential,
  });
}

export async function listPasskeys() {
  const { data, error } = await getBrowserClient()
    .from('webauthn_credentials')
    .select('id, device_label, created_at, last_used_at, backed_up')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function deletePasskey(id) {
  const { error } = await getBrowserClient().from('webauthn_credentials').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
