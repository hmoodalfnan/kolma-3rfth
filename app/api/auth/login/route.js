import { createServiceClient } from '@/lib/supabase/server';
import { clientIp, sameOrigin, userAgent, jsonResponse as json } from '@/lib/http/request-context';
import { loginSchema } from '@/lib/validation/auth';
import { staffEmail, studentEmail } from '@/lib/auth/identity';
import { writeAudit } from '@/lib/audit/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC = 'بيانات الدخول غير صحيحة';

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'طلب غير مسموح' }, 403);

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'طلب غير صالح' }, 400);
  const input = parsed.data;

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

  const identifier =
    input.mode === 'staff' ? `staff:${input.username}` : `student:${input.studentId}`;

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

  let email;
  let student = null;

  if (input.mode === 'student') {
    // The student must belong to the schedule the join link names.
    const { data } = await db
      .from('students')
      .select(
        'id, schedule_id, full_name, must_change_password, is_active, schedules!inner(slug, status)',
      )
      .eq('id', input.studentId)
      .eq('schedules.slug', input.slug)
      .maybeSingle();

    if (!data || data.is_active === false) return fail('student_not_in_schedule');
    student = data;
    email = studentEmail(input.studentId);
  } else {
    email = staffEmail(input.username);
  }

  const password = input.mode === 'student' ? input.pin : input.password;
  const { data: auth, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !auth?.session) return fail('bad_credentials');

  if (input.mode === 'staff') {
    const { data: profile } = await db
      .from('app_users')
      .select('id, role, display_name, is_active')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (!profile) return fail('no_profile');

    if (!profile.is_active) {
      await writeAudit(db, {
        actorLabel: input.username,
        actorRole: profile.role,
        entityType: 'auth',
        action: 'login_blocked_inactive',
        ip,
        userAgent: ua,
      });
      return json({ error: 'الحساب معطّل' }, 403);
    }

    await db.rpc('auth_reset_failures', { p_identifier: identifier });
    await writeAudit(db, {
      actorLabel: input.username,
      actorRole: profile.role,
      entityType: 'auth',
      entityId: profile.id,
      action: 'login',
      ip,
      userAgent: ua,
    });

    return json(
      {
        session: auth.session,
        role: profile.role,
        displayName: profile.display_name,
        mustChangePassword: false,
        redirect: profile.role === 'super_admin' ? '/admin/global-board' : '/schedules',
      },
      200,
    );
  }

  await db.rpc('auth_reset_failures', { p_identifier: identifier });
  await writeAudit(db, {
    actorLabel: student.full_name,
    actorRole: 'student',
    scheduleId: student.schedule_id,
    entityType: 'auth',
    entityId: student.id,
    action: 'login',
    ip,
    userAgent: ua,
  });

  return json(
    {
      session: auth.session,
      role: 'student',
      displayName: student.full_name,
      mustChangePassword: student.must_change_password,
      redirect: student.must_change_password ? '/change-password' : '/today',
    },
    200,
  );
}
