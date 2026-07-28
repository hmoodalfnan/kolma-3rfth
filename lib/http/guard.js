import 'server-only';
import { createServiceClient, createRequestClient } from '@/lib/supabase/server';
import { sameOrigin, bearerToken, jsonResponse as json } from './request-context';

/**
 * Shared preamble for every mutating route handler.
 *
 * Returns either `{ response }` — send it and stop — or the verified caller
 * context. Authorization questions are answered by the database through the
 * caller's own token, never by anything the client sent us.
 */
export async function requireStaff(request, { rateKey, limit = 60, windowSeconds = 3600 } = {}) {
  if (!sameOrigin(request)) return { response: json({ error: 'طلب غير مسموح' }, 403) };

  const token = bearerToken(request);
  if (!token) return { response: json({ error: 'الجلسة منتهية، سجّل الدخول من جديد' }, 401) };

  const scoped = createRequestClient(token);
  const { data: userData } = await scoped.auth.getUser();
  const user = userData?.user;
  if (!user) return { response: json({ error: 'الجلسة منتهية، سجّل الدخول من جديد' }, 401) };

  const db = createServiceClient();

  const { data: profile } = await db
    .from('app_users')
    .select('id, username, display_name, role, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return { response: json({ error: 'غير مصرح' }, 403) };

  if (rateKey) {
    const gate = await db.rpc('rl_hit', {
      p_key: `${rateKey}:${user.id}`,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (gate.data === false) return { response: json({ error: 'محاولات كثيرة، حاول لاحقاً' }, 429) };
  }

  return { user, profile, db, scoped };
}

/** True when this caller may act on the given schedule; asked of the database. */
export async function staffsSchedule(scoped, scheduleId) {
  const { data } = await scoped.from('schedules').select('id').eq('id', scheduleId).maybeSingle();
  return Boolean(data);
}

export async function requireSuperAdmin(request, options) {
  const ctx = await requireStaff(request, options);
  if (ctx.response) return ctx;
  if (ctx.profile.role !== 'super_admin') return { response: json({ error: 'غير مصرح' }, 403) };
  return ctx;
}
