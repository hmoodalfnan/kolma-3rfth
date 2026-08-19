'use client';

import { getBrowserClient } from '@/lib/supabase/browser';

// Admin CRUD for the persistent مهام مستمرة (assignments). RLS (is_admin) governs
// access; these are plain PostgREST calls from the browser client.

export async function listAssignments() {
  const { data, error } = await getBrowserClient()
    .from('assignments')
    .select('id, kind, title, body_text, points, is_active, sort_order, archived_at')
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

export async function createAssignment({ kind, title, body_text, points, sort_order }) {
  const { error } = await getBrowserClient()
    .from('assignments')
    .insert({
      kind,
      title,
      body_text: body_text || '',
      points: Number(points) || 0,
      sort_order: sort_order || 0,
    });
  if (error) throw error;
}

export async function updateAssignment(id, patch) {
  const { error } = await getBrowserClient().from('assignments').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteAssignment(id) {
  const { error } = await getBrowserClient().from('assignments').delete().eq('id', id);
  if (error) throw error;
}
