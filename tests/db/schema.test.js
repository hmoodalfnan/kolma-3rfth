import { it, expect, beforeAll, afterAll } from 'vitest';
import { dbTest, serviceClient, uniq, uniqSlug } from './client';

dbTest('core schema', () => {
  const db = serviceClient();
  let scheduleId;
  let groupId;

  beforeAll(async () => {
    const { data, error } = await db
      .from('schedules')
      .insert({ name: uniq('رحلة'), slug: uniqSlug(), start_date: '2026-08-01', end_date: null })
      .select()
      .single();
    if (error) throw error;
    scheduleId = data.id;

    const g = await db
      .from('groups')
      .insert({ schedule_id: scheduleId, name: 'غرفة 101', sort_order: 1, join_slug: uniqSlug() })
      .select()
      .single();
    if (g.error) throw g.error;
    groupId = g.data.id;
  });

  afterAll(async () => {
    if (scheduleId) await db.from('schedules').delete().eq('id', scheduleId);
  });

  it('defaults a new schedule to active with sane settings', async () => {
    const { data } = await db.from('schedules').select().eq('id', scheduleId).single();
    expect(data.status).toBe('active');
    expect(data.timezone).toBe('Asia/Riyadh');
    expect(data.streak_threshold_pct).toBe(100);
    expect(data.backfill_days).toBe(3);
    expect(data.students_see_leaderboard).toBe(true);
    expect(data.end_date).toBeNull();
  });

  it('rejects an end date before the start date', async () => {
    const { error } = await db.from('schedules').update({ end_date: '2026-07-01' }).eq('id', scheduleId);
    expect(error).not.toBeNull();
  });

  it('rejects a backfill window outside 0..365', async () => {
    const { error } = await db.from('schedules').update({ backfill_days: -1 }).eq('id', scheduleId);
    expect(error).not.toBeNull();
  });

  it('enforces one answer per student, question and date', async () => {
    const s = await db
      .from('students')
      .insert({ schedule_id: scheduleId, group_id: groupId, full_name: 'طالب اختبار' })
      .select()
      .single();
    const q = await db
      .from('questions')
      .insert({ schedule_id: scheduleId, title: 'الوتر', type: 'bool', config: {}, points: 5, sort_order: 1 })
      .select()
      .single();

    const first = await db.from('answers').insert({
      student_id: s.data.id,
      question_id: q.data.id,
      entry_date: '2026-08-01',
      value: true,
    });
    expect(first.error).toBeNull();

    const duplicate = await db.from('answers').insert({
      student_id: s.data.id,
      question_id: q.data.id,
      entry_date: '2026-08-01',
      value: true,
    });
    expect(duplicate.error?.code).toBe('23505');
  });

  it('cascades deletes from schedule down to students', async () => {
    const temp = await db
      .from('schedules')
      .insert({ name: uniq('مؤقتة'), slug: uniqSlug(), start_date: '2026-08-01' })
      .select()
      .single();
    const s = await db
      .from('students')
      .insert({ schedule_id: temp.data.id, full_name: 'طالب' })
      .select()
      .single();

    await db.from('schedules').delete().eq('id', temp.data.id);

    const { data } = await db.from('students').select().eq('id', s.data.id);
    expect(data).toEqual([]);
  });

  it('rejects a criterion grant that is negative when negatives are disallowed', async () => {
    const c = await db
      .from('criteria')
      .insert({ schedule_id: scheduleId, name: 'المبادرة', allow_negative: false, sort_order: 1 })
      .select()
      .single();
    const s = await db
      .from('students')
      .insert({ schedule_id: scheduleId, full_name: 'طالب ٢' })
      .select()
      .single();

    const { error } = await db.from('point_events').insert({
      schedule_id: scheduleId,
      student_id: s.data.id,
      criterion_id: c.data.id,
      points: -5,
    });
    expect(error).not.toBeNull();
  });

  it('rejects a question config with duplicate option ids', async () => {
    const { error } = await db.from('questions').insert({
      schedule_id: scheduleId,
      title: 'اختيار',
      type: 'single_choice',
      config: { options: [{ id: 'a', label: 'أ', points: 1 }, { id: 'a', label: 'ب', points: 2 }] },
      sort_order: 9,
    });
    expect(error).not.toBeNull();
  });
});
