import { requireStaff, staffsSchedule } from '@/lib/http/guard';
import { clientIp, userAgent, jsonResponse as json } from '@/lib/http/request-context';
import { resetPinSchema } from '@/lib/validation/students';
import { generatePin } from '@/lib/auth/password';
import { studentEmail } from '@/lib/auth/identity';
import { writeAudit } from '@/lib/audit/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const ctx = await requireStaff(request, { rateKey: 'reset_pin', limit: 100 });
  if (ctx.response) return ctx.response;
  const { db, scoped, profile } = ctx;

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = resetPinSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'طلب غير صالح' }, 400);

  const { data: student } = await db
    .from('students')
    .select('id, schedule_id, full_name, auth_uid')
    .eq('id', parsed.data.studentId)
    .maybeSingle();

  if (!student) return json({ error: 'الطالب غير موجود' }, 404);
  if (!(await staffsSchedule(scoped, student.schedule_id))) return json({ error: 'غير مصرح' }, 403);

  const pin = generatePin();

  if (student.auth_uid) {
    const updated = await db.auth.admin.updateUserById(student.auth_uid, { password: pin });
    if (updated.error) return json({ error: 'تعذّر إعادة تعيين الرمز' }, 500);
  } else {
    const authUser = await db.auth.admin.createUser({
      email: studentEmail(student.id),
      password: pin,
      email_confirm: true,
    });
    if (authUser.error) return json({ error: 'تعذّر إنشاء حساب الطالب' }, 500);
    await db.from('students').update({ auth_uid: authUser.data.user.id }).eq('id', student.id);
  }

  await db.from('students').update({ must_change_password: true }).eq('id', student.id);

  await writeAudit(db, {
    actorLabel: profile.username,
    actorRole: profile.role,
    scheduleId: student.schedule_id,
    entityType: 'student',
    entityId: student.id,
    action: 'reset_pin',
    after: { full_name: student.full_name },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return json({ tempPin: pin, full_name: student.full_name }, 200);
}
