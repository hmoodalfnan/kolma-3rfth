import { safeHandler } from '@/lib/http/safe-handler';
import { createServiceClient } from '@/lib/supabase/server';
import { clientIp, sameOrigin, userAgent, jsonResponse as json } from '@/lib/http/request-context';
import { loginSchema } from '@/lib/validation/auth';
import { writeAudit } from '@/lib/audit/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC = 'بيانات الدخول غير صحيحة';

function isUnconfirmed(error) {
  if (!error) return false;
  return (
    error.code === 'email_not_confirmed' ||
    /not\s*confirmed/i.test(error.message || '')
  );
}

async function postHandler(request) {
  if (!sameOrigin(request)) return json({ error: 'طلب غير مسموح' }, 403);

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'طلب غير صالح' }, 400);
  const { email, password } = parsed.data;

  const db = createServiceClient();
  const ip = clientIp(request);
  const ua = userAgent(request);

  // Per-IP throttle first, so an attacker cannot enumerate identifiers cheaply.
  const ipGate = await db.rpc('rl_hit', {
    p_key: `login:ip:${ip || 'unknown'}`,
    p_limit: 20,
    p_window_seconds: 600,
  });
  if (ipGate.data === false) return json({ error: 'محاولات كثيرة، حاول لاحقاً' }, 429);

  const identifier = `email:${email}`;

  const lock = await db.rpc('auth_check_lock', { p_identifier: identifier });
  if (lock.data) return json({ error: 'تم إيقاف الحساب مؤقتاً بسبب محاولات خاطئة' }, 429);

  const idGate = await db.rpc('rl_hit', {
    p_key: `login:id:${identifier}`,
    p_limit: 10,
    p_window_seconds: 600,
  });
  if (idGate.data === false) return json({ error: 'محاولات كثيرة، حاول لاحقاً' }, 429);

  async function fail(reason) {
    await db.rpc('auth_record_failure', { p_identifier: identifier });
    await writeAudit(db, {
      actorLabel: identifier,
      actorRole: 'anonymous',
      entityType: 'auth',
      action: 'login_failed',
      after: { reason },
      ip,
      userAgent: ua,
    });
    return json({ error: GENERIC }, 401);
  }

  const { data: auth, error } = await db.auth.signInWithPassword({ email, password });

  if (isUnconfirmed(error)) {
    // Surface this specifically so the UI can offer to resend the link. It admits
    // the address exists, which is the accepted trade for a usable resend flow.
    return json(
      { error: 'يرجى تأكيد بريدك الإلكتروني أولاً', needsConfirmation: true, email },
      403,
    );
  }
  if (error || !auth?.session) return fail('bad_credentials');

  // Resolve role: an app_users row means admin; otherwise a profile means user.
  const { data: admin } = await db
    .from('app_users')
    .select('id, role, display_name, is_active')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (admin) {
    if (!admin.is_active) {
      await writeAudit(db, {
        actorLabel: email,
        actorRole: admin.role,
        entityType: 'auth',
        action: 'login_blocked_inactive',
        ip,
        userAgent: ua,
      });
      return json({ error: 'الحساب معطّل' }, 403);
    }

    await db.rpc('auth_reset_failures', { p_identifier: identifier });
    await writeAudit(db, {
      actorLabel: email,
      actorRole: admin.role,
      entityType: 'auth',
      entityId: admin.id,
      action: 'login',
      ip,
      userAgent: ua,
    });

    return json(
      {
        session: auth.session,
        role: admin.role, // 'super_admin'
        displayName: admin.display_name,
        redirect: '/admin/questions',
      },
      200,
    );
  }

  const { data: profile } = await db
    .from('students')
    .select('id, full_name, is_active')
    .eq('auth_uid', auth.user.id)
    .maybeSingle();

  if (!profile || profile.is_active === false) return fail('no_profile');

  await db.rpc('auth_reset_failures', { p_identifier: identifier });
  await writeAudit(db, {
    actorLabel: profile.full_name,
    actorRole: 'student',
    entityType: 'auth',
    entityId: profile.id,
    action: 'login',
    ip,
    userAgent: ua,
  });

  return json(
    {
      session: auth.session,
      role: 'student', // internal token for a normal user
      displayName: profile.full_name,
      studentId: profile.id,
      redirect: '/today',
    },
    200,
  );
}

export const POST = safeHandler('app/api/auth/login/route.js:POST', postHandler);
