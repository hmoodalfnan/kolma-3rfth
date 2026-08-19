'use client';

import { getBrowserClient } from '@/lib/supabase/browser';

/**
 * The de-identified leaderboard. Returns rows of { rank, emoji, points, user_id }.
 * user_id is null unless the caller is an admin (enforced in get_leaderboard).
 */
export async function fetchLeaderboard() {
  const { data, error } = await getBrowserClient().rpc('get_leaderboard');
  if (error) throw error;
  return data || [];
}

/** Admin-only: resolve one user's name for the reveal confirmation. */
export async function fetchUserName(userId) {
  const { data, error } = await getBrowserClient().rpc('get_user_name', {
    p_user: userId,
  });
  if (error) throw error;
  return data || null;
}
