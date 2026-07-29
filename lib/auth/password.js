import { toWesternDigits } from './digits';

/**
 * Length is the only rule.
 *
 * The character-class requirement and the common-password blocklist were
 * dropped deliberately: this is a closed system where accounts are created by
 * staff and start on a generated 14-character password, and the rules were
 * mostly stopping people from choosing something they could actually remember —
 * which pushes them towards writing it down. Length still rules out the
 * genuinely trivial.
 */
export function validateStaffPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) {
    return { ok: false, error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' };
  }
  if (pw.length > 128) return { ok: false, error: 'كلمة المرور طويلة جداً' };
  return { ok: true };
}

/**
 * Six digits, and nothing else to trip over. The "no repeats" and "no runs"
 * rules rejected 111111 and 123456 but also every PIN a student found easy to
 * remember, and the temporary PIN is generated anyway.
 *
 * Arabic-Indic digits are normalised first, so a PIN typed on an Arabic keyboard
 * is the same secret as the Western form.
 */
export function validateStudentPin(pin) {
  const normalized = toWesternDigits(pin);
  if (typeof normalized !== 'string' || !/^[0-9]{6}$/.test(normalized)) {
    return { ok: false, error: 'الرمز يجب أن يكون 6 أرقام' };
  }
  return { ok: true };
}

function randomInts(count, bound) {
  const bytes = new Uint32Array(count);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b % bound);
}

export function generatePin() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const pin = randomInts(6, 10).join('');
    if (validateStudentPin(pin).ok) return pin;
  }
  return '419573';
}

// Crockford base32: no i, l, o, u — avoids characters that are misread aloud.
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

export function generateSlug(length = 16) {
  return randomInts(length, ALPHABET.length)
    .map((n) => ALPHABET[n])
    .join('');
}

// A temporary password gets read off a screen and typed by hand, often from a
// phone, so every character that can be confused for another is left out:
// no 0/O, 1/l/I, 5/S, or 2/Z. Symbols are excluded too — they move the phone
// keyboard to a second page and invite transcription errors. The length is what
// buys the entropy back: 14 characters over this 49-symbol alphabet is ~78 bits,
// far past anything a symbol would have added.
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRTUVWXY';
const DIGITS = '346789';
const TEMP_ALPHABET = LOWER + UPPER + DIGITS;

function pick(source, count) {
  return randomInts(count, source.length).map((n) => source[n]);
}

export function generateStaffPassword(length = 14) {
  // Seeded with one character from each class so the result always satisfies
  // validateStaffPassword rather than relying on chance and a retry loop.
  const chars = [...pick(LOWER, 1), ...pick(UPPER, 1), ...pick(DIGITS, 1)];
  chars.push(...pick(TEMP_ALPHABET, Math.max(0, length - chars.length)));

  // Fisher-Yates, so the seeded characters do not always land in the first three
  // positions and leak the alphabet's structure.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const [j] = randomInts(1, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
