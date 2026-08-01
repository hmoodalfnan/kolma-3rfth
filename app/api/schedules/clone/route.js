import { safeHandler } from '@/lib/http/safe-handler';
import { requireStaff, staffsSchedule } from '@/lib/http/guard';
import { clientIp, userAgent, jsonResponse as json } from '@/lib/http/request-context';
import { generateSlug } from '@/lib/auth/password';
import { writeAudit } from '@/lib/audit/write';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cloneSchema = z
  .object({
    scheduleId: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .strict();

async function postHandler(request) {
  const ctx = await requireStaff(request, { rateKey: 'clone', limit: 20 });
  if (ctx.response) return ctx.response;
  const { db, scoped, profile } = ctx;

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = cloneSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'طلب غير صالح' }, 400);
  const { scheduleId, name, startDate, endDate } = parsed.data;

  if (!(await staffsSchedule(scoped, scheduleId))) return json({ error: 'غير مصرح' }, 403);

  const { data: source } = await db
    .from('schedules')
    .select(
      'streak_threshold_pct, backfill_days, students_see_leaderboard, blur_leaderboard_names, timezone',
    )
    .eq('id', scheduleId)
    .maybeSingle();

  if (!source) return json({ error: 'الرحلة غير موجودة' }, 404);

  const created = await db
    .from('schedules')
    .insert({
      name,
      slug: generateSlug(),
      start_date: startDate,
      end_date: endDate ?? null,
      timezone: source.timezone,
      streak_threshold_pct: source.streak_threshold_pct,
      backfill_days: source.backfill_days,
      students_see_leaderboard: source.students_see_leaderboard,
      blur_leaderboard_names: source.blur_leaderboard_names,
      created_by: profile.id,
    })
    .select('id')
    .single();

  if (created.error) return json({ error: 'تعذّر إنشاء النسخة' }, 500);
  const newId = created.data.id;

  // The caller stays staff of the clone, or they would lose access to it.
  await db.from('schedule_staff').insert({ schedule_id: newId, user_id: profile.id });

  const [{ data: groups }, { data: questions }, { data: criteria }] = await Promise.all([
    db.from('groups').select('name, sort_order').eq('schedule_id', scheduleId),
    db
      .from('questions')
      .select(
        'library_id, section, title, help_text, type, config, points, active_weekdays, active_from, active_to, is_required, sort_order',
      )
      .eq('schedule_id', scheduleId)
      .is('archived_at', null),
    db.from('criteria').select('name, allow_negative, sort_order').eq('schedule_id', scheduleId),
  ]);

  if (groups?.length) {
    await db
      .from('groups')
      .insert(groups.map((g) => ({ ...g, schedule_id: newId, join_slug: generateSlug() })));
  }
  if (questions?.length) {
    await db.from('questions').insert(questions.map((q) => ({ ...q, schedule_id: newId })));
  }
  if (criteria?.length) {
    await db.from('criteria').insert(criteria.map((c) => ({ ...c, schedule_id: newId })));
  } else {
    await db.rpc('seed_default_criteria', { p_schedule: newId });
  }

  await writeAudit(db, {
    actorLabel: profile.username,
    actorRole: profile.role,
    scheduleId: newId,
    entityType: 'schedule',
    entityId: newId,
    action: 'clone',
    before: { source_schedule_id: scheduleId },
    after: { name, groups: groups?.length ?? 0, questions: questions?.length ?? 0 },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return json({ id: newId }, 200);
}

export const POST = safeHandler('app/api/schedules/clone/route.js:POST', postHandler);
