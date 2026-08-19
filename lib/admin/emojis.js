'use client';

import { getBrowserClient } from '@/lib/supabase/browser';

// Admin CRUD for the emoji gallery (emoji_choices). RLS (is_admin) governs
// writes; reads are open so the registration picker works for anon users too.

export async function listEmojiChoices() {
  const { data, error } = await getBrowserClient()
    .from('emoji_choices')
    .select('id, emoji, sort_order')
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

/** Add one emoji at the end of the gallery. Unique constraint rejects dupes. */
export async function addEmojiChoice(emoji) {
  const client = getBrowserClient();
  const { data: last } = await client
    .from('emoji_choices')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (last?.sort_order ?? 0) + 10;
  const { error } = await client.from('emoji_choices').insert({ emoji: emoji.trim(), sort_order });
  if (error) throw error;
}

export async function deleteEmojiChoice(id) {
  const { error } = await getBrowserClient().from('emoji_choices').delete().eq('id', id);
  if (error) throw error;
}
