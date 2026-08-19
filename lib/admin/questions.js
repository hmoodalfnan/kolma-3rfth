'use client';

import { getBrowserClient } from '@/lib/supabase/browser';

// Admin CRUD for the rich daily بنود (questions), scoped to the single program.
// RLS (is_staff_of → true for super_admins) governs writes; the answers table's
// own trigger scores student answers, so nothing here touches points directly.

const PROGRAM_SLUG = 'kollamaarafto';
const COLUMNS =
  'id, section, title, help_text, type, config, points, active_weekdays, active_from, active_to, is_required, sort_order, archived_at';

let programIdPromise = null;

// The questions table has no schedule default, so inserts must supply
// schedule_id. Resolve and cache the one program's id.
function programId() {
  if (!programIdPromise) {
    programIdPromise = getBrowserClient()
      .from('schedules')
      .select('id')
      .eq('slug', PROGRAM_SLUG)
      .single()
      .then(({ data, error }) => {
        if (error) {
          programIdPromise = null; // let a later call retry
          throw error;
        }
        return data.id;
      });
  }
  return programIdPromise;
}

export async function listQuestions() {
  const sid = await programId();
  const { data, error } = await getBrowserClient()
    .from('questions')
    .select(COLUMNS)
    .eq('schedule_id', sid)
    .is('archived_at', null)
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

export async function createQuestion(draft) {
  const sid = await programId();
  const { data, error } = await getBrowserClient()
    .from('questions')
    .insert({
      schedule_id: sid,
      section: draft.section ?? '',
      title: draft.title,
      help_text: draft.help_text ?? '',
      type: draft.type,
      config: draft.config ?? {},
      points: draft.points ?? 0,
      active_weekdays: draft.active_weekdays ?? null,
      active_from: draft.active_from ?? null,
      active_to: draft.active_to ?? null,
      is_required: draft.is_required ?? false,
      sort_order: draft.sort_order ?? 0,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateQuestion(id, patch) {
  const { data, error } = await getBrowserClient()
    .from('questions')
    .update(patch)
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

// Hiding keeps every answer (and its points); the بند just drops off future days.
export async function archiveQuestion(id) {
  const { error } = await getBrowserClient()
    .from('questions')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Deleting takes the answers and their points with it (ON DELETE CASCADE).
export async function deleteQuestion(id) {
  const { error } = await getBrowserClient().from('questions').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderQuestions(ids) {
  const client = getBrowserClient();
  await Promise.all(ids.map((id, i) => client.from('questions').update({ sort_order: i }).eq('id', id)));
}
