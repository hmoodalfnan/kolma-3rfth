import { safeHandler } from '@/lib/http/safe-handler';
import { requireStaff, staffsSchedule } from '@/lib/http/guard';
import { clientIp, userAgent, jsonResponse as json } from '@/lib/http/request-context';
import { deleteStudentSchema } from '@/lib/validation/students';
import { writeAudit } from '@/lib/audit/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Removing a student is two deletes, not one.
 *
 * The row cascades to their answers and their point events, but their login
 * lives in auth.users, which no browser session may touch. Left behind it is an
 * account with no student attached to it — still able to sign in and land on a
 * page that cannot say who they are. The service client deletes both, the login
 * first: an orphaned student row is visible and fixable, an orphaned login is
 * neither.
 */
async function postHandler(request) {
  const ctx = await requireStaff(request, { rateKey: 'students_delete', limit: 60 });
  if (ctx.response) return ctx.response;
  const { db, scoped, profile } = ctx;

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
    .select('id, schedule_id, full_name, group_id, auth_uid')
    .eq('id', parsed.data.studentId)
    .maybeSingle();

  if (!student) return json({ error: 'الطالب غير موجود' }, 404);
  if (!(await staffsSchedule(scoped, student.schedule_id))) return json({ error: 'غير مصرح' }, 403);

  if (student.auth_uid) {
    const removed = await db.auth.admin.deleteUser(student.auth_uid);
    // A login that is already gone is the state we were aiming for, so only a
    // real failure stops us.
    if (removed.error && removed.error.status !== 404) {
      console.error('[students/delete] auth user', removed.error.message);
      return json({ error: 'تعذّر حذف حساب دخول الطالب' }, 500);
    }
  }

  const deleted = await db.from('students').delete().eq('id', student.id);
  if (deleted.error) {
    console.error('[students/delete] row', deleted.error.message);
    return json({ error: 'تعذّر حذف الطالب' }, 500);
  }

  await writeAudit(db, {
    actorLabel: profile.username,
    actorRole: profile.role,
    scheduleId: student.schedule_id,
    entityType: 'student',
    entityId: student.id,
    action: 'delete',
    before: { full_name: student.full_name, group_id: student.group_id },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return json({ ok: true }, 200);
}

export const POST = safeHandler('app/api/students/delete/route.js:POST', postHandler);
