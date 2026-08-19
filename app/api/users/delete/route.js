import { safeHandler } from '@/lib/http/safe-handler';
import { requireSuperAdmin } from '@/lib/http/guard';
import { clientIp, userAgent, jsonResponse as json } from '@/lib/http/request-context';
import { deleteStudentSchema } from '@/lib/validation/students';
import { writeAudit } from '@/lib/audit/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Permanently delete a self-serve account.
 *
 * The login lives in auth.users, which no browser session may touch; the profile
 * row cascades to the user's answers and completions. Delete the login first: an
 * orphaned profile row is visible and fixable, an orphaned login is neither.
 */
async function postHandler(request) {
  const ctx = await requireSuperAdmin(request, { rateKey: 'users_delete', limit: 60 });
  if (ctx.response) return ctx.response;
  const { db, profile } = ctx;

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = deleteStudentSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'طلب غير صالح' }, 400);

  const { data: student } = await db
    .from('students')
    .select('id, schedule_id, full_name, auth_uid')
    .eq('id', parsed.data.studentId)
    .maybeSingle();
  if (!student) return json({ error: 'المستخدم غير موجود' }, 404);

  if (student.auth_uid) {
    const removed = await db.auth.admin.deleteUser(student.auth_uid);
    // A login that is already gone is the state we were aiming for.
    if (removed.error && removed.error.status !== 404) {
      console.error('[users/delete] auth user', removed.error.message);
      return json({ error: 'تعذّر حذف حساب الدخول' }, 500);
    }
  }

  const deleted = await db.from('students').delete().eq('id', student.id);
  if (deleted.error) {
    console.error('[users/delete] row', deleted.error.message);
    return json({ error: 'تعذّر حذف الحساب' }, 500);
  }

  await writeAudit(db, {
    actorLabel: profile.username,
    actorRole: profile.role,
    scheduleId: student.schedule_id,
    entityType: 'student',
    entityId: student.id,
    action: 'delete_account',
    before: { full_name: student.full_name },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return json({ ok: true }, 200);
}

export const POST = safeHandler('app/api/users/delete/route.js:POST', postHandler);
