/**
 * The emoji gallery a user picks from at registration — their public identity on
 * the leaderboard (names are never shown there).
 *
 * The live gallery lives in the `emoji_choices` table so admins can add or remove
 * options at /admin/emojis. This array is the seed for that table (migration
 * 0007) and the offline/fallback set shown when the table can't be read. Themed
 * around five families — cars, flowers, hearts, buildings, and sky — no animals.
 * Users who registered before the list changed keep whatever emoji they chose.
 */
export const DEFAULT_EMOJI_CHOICES = [
  // Cars
  '🚗', '🚙', '🏎️', '🚕', '🚌', '🚐', '🚓', '🚑',
  '🚒', '🚚', '🏍️', '🛵', '🚲', '🛺',
  // Flowers
  '🌸', '🌹', '🌻', '🌷', '🌼', '🌺', '💐', '🏵️',
  '🌵', '🌲', '🌴', '🍀', '🌿', '🪷',
  // Hearts
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤',
  '🤍', '💗', '💖', '💝',
  // Buildings
  '🕌', '🏛️', '🏰', '🏯', '🏠', '🏢', '🏬', '🏥',
  '🏙️', '🗼', '🏦', '🏨',
  // Sky
  '🌟', '⭐', '🌙', '☀️', '☁️', '🌤️', '⛅', '❄️',
  '⚡', '💫', '🌠', '🪐',
];

// Back-compat alias for the static fallback set.
export const EMOJI_CHOICES = DEFAULT_EMOJI_CHOICES;

/**
 * A picked identity emoji. Kept format-based (a short string with no plain text
 * or whitespace) rather than an exact enum, so an emoji an admin just added to
 * the gallery validates without a database round-trip. The picker only ever
 * offers real gallery entries, so this is a sanity guard, not the gatekeeper.
 */
export function isValidEmoji(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v.length < 1 || v.length > 16) return false;
  return !/[\sA-Za-z0-9]/.test(v);
}

/**
 * The current gallery, ordered. Reads the admin-managed table (works for anon
 * registrants too) and falls back to the static set on any error or empty table.
 */
export async function fetchEmojiChoices(client) {
  try {
    const { data, error } = await client
      .from('emoji_choices')
      .select('emoji')
      .order('sort_order');
    if (error || !data?.length) return DEFAULT_EMOJI_CHOICES;
    return data.map((r) => r.emoji);
  } catch {
    return DEFAULT_EMOJI_CHOICES;
  }
}
