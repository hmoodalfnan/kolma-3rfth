/**
 * Turns whatever Supabase, PostgREST or the network threw into a sentence the
 * person using the app can act on.
 *
 * Raw database text — "new row violates row-level security policy for table
 * schedules" — names an internal mechanism and tells the reader nothing about
 * what to do next. Everything unrecognised collapses to one generic Arabic
 * message rather than leaking the original, and the raw text goes to the console
 * so it is still there when someone needs to debug it.
 */

const RULES = [
  {
    // Either the account genuinely lacks the permission, or its session lapsed
    // while the interface still looked signed in. The reader cannot tell those
    // apart, so the message covers both and names the fix for the common one.
    match: /row-level security|permission denied|insufficient privilege/i,
    text: 'لا تملك صلاحية للقيام بهذا الإجراء. وإن كنت تملكها فقد تكون جلستك قد انتهت — سجّل الخروج ثم ادخل من جديد.',
  },
  {
    match: /jwt expired|invalid refresh token|refresh_token_not_found|session.*expired|not authenticated/i,
    text: 'انتهت جلستك. سجّل الدخول من جديد للمتابعة.',
  },
  {
    match: /infinite recursion/i,
    text: 'إعداد قاعدة البيانات غير مكتمل. أبلغ المشرف العام لتشغيل ملفات التحديث المتبقية.',
  },
  {
    match: /could not find the .*(table|column)|schema cache|does not exist/i,
    text: 'قاعدة البيانات غير محدّثة. أبلغ المشرف العام لتشغيل ملفات التحديث المتبقية.',
  },
  {
    match: /duplicate key|already exists|unique constraint/i,
    text: 'هذا العنصر موجود بالفعل — اختر اسماً مختلفاً.',
  },
  {
    match: /violates foreign key|still referenced/i,
    text: 'لا يمكن حذف هذا العنصر لأن عناصر أخرى مرتبطة به.',
  },
  {
    match: /violates check constraint|violates not-null/i,
    text: 'بعض الحقول ناقصة أو غير صحيحة. راجع البيانات وحاول مرة أخرى.',
  },
  {
    match: /failed to fetch|networkerror|load failed|ecconnrefused|fetch failed/i,
    text: 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.',
  },
  {
    match: /rate limit|too many requests/i,
    text: 'محاولات كثيرة في وقت قصير. انتظر قليلاً ثم حاول مرة أخرى.',
  },
];

const GENERIC = 'تعذّر إتمام العملية. حاول مرة أخرى، وإن تكرر الخطأ أبلغ المشرف العام.';

/** True for text already written for a human — our own Arabic messages. */
function isAlreadyFriendly(message) {
  return /[؀-ۿ]/.test(message);
}

export function friendlyError(error) {
  const message = typeof error === 'string' ? error : (error?.message ?? '');
  if (!message) return GENERIC;

  for (const rule of RULES) {
    if (rule.match.test(message)) return rule.text;
  }

  // Our route handlers already answer in Arabic; passing those through keeps
  // their specifics, which are more useful than the generic fallback.
  if (isAlreadyFriendly(message)) return message;

  if (typeof console !== 'undefined') {
    console.error('[unmapped error]', message);
  }
  return GENERIC;
}

/** Wraps a thrown error so the UI only ever renders the friendly text. */
export function friendlyThrow(error) {
  throw new Error(friendlyError(error));
}
