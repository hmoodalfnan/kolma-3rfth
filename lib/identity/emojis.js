/**
 * The emoji gallery a user picks from at registration. This is their public
 * identity on the leaderboard (names are never shown there), so the set is broad,
 * friendly, and visually distinct. Duplicates across users are allowed.
 */
export const EMOJI_CHOICES = [
  '🦁', '🐯', '🐺', '🦊', '🐻', '🐼', '🐨', '🐸',
  '🦉', '🦅', '🦇', '🐝', '🦋', '🐬', '🐳', '🦈',
  '🐢', '🦖', '🦄', '🐎', '🐘', '🦒', '🐫', '🦌',
  '🌟', '⚡', '🔥', '🌙', '☀️', '🌈', '❄️', '🌊',
  '🌵', '🌲', '🌸', '🍀', '🍁', '🌹', '🌻', '🍎',
  '⚽', '🏀', '🏈', '🎾', '🏐', '🎯', '🏆', '🥇',
  '🚀', '✈️', '⛵', '🏹', '🗿', '💎', '🎿', '🛡️',
  '🎨', '🎼', '🎧', '📚', '🕌', '⭐', '🌴', '🦂',
];

export function isValidEmoji(value) {
  return EMOJI_CHOICES.includes(value);
}
