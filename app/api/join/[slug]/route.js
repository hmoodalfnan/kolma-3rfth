import { safeHandler } from '@/lib/http/safe-handler';
import { createServiceClient } from '@/lib/supabase/server';
import { clientIp, jsonResponse as json } from '@/lib/http/request-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLUG_RE = /^[0-9a-z]{10,32}$/;

async function getHandler(request, { params }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug ?? '')) return json({ error: 'الرابط غير صالح' }, 400);

  const db = createServiceClient();
  const gate = await db.rpc('rl_hit', {
    p_key: `join:${clientIp(request) || 'unknown'}`,
    p_limit: 60,
    p_window_seconds: 300,
  });
  if (gate.data === false) return json({ error: 'محاولات كثيرة، حاول لاحقاً' }, 429);

  // A slug may name a whole schedule or a single group inside one.
  let scheduleId = null;
  let groupFilter = null;

  const { data: bySchedule } = await db
    .from('schedules')
    .select('id, name, status')
    .eq('slug', slug)
    .maybeSingle();

  let schedule = bySchedule;

  if (!schedule) {
    const { data: group } = await db
      .from('groups')
      .select('id, schedule_id')
      .eq('join_slug', slug)
      .maybeSingle();

    if (!group) return json({ error: 'الرابط غير صالح' }, 404);

    groupFilter = group.id;
    const { data: parent } = await db
      .from('schedules')
      .select('id, name, status')
      .eq('id', group.schedule_id)
      .maybeSingle();
    schedule = parent;
  }

  if (!schedule) return json({ error: 'الرابط غير صالح' }, 404);
  scheduleId = schedule.id;

  const { data: groups } = await db
    .from('groups')
    .select('id, name')
    .eq('schedule_id', scheduleId)
    .order('sort_order');

  let query = db
    .from('students')
    .select('id, full_name, group_id')
    .eq('schedule_id', scheduleId)
    .eq('is_active', true);

  if (groupFilter) query = query.eq('group_id', groupFilter);

  const { data: students } = await query.order('sort_order').order('full_name');

  return json(
    {
      schedule: { name: schedule.name, archived: schedule.status === 'archived' },
      groups: groupFilter ? (groups ?? []).filter((g) => g.id === groupFilter) : (groups ?? []),
      students: students ?? [],
    },
    200,
  );
}

export const GET = safeHandler('app/api/join/[slug]/route.js:GET', getHandler);
