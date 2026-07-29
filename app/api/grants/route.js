import { safeHandler } from '@/lib/http/safe-handler';
import { requireStaff, staffsSchedule } from '@/lib/http/guard';
import { clientIp, userAgent, jsonResponse as json } from '@/lib/http/request-context';
import { writeAudit } from '@/lib/audit/write';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const grantSchema = z
  .object({
    scheduleId: z.string().uuid(),
    criterionId: z.string().uuid(),
    points: z.number().finite().refine((n) => n !== 0, 'النقاط يجب ألا تكون صفراً').refine(
      (n) => Math.abs(n) <= 1000,
      'النقاط خارج الحدود المسموحة',
    ),
    note: z.string().max(500).default(''),
    target: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('student'), studentId: z.string().uuid() }).strict(),
      z
        .object({
          kind: z.literal('group'),
          groupId: z.string().uuid(),
          applyToMembers: z.boolean().default(false),
        })
        .strict(),
    ]),
  })
  .strict();

async function postHandler(request) {
  const ctx = await requireStaff(request, { rateKey: 'grants', limit: 200 });
  if (ctx.response) return ctx.response;
  const { db, scoped, profile } = ctx;

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = grantSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'طلب غير صالح' }, 400);
  }
  const { scheduleId, criterionId, points, note, target } = parsed.data;

  if (!(await staffsSchedule(scoped, scheduleId))) return json({ error: 'غير مصرح' }, 403);

  const { data: criterion } = await db
    .from('criteria')
    .select('id, name, allow_negative, schedule_id')
    .eq('id', criterionId)
    .maybeSingle();

  if (!criterion || criterion.schedule_id !== scheduleId) {
    return json({ error: 'بند التقييم غير موجود في هذه الرحلة' }, 400);
  }
  if (!criterion.allow_negative && points < 0) {
    return json({ error: 'هذا البند لا يسمح بالخصم' }, 400);
  }

  // The RPCs run as definer and re-check authorization internally.
  const rpc =
    target.kind === 'student'
      ? scoped.rpc('grant_student_points', {
          p_schedule: scheduleId,
          p_student: target.studentId,
          p_criterion: criterionId,
          p_points: points,
          p_note: note,
        })
      : scoped.rpc('grant_group_points', {
          p_schedule: scheduleId,
          p_group: target.groupId,
          p_criterion: criterionId,
          p_points: points,
          p_note: note,
          p_apply_to_members: target.applyToMembers,
        });

  const { data, error } = await rpc;
  if (error) return json({ error: error.message || 'تعذّر تسجيل النقاط' }, 400);

  await writeAudit(db, {
    actorLabel: profile.username,
    actorRole: profile.role,
    scheduleId,
    entityType: 'point_event',
    entityId: data,
    action: 'grant',
    after: { criterion: criterion.name, points, note, target },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return json({ id: data }, 200);
}

async function deleteHandler(request) {
  const ctx = await requireStaff(request, { rateKey: 'grants_delete', limit: 100 });
  if (ctx.response) return ctx.response;
  const { db, scoped, profile } = ctx;

  const eventId = new URL(request.url).searchParams.get('id');
  if (!eventId || !/^[0-9a-f-]{36}$/i.test(eventId)) return json({ error: 'طلب غير صالح' }, 400);

  const { data: event } = await db
    .from('point_events')
    .select('id, schedule_id, points, criterion_id')
    .eq('id', eventId)
    .maybeSingle();

  if (!event) return json({ error: 'العملية غير موجودة' }, 404);
  if (!(await staffsSchedule(scoped, event.schedule_id))) return json({ error: 'غير مصرح' }, 403);

  const { error } = await scoped.from('point_events').delete().eq('id', eventId);
  if (error) return json({ error: 'تعذّر حذف النقاط' }, 400);

  await writeAudit(db, {
    actorLabel: profile.username,
    actorRole: profile.role,
    scheduleId: event.schedule_id,
    entityType: 'point_event',
    entityId: eventId,
    action: 'grant_undo',
    before: { points: event.points },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return json({ ok: true }, 200);
}

export const POST = safeHandler('app/api/grants/route.js:POST', postHandler);
export const DELETE = safeHandler('app/api/grants/route.js:DELETE', deleteHandler);
