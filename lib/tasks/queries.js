/**
 * Pure helpers for the task screens. Kept free of React/Supabase so they can be
 * unit-tested and reused by the offline mirror later.
 */

/** Today's date (YYYY-MM-DD) in the program's timezone. */
export function programToday(tz, now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'Asia/Riyadh',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Points earned today from the set of completed daily-task ids. */
export function earnedToday(dailyTasks, doneTaskIds) {
  const done = doneTaskIds instanceof Set ? doneTaskIds : new Set(doneTaskIds);
  return (dailyTasks || []).reduce(
    (sum, t) => (done.has(t.id) ? sum + Number(t.points || 0) : sum),
    0,
  );
}

/** Points from completed assignments. */
export function earnedAssignments(assignments, doneIds) {
  const done = doneIds instanceof Set ? doneIds : new Set(doneIds);
  return (assignments || []).reduce(
    (sum, a) => (done.has(a.id) ? sum + Number(a.points || 0) : sum),
    0,
  );
}
