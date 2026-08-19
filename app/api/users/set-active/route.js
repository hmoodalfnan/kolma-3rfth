import { safeHandler } from '@/lib/http/safe-handler';
import { requireSuperAdmin } from '@/lib/http/guard';
import { clientIp, userAgent, jsonResponse as json } from '@/lib/http/request-context';
import { setActiveSchema } from '@/lib/validation/students';
import { writeAudit } from '@/lib/audit/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Enable or disable a self-serve account.
 *
 * Two moves, because access has two gates. Flipping students.is_active stops the
 * login route from ever issuing a fresh session (and drops the row from rosters
 * and the leaderboard). Banning the auth user cuts off any session they still
 * hold, so a disabled user is out immediately, not at the next token expiry.
 * Re-enabling reverses both.
 */
async function postHandler(request) {
  const ctx = await requireSuperAdmin(request, { rateKey: 'users_set_active', limit: 60 });
  if (ctx.response) return ctx.response;
  const { db, profile } = ctx;

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = setActiveSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'طلب غير صالح' }, 400);
  const { studentId, active } = parsed.data;

  const { data: student } = await db
    .from('students')
    .select('id, schedule_id, full_name, auth_uid, is_active')
    .eq('id', studentId)
    .maybeSingle();
  if (!student) return json({ error: 'المستخدم غير موجود' }, 404);

  const updated = await db.from('students').update({ is_active: active }).eq('id', student.id);
  if (updated.error) {
    console.error('[users/set-active] row', updated.error.message);
    return json({ error: 'تعذّر تحديث الحساب' }, 500);
  }

  if (student.auth_uid) {
    const banned = await db.auth.admin.updateUserById(student.auth_uid, {
      ban_duration: active ? 'none' : '876000h', // lift, or ~100 years
    });
    // The row is the source of truth for access; a failed ban is not fatal — the
    // disabled user still cannot obtain a new session.
    if (banned.error) console.error('[users/set-active] ban', banned.error.message);
  }

  await writeAudit(db, {
    actorLabel: profile.username,
    actorRole: profile.role,
    scheduleId: student.schedule_id,
    entityType: 'student',
    entityId: student.id,
    action: active ? 'enable_account' : 'disable_account',
    before: { is_active: student.is_active },
    after: { is_active: active },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return json({ ok: true }, 200);
}

export const POST = safeHandler('app/api/users/set-active/route.js:POST', postHandler);
