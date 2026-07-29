'use client';

import { maxPoints, scoreAnswer, completionPct } from '@/lib/points/score';
import { activeQuestionsOn } from '@/lib/questions/active';
import { currentStreak } from '@/lib/points/streak';
import { PRAYERS } from '@/lib/questions/types';
import { todayInRiyadh, addDays } from '@/lib/schedule-time/day';

/**
 * Everything one student did, assembled from the raw answers.
 *
 * The leaderboard views aggregate points and nothing else, which is enough to
 * rank people and useless for the question that follows — what did they
 * actually do, and which days did they miss. That needs the individual answers,
 * so this reads them once and derives the rest.
 */
export async function fetchStudentDetail(client, { schedule, studentId }) {
  const [{ data: questions, error: qError }, { data: answers, error: aError }] = await Promise.all([
    client
      .from('questions')
      .select('*')
      .eq('schedule_id', schedule.id)
      .order('sort_order'),
    client
      .from('answers')
      .select('question_id, entry_date, value, points')
      .eq('student_id', studentId),
  ]);

  if (qError) throw qError;
  if (aError) throw aError;

  return buildStudentDetail({
    schedule,
    questions: questions ?? [],
    answers: answers ?? [],
  });
}

/** Pure half, so the shape of the result is testable without a database. */
export function buildStudentDetail({ schedule, questions, answers, now = new Date() }) {
  const byQuestion = new Map(questions.map((q) => [q.id, q]));

  // answersByDay[day][questionId] = value — the shape the scoring helpers want.
  const answersByDay = {};
  for (const a of answers) {
    answersByDay[a.entry_date] ??= {};
    answersByDay[a.entry_date][a.question_id] = a.value;
  }

  // ---- per question -------------------------------------------------------
  const perQuestion = [];
  for (const q of questions) {
    const rows = answers.filter((a) => a.question_id === q.id);
    if (rows.length === 0) continue;

    const perOccurrence = maxPoints(q);
    const earned = rows.reduce((sum, a) => sum + Number(a.points ?? 0), 0);
    const timesCompleted = rows.filter((a) => Number(a.points ?? 0) > 0).length;

    // Measured against what those same days could have produced, not against
    // the student's best item. A five-point deed done once is 100%, which is
    // the whole point of showing a bar at all.
    const possible = perOccurrence * rows.length;
    const pct = possible > 0 ? Math.round((earned / possible) * 100) : 0;

    perQuestion.push({
      id: q.id,
      title: q.title,
      section: q.section || 'عام',
      type: q.type,
      earned,
      possible,
      pct: Math.min(100, pct),
      timesCompleted,
      timesAnswered: rows.length,
      perOccurrence,
      // "why 25": five prayers out of five, rather than a bare number.
      prayers: q.type === 'per_prayer' ? summarisePrayers(q, rows) : null,
    });
  }
  perQuestion.sort((a, b) => b.earned - a.earned);

  // ---- per day ------------------------------------------------------------
  const threshold = schedule.streak_threshold_pct ?? 100;
  const lastDay = clampDay(todayInRiyadh(now), schedule);
  const days = [];

  for (let day = lastDay; day >= schedule.start_date; day = addDays(day, -1)) {
    const active = activeQuestionsOn(questions, day);
    if (active.length === 0) continue;

    const dayAnswers = answersByDay[day];
    const pct = dayAnswers ? completionPct(active, dayAnswers) : 0;
    const earned = active.reduce((sum, q) => sum + scoreAnswer(q, dayAnswers?.[q.id]), 0);
    const possible = active.reduce((sum, q) => sum + maxPoints(q), 0);

    const missing = active.filter((q) => maxPoints(q) > 0 && !(scoreAnswer(q, dayAnswers?.[q.id]) > 0));

    days.push({
      day,
      earned,
      possible,
      pct,
      met: pct + 1e-9 >= threshold,
      untouched: !dayAnswers,
      missing: missing.map((q) => ({ id: q.id, title: q.title })),
    });

    if (days.length >= 120) break; // a season's worth is plenty to scroll
  }

  return {
    perQuestion,
    days,
    threshold,
    streak: currentStreak({ questions, answersByDay, schedule, now }),
    missedCount: days.filter((d) => !d.met).length,
  };
}

function clampDay(day, schedule) {
  if (schedule.end_date && day > schedule.end_date) return schedule.end_date;
  return day;
}

/**
 * How many prayer boxes were ticked, and which ones lag behind.
 * `config.prayers` is the set the question actually covers, which may be fewer
 * than five.
 */
function summarisePrayers(question, rows) {
  const covered = Array.isArray(question.config?.prayers)
    ? question.config.prayers
    : [...PRAYERS];

  const counts = Object.fromEntries(covered.map((p) => [p, 0]));
  for (const row of rows) {
    for (const p of covered) {
      if (row.value?.[p] === true) counts[p] += 1;
    }
  }

  const ticked = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    covered,
    counts,
    ticked,
    possible: covered.length * rows.length,
    perPrayerPoints: Number(question.config?.points_per_prayer ?? 0),
  };
}
