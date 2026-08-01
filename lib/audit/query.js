'use client';

import { ROLE_LABELS } from '@/lib/auth/guard';
import { friendlyError } from '@/lib/errors/friendly';

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
  grant_undo: 'حذف نقاط',
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

// Only fields a human would recognise appear in the log. Anything not listed
// here — internal ids, timestamps, foreign keys — is deliberately hidden, since
// showing it as a "change" tells the reader nothing they can act on.
const FIELD_LABELS = {
  role: 'الصلاحية',
  username: 'اسم المستخدم',
  display_name: 'الاسم المعروض',
  displayName: 'الاسم المعروض',
  is_active: 'الحالة',
  isActive: 'الحالة',
  full_name: 'الاسم',
  name: 'الاسم',
  title: 'العنوان',
  section: 'القسم',
  type: 'النوع',
  points: 'النقاط',
  note: 'الملاحظة',
  status: 'الحالة',
  start_date: 'تاريخ البداية',
  end_date: 'تاريخ النهاية',
  backfill_days: 'أيام التعديل بأثر رجعي',
  streak_threshold_pct: 'حد الستريك',
  students_see_leaderboard: 'إظهار لوحة الصدارة للطلاب',
  blur_leaderboard_names: 'إخفاء أسماء الطلاب في لوحة الصدارة',
  group_id: 'المجموعة',
  is_archived: 'مؤرشف',
  reason: 'السبب',
  count: 'عدد العناصر',
  scheduleIds: 'الرحلات المسندة',
};

// Arabic counted nouns take the accusative singular, so a bulk import reads
// "أنشأ ٢١ طالباً" rather than the entity label used everywhere else.
const COUNTED_ENTITY_LABELS = {
  student: 'طالباً',
  app_user: 'حساب مشرف',
  schedule: 'رحلة',
  question: 'بنداً',
  group: 'مجموعة',
  criterion: 'بند تقييم',
  point_event: 'عملية نقاط',
};

const STATUS_LABELS = { active: 'جارية', archived: 'مؤرشفة' };

const QUESTION_TYPE_LABELS = {
  bool: 'نعم/لا',
  per_prayer: 'لكل صلاة',
  single_choice: 'اختيار واحد',
  multi_choice: 'اختيار متعدد',
  counter: 'عدّاد',
  rating: 'تقييم بالنجوم',
  text: 'نص',
};

function formatValue(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') {
    if (field === 'is_active' || field === 'isActive') return value ? 'نشط' : 'معطّل';
    return value ? 'نعم' : 'لا';
  }
  if (Array.isArray(value)) return `${value.length}`;
  if (field === 'role') return ROLE_LABELS[value] ?? value;
  if (field === 'status') return STATUS_LABELS[value] ?? value;
  if (field === 'type') return QUESTION_TYPE_LABELS[value] ?? value;
  if (field === 'streak_threshold_pct') return `${value}٪`;
  if (typeof value === 'object') return '—';
  return String(value);
}

/** The human name of whatever the entry acted on, if the payload carries one. */
function subjectName(entry) {
  const source = entry.after ?? entry.before ?? {};
  return source.full_name ?? source.name ?? source.title ?? source.username ?? null;
}

/**
 * One plain sentence per entry.
 *
 * `actorNames` maps a username to its display name. Resolving it needs a read of
 * app_users that RLS only grants to super admins, so it is optional: without it
 * the sentence falls back to the stored label rather than failing.
 */
export function describeEntry(entry, actorNames) {
  const stored = entry.actor_label || 'مستخدم';
  const actor = actorNames?.[stored] ?? stored;
  const action = ACTION_LABELS[entry.action] ?? entry.action;
  const entity = ENTITY_LABELS[entry.entity_type] ?? entry.entity_type;

  if (entry.entity_type === 'auth') return `${actor} — ${action}`;

  if (entry.action === 'assign') {
    const count = entry.after?.scheduleIds?.length ?? 0;
    const target = subjectName(entry);
    const scope = count === 0 ? 'لم يعد مسنداً لأي رحلة' : `أصبح مسنداً لـ ${count} رحلة`;
    return `${actor} عدّل رحلات ${target ? `«${target}»` : 'مشرف'} — ${scope}`;
  }

  if (entry.action === 'export') {
    const count = entry.after?.count;
    return typeof count === 'number'
      ? `${actor} صدّر ${count} سجلاً`
      : `${actor} صدّر بيانات`;
  }

  // A bulk import writes one entry for the whole batch, not one per row.
  if (typeof entry.after?.count === 'number') {
    const counted = COUNTED_ENTITY_LABELS[entry.entity_type] ?? entity;
    return `${actor} ${action} ${entry.after.count} ${counted}`;
  }

  const name = subjectName(entry);
  return name ? `${actor} ${action} ${entity} «${name}»` : `${actor} ${action} ${entity}`;
}

/**
 * The before/after payloads as a list of changed fields in Arabic, replacing the
 * two raw JSON blobs the log used to print. Unchanged and unrecognised keys are
 * dropped — a diff is only useful if every line in it is a real change.
 */
export function describeChanges(entry) {
  const before = entry.before ?? {};
  const after = entry.after ?? {};

  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => key in FIELD_LABELS,
  );

  const rows = [];
  for (const key of keys) {
    const from = formatValue(key, before[key]);
    const to = formatValue(key, after[key]);
    if (from === to) continue;

    rows.push({
      key,
      label: FIELD_LABELS[key],
      from: key in before ? from : null,
      to: key in after ? to : null,
    });
  }
  return rows;
}

const RELATIVE = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
const UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

/** "قبل ٥ دقائق" — an exact timestamp answers a question nobody asked at a glance. */
export function relativeTime(iso, now = Date.now()) {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  const magnitude = Math.abs(seconds);

  if (magnitude < 45) return 'الآن';
  for (const [unit, size] of UNITS) {
    if (magnitude >= size) return RELATIVE.format(Math.round(seconds / size), unit);
  }
  return RELATIVE.format(Math.round(seconds / 60), 'minute');
}

export function absoluteTime(iso) {
  return new Date(iso).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' });
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
  if (error) throw new Error(friendlyError(error));

  const rows = data ?? [];
  return { rows, nextCursor: rows.length === limit ? rows[rows.length - 1].id : null };
}

/** username -> display name, for turning `abd` into `عبدالرحمن علي` in the log. */
export async function fetchActorNames(client) {
  const { data } = await client.from('app_users').select('username, display_name');
  return Object.fromEntries((data ?? []).map((u) => [u.username, u.display_name]));
}

export { ACTION_LABELS, ENTITY_LABELS };
