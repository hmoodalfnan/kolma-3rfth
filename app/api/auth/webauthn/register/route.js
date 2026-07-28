import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { z } from 'zod';
import { createServiceClient, createRequestClient } from '@/lib/supabase/server';
import {
  clientIp,
  sameOrigin,
  userAgent,
  bearerToken,
  jsonResponse as json,
} from '@/lib/http/request-context';
import { rpConfig } from '@/lib/webauthn/config';
import { writeAudit } from '@/lib/audit/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('options') }).strict(),
  z.object({
    action: z.literal('verify'),
    challengeId: z.string().uuid(),
    label: z.string().max(60).optional(),
    credential: z.object({}).passthrough(),
  }).strict(),
]);

/** Only staff may enrol a passkey; students share devices. */
async function requireStaffUser(request) {
  const token = bearerToken(request);
  if (!token) return { response: json({ error: 'غير مصرح' }, 401) };

  const scoped = createRequestClient(token);
  const { data: auth, error } = await scoped.auth.getUser();
  if (error || !auth?.user) return { response: json({ error: 'غير مصرح' }, 401) };

  const db = createServiceClient();
  const { data: profile } = await db
    .from('app_users')
    .select('id, username, display_name, role, is_active')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    return { response: json({ error: 'هذه الميزة للمشرفين فقط' }, 403) };
  }

  return { db, profile, user: auth.user };
}

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'طلب غير مسموح' }, 403);

  const ctx = await requireStaffUser(request);
  if (ctx.response) return ctx.response;
  const { db, profile, user } = ctx;

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return json({ error: 'طلب غير صالح' }, 400);

  const gate = await db.rpc('rl_hit', {
    p_key: `webauthn_reg:${user.id}`,
    p_limit: 20,
    p_window_seconds: 3600,
  });
  if (gate.data === false) return json({ error: 'محاولات كثيرة، حاول لاحقاً' }, 429);

  const { rpID, rpName, origins } = rpConfig();

  if (parsed.data.action === 'options') {
    const { data: existing } = await db
      .from('webauthn_credentials')
      .select('credential_id, transports')
      .eq('user_id', user.id);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(user.id),
      userName: profile.username,
      userDisplayName: profile.display_name,
      attestationType: 'none',
      // Refuse to enrol the same authenticator twice.
      excludeCredentials: (existing ?? []).map((c) => ({
        id: c.credential_id,
        transports: c.transports ?? undefined,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        // Forces the biometric/PIN gesture rather than mere presence.
        userVerification: 'required',
      },
    });

    const { data: challenge, error } = await db
      .from('webauthn_challenges')
      .insert({ challenge: options.challenge, user_id: user.id, kind: 'register' })
      .select('id')
      .single();

    if (error) return json({ error: 'تعذّر بدء التسجيل' }, 500);

    return json({ options, challengeId: challenge.id }, 200);
  }

  const { data: expectedChallenge } = await db.rpc('webauthn_take_challenge', {
    p_id: parsed.data.challengeId,
    p_kind: 'register',
  });

  if (!expectedChallenge) return json({ error: 'انتهت صلاحية الطلب، حاول مرة أخرى' }, 400);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: parsed.data.credential,
      expectedChallenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    return json({ error: 'تعذّر التحقق من البصمة' }, 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return json({ error: 'تعذّر التحقق من البصمة' }, 400);
  }

  const { credential, credentialBackedUp } = verification.registrationInfo;

  const { error: insertError } = await db.from('webauthn_credentials').insert({
    user_id: user.id,
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ?? null,
    device_label: parsed.data.label?.slice(0, 60) || 'جهاز',
    backed_up: Boolean(credentialBackedUp),
  });

  if (insertError) {
    return json({ error: 'هذا الجهاز مسجَّل بالفعل' }, 409);
  }

  await writeAudit(db, {
    actorLabel: profile.username,
    actorRole: profile.role,
    entityType: 'auth',
    entityId: user.id,
    action: 'passkey_register',
    after: { label: parsed.data.label ?? 'جهاز' },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return json({ ok: true }, 200);
}
