import { it, expect, beforeAll, afterAll } from 'vitest';
import { dbTest, serviceClient, anonClient, uniq, uniqSlug } from './client';

const DOMAIN = 'tracker.internal';
const PIN = '482913';
const MGR_PASSWORD = 'Deeds tracker!2026';

dbTest('row level security', () => {
  const db = serviceClient();
  const ctx = {};
  const cleanup = { users: [], schedules: [] };

  beforeAll(async () => {
    for (const key of ['a', 'b']) {
      const s = await db
        .from('schedules')
        .insert({ name: uniq('رحلة'), slug: uniqSlug(), start_date: '2026-08-01' })
        .select()
        .single();
      ctx[`schedule_${key}`] = s.data.id;
      cleanup.schedules.push(s.data.id);

      const email = `stu_${uniq('x')}@${DOMAIN}`;
      const au = await db.auth.admin.createUser({ email, password: PIN, email_confirm: true });
      cleanup.users.push(au.data.user.id);

      const st = await db
        .from('students')
        .insert({ schedule_id: s.data.id, full_name: `طالب ${key}`, auth_uid: au.data.user.id })
        .select()
        .single();

      ctx[`student_${key}`] = st.data.id;
      ctx[`student_${key}_email`] = email;

      const q = await db
        .from('questions')
        .insert({
          schedule_id: s.data.id,
          title: 'الوتر',
          type: 'bool',
          config: {},
          points: 5,
          sort_order: 1,
        })
        .select()
        .single();
      ctx[`question_${key}`] = q.data.id;
    }

    const mgrUsername = uniq('mgr').toLowerCase().replace(/[^a-z0-9_]/g, '');
    const mgrEmail = `${mgrUsername}@${DOMAIN}`;
    const mgr = await db.auth.admin.createUser({
      email: mgrEmail,
      password: MGR_PASSWORD,
      email_confirm: true,
    });
    cleanup.users.push(mgr.data.user.id);

    await db.from('app_users').insert({
      id: mgr.data.user.id,
      username: mgrUsername,
      display_name: 'مشرف',
      role: 'manager',
    });
    await db.from('schedule_staff').insert({
      schedule_id: ctx.schedule_a,
      user_id: mgr.data.user.id,
    });

    ctx.manager_email = mgrEmail;
    ctx.manager_username = mgrUsername;
  });

  afterAll(async () => {
    await db.from('schedules').delete().in('id', cleanup.schedules);
    for (const id of cleanup.users) await db.auth.admin.deleteUser(id);
  });

  async function signedIn(email, password) {
    const c = anonClient();
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return c;
  }

  it('denies an unauthenticated client every table', async () => {
    const c = anonClient();
    for (const table of ['schedules', 'students', 'questions', 'answers', 'point_events', 'app_users']) {
      const { data } = await c.from(table).select('*').limit(1);
      expect(data ?? []).toEqual([]);
    }
  });

  it('lets a student read only their own answers', async () => {
    await db.from('answers').insert([
      { student_id: ctx.student_a, question_id: ctx.question_a, entry_date: '2026-08-01', value: true },
      { student_id: ctx.student_b, question_id: ctx.question_b, entry_date: '2026-08-01', value: true },
    ]);
    const c = await signedIn(ctx.student_a_email, PIN);
    const { data } = await c.from('answers').select('student_id');
    expect(data.map((r) => r.student_id)).toEqual([ctx.student_a]);
  });

  it('stops a student writing an answer for someone else', async () => {
    const c = await signedIn(ctx.student_a_email, PIN);
    const { error } = await c.from('answers').insert({
      student_id: ctx.student_b,
      question_id: ctx.question_b,
      entry_date: '2026-08-02',
      value: true,
    });
    expect(error).not.toBeNull();
  });

  it('stops a student editing questions', async () => {
    const c = await signedIn(ctx.student_a_email, PIN);
    const { data } = await c.from('questions').update({ points: 999 }).eq('id', ctx.question_a).select();
    expect(data ?? []).toEqual([]);
  });

  it('confines a manager to the schedules they staff', async () => {
    const c = await signedIn(ctx.manager_email, MGR_PASSWORD);
    const { data } = await c.from('schedules').select('id');
    expect(data.map((r) => r.id)).toEqual([ctx.schedule_a]);

    const { data: students } = await c.from('students').select('id');
    expect(students.map((r) => r.id)).toEqual([ctx.student_a]);
  });

  it('stops a manager writing into a schedule they do not staff', async () => {
    const c = await signedIn(ctx.manager_email, MGR_PASSWORD);
    const { data } = await c.from('questions').update({ title: 'اختراق' }).eq('id', ctx.question_b).select();
    expect(data ?? []).toEqual([]);
  });

  it('stops a manager promoting themselves to super admin', async () => {
    const c = await signedIn(ctx.manager_email, MGR_PASSWORD);
    const { data } = await c
      .from('app_users')
      .update({ role: 'super_admin' })
      .eq('username', ctx.manager_username)
      .select();
    expect(data ?? []).toEqual([]);
  });

  it('scopes the leaderboard views by RLS rather than bypassing it', async () => {
    const c = await signedIn(ctx.student_b_email, PIN);
    const { data } = await c.from('v_student_totals').select('schedule_id');
    expect([...new Set((data ?? []).map((r) => r.schedule_id))]).toEqual([ctx.schedule_b]);
  });
});
