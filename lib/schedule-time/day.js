export const TZ = 'Asia/Riyadh';
const MS_PER_DAY = 86_400_000;

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 'YYYY-MM-DD' for the given instant, in Riyadh local time. */
export function toDayKey(date) {
  return fmt.format(date);
}

export function todayInRiyadh(now = new Date()) {
  return toDayKey(now);
}

/** Parse 'YYYY-MM-DD' as a UTC-noon instant so offset shifts cannot move the day. */
function parseKey(dayKey) {
  const [y, m, d] = String(dayKey).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function formatKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dayKey, n) {
  return formatKey(new Date(parseKey(dayKey).getTime() + n * MS_PER_DAY));
}

/** 0 = Sunday, matching PostgreSQL EXTRACT(DOW FROM date). */
export function dayOfWeek(dayKey) {
  return parseKey(dayKey).getUTCDay();
}

export function daysBetween(fromKey, toKey) {
  return Math.round((parseKey(toKey) - parseKey(fromKey)) / MS_PER_DAY);
}

const maxKey = (a, b) => (a > b ? a : b);
const minKey = (a, b) => (a < b ? a : b);

export function backfillWindow(schedule, now = new Date()) {
  const today = todayInRiyadh(now);
  let latest = today;
  if (schedule.end_date) latest = minKey(latest, schedule.end_date);

  let earliest = addDays(today, -Math.max(0, schedule.backfill_days ?? 0));
  earliest = maxKey(earliest, schedule.start_date);
  if (earliest > latest) earliest = latest;

  return { earliest, latest };
}

export function isWithinBackfill(schedule, dayKey, now = new Date()) {
  const { earliest, latest } = backfillWindow(schedule, now);
  return dayKey >= earliest && dayKey <= latest;
}

/**
 * Why a day cannot be filled in, or null when it can be.
 *
 * The screen used to say "انتهت مهلة التعديل" for every locked day, including
 * days that have not happened yet — the one case where nothing has expired at
 * all. The reasons are distinct and the reader can act on some of them, so they
 * are told apart here rather than collapsed into one sentence.
 */
export function lockReason(schedule, dayKey, now = new Date()) {
  if (!schedule) return null;
  if (schedule.status === 'archived') return 'archived';

  const today = todayInRiyadh(now);
  if (dayKey > today) return 'future';
  if (dayKey < schedule.start_date) return 'before_start';
  if (schedule.end_date && dayKey > schedule.end_date) return 'after_end';

  return isWithinBackfill(schedule, dayKey, now) ? null : 'backfill_closed';
}

/** Every day the schedule has covered so far: start..end, or start..today when open-ended. */
export function scheduleDayRange(schedule, now = new Date()) {
  const today = todayInRiyadh(now);
  const last = schedule.end_date ? minKey(schedule.end_date, today) : today;
  if (schedule.start_date > last) return [];

  const days = [];
  for (let d = schedule.start_date; d <= last; d = addDays(d, 1)) days.push(d);
  return days;
}

const WEEKDAY_LABELS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const WEEKDAY_SHORT = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

export function weekdayLabel(dayKey) {
  return WEEKDAY_LABELS[dayOfWeek(dayKey)];
}

export function weekdayShort(dayKey) {
  return WEEKDAY_SHORT[dayOfWeek(dayKey)];
}

export { WEEKDAY_LABELS, WEEKDAY_SHORT };

export function formatDayArabic(dayKey) {
  const [y, m, d] = String(dayKey).split('-');
  return `${weekdayLabel(dayKey)} ${Number(d)}/${Number(m)}/${y}`;
}

const gregorianFmt = new Intl.DateTimeFormat('ar-u-nu-arab', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const hijriFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** e.g. "٢٠ أغسطس ٢٠٢٦" — the Gregorian date spelled out in Arabic. */
export function formatGregorianLong(dayKey) {
  return gregorianFmt.format(parseKey(dayKey));
}

/** e.g. "٦ صفر ١٤٤٧ هـ" — the Umm al-Qura Hijri date for this day. */
export function formatHijri(dayKey) {
  return hijriFmt.format(parseKey(dayKey));
}
