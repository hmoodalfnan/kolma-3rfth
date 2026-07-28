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
