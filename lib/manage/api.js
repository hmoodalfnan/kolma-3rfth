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

export const deleteSchedule = (id) => client().from('schedules').delete().eq('id', id).then(unwrap);

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

export const archiveCriterion = (id) =>
  client()
    .from('criteria')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .then(unwrap);

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
