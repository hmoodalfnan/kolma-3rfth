import { safeHandler } from '@/lib/http/safe-handler';
import { requireSuperAdmin } from '@/lib/http/guard';
import { clientIp, userAgent, jsonResponse as json } from '@/lib/http/request-context';
import { deleteScheduleSchema } from '@/lib/validation/students';
import { writeAudit } from '@/lib/audit/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Delete a whole trip: its groups, students, بنود, criteria, answers and grants.
 *
 * Super admin only, and the database says so too — the schedules_delete policy
 * is `using (is_super_admin())`, so this route is the interface to that rule
 * rather than the rule itself. It exists because one part of a trip is out of
 * reach of any cascade: each student's login lives in auth.users, which no
 * browser session may touch. Deleting the trip without them would leave a pile
 * of accounts that can still sign in and land nowhere.
 *
 * Logins go first for that reason: an orphaned student row is visible and
 * fixable, an orphaned login is neither. Everything else follows from the
 * foreign keys, which cascade from schedules downwards.
 *
 * The audit entry is written before the delete — audit_log.schedule_id is
 * ON DELETE SET NULL, so afterwards there would be nothing to point at. The
 * name is recorded in the payload so the entry still reads as a sentence once
 * the trip it names is gone.
 */
async function postHandler(request) {
  const ctx = await requireSuperAdmin(request, { rateKey: 'schedules_delete', limit: 20 });
  if (ctx.response) return ctx.response;
  const { db, profile } = ctx;

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = deleteScheduleSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'طلب غير صالح' }, 400);

  const { data: schedule } = await db
    .from('schedules')
    .select('id, name, start_date, end_date, status')
    .eq('id', parsed.data.scheduleId)
    .maybeSingle();

  if (!schedule) return json({ error: 'الرحلة غير موجودة' }, 404);

  // Typed back by the person asking. A trip is the largest thing this app can
  // destroy, and the name is the only part of it they are certain to recognise.
  if (parsed.data.confirmName.trim() !== schedule.name.trim()) {
    return json({ error: 'اسم الرحلة غير مطابق' }, 400);
  }

  const { data: students, error: readError } = await db
    .from('students')
    .select('id, auth_uid')
    .eq('schedule_id', schedule.id);

  if (readError) {
    console.error('[schedules/delete] students', readError.message);
    return json({ error: 'تعذّر قراءة طلاب الرحلة' }, 500);
  }

  await writeAudit(db, {
    actorLabel: profile.username,
    actorRole: profile.role,
    scheduleId: schedule.id,
    entityType: 'schedule',
    entityId: schedule.id,
    action: 'delete',
    before: {
      name: schedule.name,
      start_date: schedule.start_date,
      end_date: schedule.end_date,
      status: schedule.status,
      students: students.length,
    },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  const logins = students.filter((s) => s.auth_uid);
  for (const student of logins) {
    const removed = await db.auth.admin.deleteUser(student.auth_uid);
    // Already gone is the state we were aiming for; only a real failure stops us.
    if (removed.error && removed.error.status !== 404) {
      console.error('[schedules/delete] auth user', removed.error.message);
      return json({ error: 'تعذّر حذف حسابات دخول الطلاب — لم تُحذف الرحلة' }, 500);
    }
  }

  const deleted = await db.from('schedules').delete().eq('id', schedule.id);
  if (deleted.error) {
    console.error('[schedules/delete] row', deleted.error.message);
    return json({ error: 'تعذّر حذف الرحلة' }, 500);
  }

  return json({ ok: true, students: students.length }, 200);
}

export const POST = safeHandler('app/api/schedules/delete/route.js:POST', postHandler);
