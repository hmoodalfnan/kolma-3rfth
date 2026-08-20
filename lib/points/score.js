import { parseConfig } from '@/lib/questions/config-schema';

function cfg(question) {
  const parsed = parseConfig(question.type, question.config);
  return parsed.ok ? parsed.data : null;
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function scoreAnswer(question, value) {
  if (value === null || value === undefined) return 0;
  const config = cfg(question);
  if (!config) return 0;

  switch (question.type) {
    case 'bool':
      return value === true ? Number(question.points) || 0 : 0;

    case 'per_prayer':
      return config.prayers.reduce(
        (sum, p) => (value?.[p] === true ? sum + config.points_per_prayer : sum),
        0,
      );

    case 'single_choice': {
      const opt = config.options.find((o) => o.id === value);
      return opt ? opt.points : 0;
    }

    case 'multi_choice': {
      if (!Array.isArray(value)) return 0;
      const byId = new Map(config.options.map((o) => [o.id, o.points]));
      return [...new Set(value)].reduce((sum, id) => sum + (byId.get(id) ?? 0), 0);
    }

    case 'counter': {
      // Points accrue for every unit up to the hard `max` — passing the `target`
      // (the question's 100%) keeps earning, as bonus above that question's 100%.
      if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
      return clamp(Math.trunc(value), 0, config.max) * config.points_per_unit;
    }

    case 'rating': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
      return clamp(Math.trunc(value), 0, config.max) * config.points_per_star;
    }

    case 'text':
      return 0;

    default:
      return 0;
  }
}

export function maxPoints(question) {
  const config = cfg(question);
  if (!config) return 0;

  switch (question.type) {
    case 'bool':
      return Math.max(0, Number(question.points) || 0);
    case 'per_prayer':
      return Math.max(0, config.prayers.length * config.points_per_prayer);
    case 'single_choice':
      return Math.max(0, ...config.options.map((o) => o.points));
    case 'multi_choice':
      return config.options.reduce((sum, o) => sum + Math.max(0, o.points), 0);
    case 'counter':
      // The `target` count is this question's 100% (falls back to `max` when
      // unset, so existing counters keep their old full-points threshold).
      return Math.max(0, (config.target ?? config.max) * config.points_per_unit);
    case 'rating':
      return Math.max(0, config.max * config.points_per_star);
    case 'text':
    default:
      return 0;
  }
}

export function completionPct(questions, answersByQuestionId) {
  let earned = 0;
  let possible = 0;

  for (const q of questions) {
    const max = maxPoints(q);
    if (max <= 0) continue;
    possible += max;
    // Completion caps each question at its own 100%: a counter taken past its
    // target still earns bonus points, but cannot fill in for other questions.
    earned += Math.min(scoreAnswer(q, answersByQuestionId?.[q.id]), max);
  }

  if (possible <= 0) return 0;
  const pct = (earned / possible) * 100;
  return Math.round(clamp(pct, 0, 100) * 10) / 10;
}

/**
 * `earned` is the raw points tally (uncapped — bonus above a counter's target
 * shows here), `cappedEarned` caps each question at its own 100% for the progress
 * ring, and `possible` is the day's full 100%.
 */
export function dayPoints(questions, answersByQuestionId) {
  let earned = 0;
  let cappedEarned = 0;
  let possible = 0;

  for (const q of questions) {
    const max = maxPoints(q);
    const got = scoreAnswer(q, answersByQuestionId?.[q.id]);
    possible += max;
    earned += got;
    cappedEarned += Math.min(got, max);
  }

  return { earned, cappedEarned, possible };
}
