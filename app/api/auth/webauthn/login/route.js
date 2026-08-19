import { safeHandler } from '@/lib/http/safe-handler';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import {
  clientIp,
  sameOrigin,
  userAgent,
  jsonResponse as json,
} from '@/lib/http/request-context';
import { rpConfig } from '@/lib/webauthn/config';
import { writeAudit } from '@/lib/audit/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC = 'تعذّر الدخول بالبصمة';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('options') }).strict(),
  z.object({
    action: z.literal('verify'),
    challengeId: z.string().uuid(),
    credential: z.object({ id: z.string().min(1) }).passthrough(),
  }).strict(),
]);

async function postHandler(request) {
  if (!sameOrigin(request)) return json({ error: 'طلب غير مسموح' }, 403);

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return json({ error: 'طلب غير صالح' }, 400);

  const db = createServiceClient();
  const ip = clientIp(request);
  const ua = userAgent(request);

  const gate = await db.rpc('rl_hit', {
    p_key: `webauthn_login:${ip || 'unknown'}`,
    p_limit: 30,
    p_window_seconds: 600,
  });
  if (gate.data === false) return json({ error: 'محاولات كثيرة، حاول لاحقاً' }, 429);

  const { rpID, origins } = rpConfig();

  if (parsed.data.action === 'options') {
    // Discoverable credentials: no username is typed, so nothing here reveals
    // whether a given account exists.
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
    });

    const { data: challenge, error } = await db
      .from('webauthn_challenges')
      .insert({ challenge: options.challenge, kind: 'login' })
      .select('id')
      .single();

    if (error) return json({ error: GENERIC }, 500);

    return json({ options, challengeId: challenge.id }, 200);
  }

  const { data: expectedChallenge } = await db.rpc('webauthn_take_challenge', {
    p_id: parsed.data.challengeId,
    p_kind: 'login',
  });
  if (!expectedChallenge) return json({ error: 'انتهت صلاحية الطلب، حاول مرة أخرى' }, 400);

  const { data: stored } = await db
    .from('webauthn_credentials')
    .select('*')
    .eq('credential_id', parsed.data.credential.id)
    .maybeSingle();

  if (!stored) return json({ error: GENERIC }, 401);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: parsed.data.credential,
      expectedChallenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: stored.credential_id,
        publicKey: Buffer.from(stored.public_key, 'base64url'),
        counter: Number(stored.counter),
        transports: stored.transports ?? undefined,
      },
    });
  } catch {
    return json({ error: GENERIC }, 401);
  }

  if (!verification.verified) return json({ error: GENERIC }, 401);

  // A counter that fails to advance is the signature of a cloned authenticator.
  const newCounter = verification.authenticationInfo.newCounter;
  if (Number(stored.counter) > 0 && newCounter <= Number(stored.counter)) {
    await writeAudit(db, {
      actorLabel: stored.user_id,
      actorRole: 'unknown',
      entityType: 'auth',
      action: 'passkey_counter_regression',
      after: { credentialId: stored.credential_id },
      ip,
      userAgent: ua,
    });
    return json({ error: GENERIC }, 401);
  }

  // The credential belongs to an admin (app_users) or a self-serve student
  // (students). Resolve either into one identity for the session + audit.
  let identity;
  const { data: admin } = await db
    .from('app_users')
    .select('id, username, display_name, role, is_active')
    .eq('id', stored.user_id)
    .maybeSingle();
  if (admin) {
    if (!admin.is_active) return json({ error: 'الحساب معطّل' }, 403);
    identity = {
      id: admin.id,
      username: admin.username,
      displayName: admin.display_name,
      role: admin.role,
      studentId: undefined,
      redirect: admin.role === 'super_admin' ? '/admin/global-board' : '/schedules',
    };
  } else {
    const { data: student } = await db
      .from('students')
      .select('id, full_name, email, is_active')
      .eq('auth_uid', stored.user_id)
      .maybeSingle();
    if (!student || student.is_active === false) return json({ error: 'الحساب معطّل' }, 403);
    identity = {
      id: student.id,
      username: student.email || `stu_${student.id}`,
      displayName: student.full_name || 'مستخدم',
      role: 'student',
      studentId: student.id,
      redirect: '/today',
    };
  }

  const { data: authUser } = await db.auth.admin.getUserById(stored.user_id);
  if (!authUser?.user?.email) return json({ error: GENERIC }, 401);

  // Mint a real Supabase session without a password: generate a single-use
  // magiclink token server-side and immediately redeem it here. The token never
  // leaves this handler.
  const link = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: authUser.user.email,
  });
  if (link.error) return json({ error: GENERIC }, 500);

  const session = await db.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: 'email',
  });
  if (session.error || !session.data?.session) return json({ error: GENERIC }, 500);

  await db
    .from('webauthn_credentials')
    .update({ counter: newCounter, last_used_at: new Date().toISOString() })
    .eq('id', stored.id);

  await db.rpc('auth_reset_failures', {
    p_identifier: identity.role === 'student' ? `email:${identity.username}` : `staff:${identity.username}`,
  });

  await writeAudit(db, {
    actorLabel: identity.username,
    actorRole: identity.role,
    entityType: 'auth',
    entityId: identity.id,
    action: 'login_passkey',
    ip,
    userAgent: ua,
  });

  return json(
    {
      session: session.data.session,
      role: identity.role,
      displayName: identity.displayName,
      studentId: identity.studentId,
      mustChangePassword: false,
      redirect: identity.redirect,
    },
    200,
  );
}

export const POST = safeHandler('app/api/auth/webauthn/login/route.js:POST', postHandler);
