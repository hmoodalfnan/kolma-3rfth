import { safeHandler } from '@/lib/http/safe-handler';
import { createServiceClient, createRequestClient } from '@/lib/supabase/server';
import {
  clientIp,
  sameOrigin,
  userAgent,
  bearerToken,
  jsonResponse as json,
} from '@/lib/http/request-context';
import { changePasswordSchema } from '@/lib/validation/auth';
import { validateStaffPassword, validateStudentPin } from '@/lib/auth/password';
import { writeAudit } from '@/lib/audit/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function postHandler(request) {
  if (!sameOrigin(request)) return json({ error: 'طلب غير مسموح' }, 403);

  const token = bearerToken(request);
  if (!token) return json({ error: 'الجلسة منتهية، سجّل الدخول من جديد' }, 401);

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'طلب غير صالح' }, 400);
  const { currentPassword, newPassword } = parsed.data;

  const scoped = createRequestClient(token);
  const { data: userData } = await scoped.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: 'الجلسة منتهية، سجّل الدخول من جديد' }, 401);

  const db = createServiceClient();

  const gate = await db.rpc('rl_hit', {
    p_key: `pwchange:${user.id}`,
    p_limit: 5,
    p_window_seconds: 3600,
  });
  if (gate.data === false) return json({ error: 'محاولات كثيرة، حاول لاحقاً' }, 429);

  if (currentPassword === newPassword) {
    return json({ error: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية' }, 400);
  }

  const { data: student } = await db
    .from('students')
    .select('id, schedule_id, full_name')
    .eq('auth_uid', user.id)
    .maybeSingle();

  const isStudent = Boolean(student);

  const policy = isStudent ? validateStudentPin(newPassword) : validateStaffPassword(newPassword);
  if (!policy.ok) return json({ error: policy.error }, 400);

  // Re-authenticate before changing anything.
  const reauth = await db.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauth.error || !reauth.data?.session) {
    await db.rpc('auth_record_failure', {
      p_identifier: isStudent ? `student:${student.id}` : `staff:${user.id}`,
    });
    return json({ error: 'كلمة المرور الحالية غير صحيحة' }, 401);
  }

  const updated = await db.auth.admin.updateUserById(user.id, { password: newPassword });
  if (updated.error) return json({ error: 'تعذّر تغيير كلمة المرور' }, 500);

  let profile = null;
  if (isStudent) {
    await db.from('students').update({ must_change_password: false }).eq('id', student.id);
  } else {
    const { data } = await db
      .from('app_users')
      .update({ must_change_password: false })
      .eq('id', user.id)
      .select('id, username, role')
      .maybeSingle();
    profile = data;
  }

  await writeAudit(db, {
    actorLabel: isStudent ? student.full_name : (profile?.username ?? user.id),
    actorRole: isStudent ? 'student' : (profile?.role ?? 'manager'),
    scheduleId: isStudent ? student.schedule_id : null,
    entityType: isStudent ? 'student' : 'app_user',
    entityId: isStudent ? student.id : user.id,
    action: 'password_change',
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return json({ ok: true }, 200);
}

export const POST = safeHandler('app/api/auth/change-password/route.js:POST', postHandler);
