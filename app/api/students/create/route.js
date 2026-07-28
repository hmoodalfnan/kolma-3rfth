import { requireStaff, staffsSchedule } from '@/lib/http/guard';
import { clientIp, userAgent, jsonResponse as json } from '@/lib/http/request-context';
import { createStudentsSchema } from '@/lib/validation/students';
import { generatePin, validateStudentPin } from '@/lib/auth/password';
import { studentEmail } from '@/lib/auth/identity';
import { writeAudit } from '@/lib/audit/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const ctx = await requireStaff(request, { rateKey: 'students_create', limit: 40 });
  if (ctx.response) return ctx.response;
  const { db, scoped, profile } = ctx;

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = createStudentsSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'طلب غير صالح' }, 400);
  }
  const { scheduleId, groupId, students } = parsed.data;

  if (!(await staffsSchedule(scoped, scheduleId))) return json({ error: 'غير مصرح' }, 403);

  for (const s of students) {
    if (s.pin && !validateStudentPin(s.pin).ok) {
      return json({ error: `رمز غير صالح للطالب: ${s.full_name}` }, 400);
    }
  }

  const created = [];
  const rollbackStudents = [];
  const rollbackUsers = [];

  try {
    for (const [index, s] of students.entries()) {
      const pin = s.pin ?? generatePin();

      // eslint-disable-next-line no-await-in-loop
      const inserted = await db
        .from('students')
        .insert({
          schedule_id: scheduleId,
          group_id: groupId ?? null,
          full_name: s.full_name,
          must_change_password: true,
          sort_order: index,
        })
        .select('id, full_name')
        .single();

      if (inserted.error) throw new Error(inserted.error.message);
      rollbackStudents.push(inserted.data.id);

      // eslint-disable-next-line no-await-in-loop
      const authUser = await db.auth.admin.createUser({
        email: studentEmail(inserted.data.id),
        password: pin,
        email_confirm: true,
      });
      if (authUser.error) throw new Error(authUser.error.message);
      rollbackUsers.push(authUser.data.user.id);

      // eslint-disable-next-line no-await-in-loop
      const linked = await db
        .from('students')
        .update({ auth_uid: authUser.data.user.id })
        .eq('id', inserted.data.id);
      if (linked.error) throw new Error(linked.error.message);

      created.push({ id: inserted.data.id, full_name: inserted.data.full_name, tempPin: pin });
    }
  } catch (err) {
    // Partial creation would leave students who can never log in — undo everything.
    for (const id of rollbackUsers) await db.auth.admin.deleteUser(id);
    if (rollbackStudents.length > 0) await db.from('students').delete().in('id', rollbackStudents);
    console.error('[students/create] rolled back', err?.message);
    return json({ error: 'تعذّر إنشاء الطلاب، لم يتم حفظ أي تغيير' }, 500);
  }

  await writeAudit(db, {
    actorLabel: profile.username,
    actorRole: profile.role,
    scheduleId,
    entityType: 'student',
    action: 'create',
    after: { count: created.length, names: created.map((c) => c.full_name), groupId: groupId ?? null },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return json({ created }, 200);
}
