'use client';

const ACTION_LABELS = {
  login: 'سجّل الدخول',
  login_failed: 'محاولة دخول فاشلة',
  login_blocked_inactive: 'محاولة دخول لحساب معطّل',
  password_change: 'غيّر كلمة المرور',
  create: 'أنشأ',
  update: 'عدّل',
  delete: 'حذف',
  archive: 'أرشف',
  clone: 'نسخ',
  grant: 'منح نقاطاً',
  grant_undo: 'تراجع عن نقاط',
  reset_pin: 'أعاد تعيين الرمز',
  reset_password: 'أعاد تعيين كلمة المرور',
  assign: 'أسند رحلات',
  export: 'صدّر بيانات',
};

const ENTITY_LABELS = {
  auth: 'الدخول',
  student: 'طالب',
  app_user: 'حساب مشرف',
  schedule: 'رحلة',
  question: 'بند',
  point_event: 'نقاط',
  group: 'مجموعة',
  criterion: 'بند تقييم',
  export: 'تصدير',
};

export function describeEntry(entry) {
  const actor = entry.actor_label || 'مستخدم';
  const action = ACTION_LABELS[entry.action] ?? entry.action;
  const entity = ENTITY_LABELS[entry.entity_type] ?? entry.entity_type;

  if (entry.entity_type === 'auth') return `${actor} — ${action}`;

  const detail =
    entry.after?.full_name ??
    entry.after?.name ??
    entry.after?.title ??
    entry.after?.username ??
    (typeof entry.after?.count === 'number' ? `${entry.after.count} عنصراً` : null);

  return detail ? `${actor} ${action} ${entity}: ${detail}` : `${actor} ${action} ${entity}`;
}

/**
 * Keyset pagination on (created_at, id) so deep pages stay fast at 200 students'
 * worth of activity. `scheduleId: null` is the super-admin, all-schedules view.
 */
export async function fetchAuditLog(
  client,
  { scheduleId, actorId, entityType, action, from, to, cursor, limit = 50 } = {},
) {
  let query = client.from('audit_log').select('*');

  if (scheduleId) query = query.eq('schedule_id', scheduleId);
  if (actorId) query = query.eq('actor_user_id', actorId);
  if (entityType) query = query.eq('entity_type', entityType);
  if (action) query = query.eq('action', action);
  if (from) query = query.gte('created_at', `${from}T00:00:00Z`);
  if (to) query = query.lte('created_at', `${to}T23:59:59Z`);
  if (cursor) query = query.lt('id', cursor);

  const { data, error } = await query.order('id', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  return { rows, nextCursor: rows.length === limit ? rows[rows.length - 1].id : null };
}

export { ACTION_LABELS, ENTITY_LABELS };
