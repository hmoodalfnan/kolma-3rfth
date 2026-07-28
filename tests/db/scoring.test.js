import { it, expect } from 'vitest';
import { dbTest, serviceClient, uniq, uniqSlug } from './client';
import { scoreAnswer, maxPoints } from '@/lib/points/score';

const CASES = [
  { type: 'bool', config: {}, points: 5, value: true },
  { type: 'bool', config: {}, points: 5, value: false },
  {
    type: 'per_prayer',
    config: { prayers: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'], points_per_prayer: 2 },
    points: 0,
    value: { fajr: true, dhuhr: true, asr: false },
  },
  {
    type: 'single_choice',
    config: {
      options: [
        { id: 'walk', label: 'مشي', points: 5 },
        { id: 'none', label: 'لم أذهب', points: -2 },
      ],
    },
    points: 0,
    value: 'none',
  },
  {
    type: 'multi_choice',
    config: {
      options: [
        { id: 'a', label: 'أ', points: 3 },
        { id: 'b', label: 'ب', points: 4 },
        { id: 'c', label: 'ج', points: -1 },
      ],
    },
    points: 0,
    value: ['a', 'c'],
  },
  {
    type: 'counter',
    config: { points_per_unit: 2, max: 10, unit_label: 'صفحة' },
    points: 0,
    value: 99,
  },
  { type: 'rating', config: { max: 5, points_per_star: 3 }, points: 0, value: 4 },
  { type: 'text', config: { max_length: 500 }, points: 0, value: 'ملاحظة' },
];

dbTest('SQL scorer matches the JavaScript scorer', () => {
  const db = serviceClient();

  it.each(CASES)('scores $type identically in both engines', async (c) => {
    const { data, error } = await db.rpc('app_score_answer', {
      q_type: c.type,
      q_config: c.config,
      q_points: c.points,
      val: c.value,
    });
    expect(error).toBeNull();
    expect(Number(data)).toBe(
      scoreAnswer({ type: c.type, config: c.config, points: c.points }, c.value),
    );
  });

  it.each(CASES)('computes the maximum for $type identically', async (c) => {
    const { data, error } = await db.rpc('app_max_points', {
      q_type: c.type,
      q_config: c.config,
      q_points: c.points,
    });
    expect(error).toBeNull();
    expect(Number(data)).toBe(maxPoints({ type: c.type, config: c.config, points: c.points }));
  });

  it('ignores a points value supplied by the client', async () => {
    const schedule = await db
      .from('schedules')
      .insert({ name: uniq('نقاط'), slug: uniqSlug(), start_date: '2026-08-01' })
      .select()
      .single();
    const student = await db
      .from('students')
      .insert({ schedule_id: schedule.data.id, full_name: 'طالب' })
      .select()
      .single();
    const question = await db
      .from('questions')
      .insert({
        schedule_id: schedule.data.id,
        title: 'الوتر',
        type: 'bool',
        config: {},
        points: 5,
        sort_order: 1,
      })
      .select()
      .single();

    const { data } = await db
      .from('answers')
      .insert({
        student_id: student.data.id,
        question_id: question.data.id,
        entry_date: '2026-08-01',
        value: true,
        points: 9999,
      })
      .select()
      .single();

    expect(Number(data.points)).toBe(5);
    await db.from('schedules').delete().eq('id', schedule.data.id);
  });
});
