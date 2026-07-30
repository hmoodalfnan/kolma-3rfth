'use client';

import { getBrowserClient } from '@/lib/supabase/browser';
import { generateSlug } from '@/lib/auth/password';
import { friendlyError } from '@/lib/errors/friendly';

export const client = () => getBrowserClient();

async function authHeaders() {
  const { data } = await getBrowserClient().auth.getSession();
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${data?.session?.access_token ?? ''}`,
  };
}

/** POST to one of our route handlers with the caller's bearer token attached. */
export async function post(path, body, method = 'POST') {
  const res = await fetch(path, {
    method,
    headers: await authHeaders(),
    body: method === 'DELETE' ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendlyError(json.error || 'تعذّر تنفيذ العملية'));
  return json;
}

const unwrap = ({ data, error }) => {
  if (error) throw new Error(friendlyError(error));
  return data ?? [];
};

// ---- schedules ----

export const listSchedules = () =>
  client()
    .from('schedules')
    .select('*')
    .order('start_date', { ascending: false })
    .then(unwrap);

/**
 * Goes through an RPC rather than a plain insert.
 *
 * A manager has no schedule_staff row for a schedule that does not exist yet, so
 * the SELECT policy denied them the row their own INSERT ... RETURNING produced.
 * create_schedule inserts the trip, makes the caller staff of it, and seeds the
 * default criteria in one transaction. See migration 0012.
 */
export async function createSchedule(input) {
  const { data, error } = await client()
    .rpc('create_schedule', {
      p_name: input.name,
      p_slug: generateSlug(),
      p_start_date: input.start_date,
      p_end_date: input.end_date ?? null,
      p_streak_threshold_pct: input.streak_threshold_pct ?? 100,
      p_backfill_days: input.backfill_days ?? 3,
      p_students_see_leaderboard: input.students_see_leaderboard ?? true,
    })
    .single();
  if (error) throw new Error(friendlyError(error));

  return data;
}

export const updateSchedule = (id, patch) =>
  client().from('schedules').update(patch).eq('id', id).select().single().then(unwrap);

export const rotateScheduleSlug = (id) =>
  client()
    .from('schedules')
    .update({ slug: generateSlug() })
    .eq('id', id)
    .select()
    .single()
    .then(unwrap);

/**
 * Super admin only, enforced twice over: the schedules_delete policy is
 * `using (is_super_admin())`, and the route handler checks the role again. It
 * goes through a route because the students' logins live in auth.users, which
 * cascades cannot reach and no browser session may delete.
 */
export const deleteSchedule = (id, confirmName) =>
  post('/api/schedules/delete', { scheduleId: id, confirmName });

// ---- groups ----

export const listGroups = (scheduleId) =>
  client()
    .from('groups')
    .select('*')
    .eq('schedule_id', scheduleId)
    .order('sort_order')
    .then(unwrap);

export const createGroup = (scheduleId, name, sortOrder) =>
  client()
    .from('groups')
    .insert({ schedule_id: scheduleId, name, sort_order: sortOrder, join_slug: generateSlug() })
    .select()
    .single()
    .then(unwrap);

export const updateGroup = (id, patch) =>
  client().from('groups').update(patch).eq('id', id).select().single().then(unwrap);

export const rotateGroupSlug = (id) =>
  client()
    .from('groups')
    .update({ join_slug: generateSlug() })
    .eq('id', id)
    .select()
    .single()
    .then(unwrap);

export const deleteGroup = (id) => client().from('groups').delete().eq('id', id).then(unwrap);

// ---- students ----

export const listStudents = (scheduleId) =>
  client()
    .from('students')
    .select('*')
    .eq('schedule_id', scheduleId)
    .order('sort_order')
    .order('full_name')
    .then(unwrap);

export const updateStudent = (id, patch) =>
  client().from('students').update(patch).eq('id', id).select().single().then(unwrap);

export const createStudents = (payload) => post('/api/students/create', payload);
export const resetStudentPin = (studentId) => post('/api/students/reset-pin', { studentId });

/**
 * Goes through a route handler rather than a direct delete: the student's row
 * is reachable with the caller's own token, but the login behind it lives in
 * auth.users and only the service key can remove that.
 */
export const deleteStudent = (studentId) => post('/api/students/delete', { studentId });

// ---- questions ----

export const listQuestions = (scheduleId) =>
  client()
    .from('questions')
    .select('*')
    .eq('schedule_id', scheduleId)
    .is('archived_at', null)
    .order('sort_order')
    .then(unwrap);

export const listLibrary = () =>
  client().from('question_library').select('*').order('sort_order').then(unwrap);

export const createQuestion = (row) =>
  client().from('questions').insert(row).select().single().then(unwrap);

export const updateQuestion = (id, patch) =>
  client().from('questions').update(patch).eq('id', id).select().single().then(unwrap);

export const archiveQuestion = (id) =>
  client()
    .from('questions')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .then(unwrap);

export const deleteQuestion = (id) => client().from('questions').delete().eq('id', id).then(unwrap);

export async function reorderQuestions(orderedIds) {
  await Promise.all(
    orderedIds.map((id, index) =>
      client().from('questions').update({ sort_order: index }).eq('id', id),
    ),
  );
}

export async function copyFromLibrary(scheduleId, libraryRows, startOrder = 0) {
  const rows = libraryRows.map((q, i) => ({
    schedule_id: scheduleId,
    library_id: q.id,
    section: q.section,
    title: q.title,
    help_text: q.help_text,
    type: q.type,
    config: q.config,
    points: q.points,
    sort_order: startOrder + i,
  }));
  return client().from('questions').insert(rows).select().then(unwrap);
}

// ---- criteria & grants ----

export const listCriteria = (scheduleId) =>
  client()
    .from('criteria')
    .select('*')
    .eq('schedule_id', scheduleId)
    .is('archived_at', null)
    .order('sort_order')
    .then(unwrap);

export const createCriterion = (scheduleId, name, allowNegative, sortOrder) =>
  client()
    .from('criteria')
    .insert({
      schedule_id: scheduleId,
      name,
      allow_negative: allowNegative,
      sort_order: sortOrder,
    })
    .select()
    .single()
    .then(unwrap);

export const updateCriterion = (id, patch) =>
  client().from('criteria').update(patch).eq('id', id).select().single().then(unwrap);

export const archiveCriterion = (id) =>
  client()
    .from('criteria')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .then(unwrap);

/**
 * point_events.criterion_id is ON DELETE RESTRICT, so the grants have to go
 * first. That is deliberate on the schema's side — points must never be
 * orphaned by accident — which makes clearing them an explicit act here rather
 * than a silent cascade nobody asked for.
 */
export const deleteCriterion = async (id) => {
  await client().from('point_events').delete().eq('criterion_id', id).then(unwrap);
  return client().from('criteria').delete().eq('id', id).then(unwrap);
};

/** How many grants are hanging off a criterion — the difference between hiding it and deleting it. */
export const countCriterionGrants = async (id) => {
  const { count, error } = await client()
    .from('point_events')
    .select('id', { count: 'exact', head: true })
    .eq('criterion_id', id);
  if (error) throw new Error(friendlyError(error));
  return count ?? 0;
};

export const listGrants = (scheduleId, limit = 100) =>
  client()
    .from('point_events')
    .select('*, criteria(name), students(full_name), groups(name)')
    .eq('schedule_id', scheduleId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .then(unwrap);

export const grantPoints = (payload) => post('/api/grants', payload);
export const undoGrant = (id) => post(`/api/grants?id=${encodeURIComponent(id)}`, null, 'DELETE');

// ---- answers (for export) ----

export const listAnswersForSchedule = async (studentIds) => {
  if (studentIds.length === 0) return [];
  const out = [];
  const CHUNK = 40;
  for (let i = 0; i < studentIds.length; i += CHUNK) {
     
    const part = await client()
      .from('answers')
      .select('student_id, question_id, entry_date, value, points')
      .in('student_id', studentIds.slice(i, i + CHUNK))
      .then(unwrap);
    out.push(...part);
  }
  return out;
};

// ---- schedule staff ----

/** Staff accounts that could be put on a trip. Managers may read these since 0014. */
export const listStaffAccounts = () =>
  client()
    .from('app_users')
    .select('id, username, display_name, role, is_active')
    .eq('is_active', true)
    .order('display_name')
    .then(unwrap);

/** Who currently runs a given trip, oldest assignment first. */
export const listScheduleStaff = (scheduleId) =>
  client()
    .from('schedule_staff')
    .select('user_id, created_at')
    .eq('schedule_id', scheduleId)
    .order('created_at')
    .then(unwrap);

/**
 * Both go through RPCs rather than a direct write: the rule that a trip's owner
 * may only be removed by a super admin depends on the row and the caller, which
 * is far clearer as a function than as a policy. See migration 0014.
 */
export async function assignScheduleStaff(scheduleId, userId) {
  const { error } = await client().rpc('assign_schedule_staff', {
    p_schedule: scheduleId,
    p_user: userId,
  });
  if (error) throw new Error(friendlyError(error));
}

export async function unassignScheduleStaff(scheduleId, userId) {
  const { error } = await client().rpc('unassign_schedule_staff', {
    p_schedule: scheduleId,
    p_user: userId,
  });
  if (error) throw new Error(friendlyError(error));
}

/**
 * Stepping off a trip yourself, which is a different question from removing
 * somebody else: if you are the owner it has to settle who is accountable
 * afterwards. Returns { outcome: 'left' | 'transferred' | 'archived', owner_name }.
 * See migration 0018.
 */
export async function leaveSchedule(scheduleId) {
  const { data, error } = await client().rpc('leave_schedule', { p_schedule: scheduleId });
  if (error) throw new Error(friendlyError(error));
  return data ?? { outcome: 'left' };
}

// ---- suggested بنود (super admin review queue) ----

/** Originals a manager created, still awaiting a decision. See migration 0017. */
export const listSuggestedQuestions = () =>
  client()
    .from('questions')
    .select('id, title, section, type, config, points, schedule_id, created_at, schedules(name)')
    .eq('review_state', 'pending')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .then(unwrap);

export async function acceptSuggestedQuestion(questionId) {
  const { error } = await client().rpc('accept_suggested_question', { p_question: questionId });
  if (error) throw new Error(friendlyError(error));
}

export async function dismissSuggestedQuestion(questionId) {
  const { error } = await client().rpc('dismiss_suggested_question', { p_question: questionId });
  if (error) throw new Error(friendlyError(error));
}
