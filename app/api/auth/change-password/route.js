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

  if (currentPassword && currentPassword === newPassword) {
    return json({ error: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية' }, 400);
  }

  const { data: student } = await db
    .from('students')
    .select('id, schedule_id, full_name, must_change_password')
    .eq('auth_uid', user.id)
    .maybeSingle();

  const isStudent = Boolean(student);

  const { data: staffRow } = isStudent
    ? { data: null }
    : await db
        .from('app_users')
        .select('must_change_password')
        .eq('id', user.id)
        .maybeSingle();

  // A first-time change is the account trading in a temporary secret it was
  // given. Asking for that secret again proves nothing — the person typed it
  // moments ago to reach this screen — so the valid session is the whole check.
  // The flag is read from the database, never from the request, so a caller
  // cannot skip re-authentication by claiming to be new.
  const isFirstTimeChange = Boolean(
    isStudent ? student.must_change_password : staffRow?.must_change_password,
  );

  const policy = isStudent ? validateStudentPin(newPassword) : validateStaffPassword(newPassword);
  if (!policy.ok) return json({ error: policy.error }, 400);

  if (!isFirstTimeChange) {
    if (!currentPassword) {
      return json({ error: 'أدخل كلمة المرور الحالية' }, 400);
    }

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

  // Changing the password can invalidate the session that was used to change it,
  // which is why this used to end in a forced sign-out. Minting a fresh session
  // from the new password lets the caller carry straight on instead — and it
  // doubles as proof that the new password actually works.
  const refreshed = await db.auth.signInWithPassword({
    email: user.email,
    password: newPassword,
  });

  const redirect = isStudent
    ? '/today'
    : profile?.role === 'super_admin'
      ? '/admin/global-board'
      : '/schedules';

  return json({ ok: true, session: refreshed.data?.session ?? null, redirect }, 200);
}

export const POST = safeHandler('app/api/auth/change-password/route.js:POST', postHandler);
