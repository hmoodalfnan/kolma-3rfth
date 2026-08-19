'use client';

import { getBrowserClient } from '@/lib/supabase/browser';

// Read/update the single program row. Admins pass is_staff_of() so RLS allows the
// update; the answer-entry trigger enforces backfill_days server-side.
const PROGRAM_SLUG = 'kollamaarafto';

export async function getProgram() {
  const { data, error } = await getBrowserClient()
    .from('schedules')
    .select('id, name, backfill_days, students_see_leaderboard, start_date, end_date, status')
    .eq('slug', PROGRAM_SLUG)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProgram(id, patch) {
  const { error } = await getBrowserClient().from('schedules').update(patch).eq('id', id);
  if (error) throw error;
}
