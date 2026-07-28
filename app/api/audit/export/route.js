import { safeHandler } from '@/lib/http/safe-handler';
import { requireStaff, staffsSchedule } from '@/lib/http/guard';
import { clientIp, userAgent, jsonResponse as json } from '@/lib/http/request-context';
import { writeAudit } from '@/lib/audit/write';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z
  .object({
    scheduleId: z.string().uuid(),
    sheets: z.array(z.string().max(40)).max(20),
  })
  .strict();

async function postHandler(request) {
  const ctx = await requireStaff(request, { rateKey: 'export', limit: 30 });
  if (ctx.response) return ctx.response;
  const { db, scoped, profile } = ctx;

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return json({ error: 'طلب غير صالح' }, 400);

  if (!(await staffsSchedule(scoped, parsed.data.scheduleId))) {
    return json({ error: 'غير مصرح' }, 403);
  }

  await writeAudit(db, {
    actorLabel: profile.username,
    actorRole: profile.role,
    scheduleId: parsed.data.scheduleId,
    entityType: 'export',
    action: 'export',
    after: { sheets: parsed.data.sheets },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return json({ ok: true }, 200);
}

export const POST = safeHandler('app/api/audit/export/route.js:POST', postHandler);
