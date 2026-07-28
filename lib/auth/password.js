const COMMON = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyui',
  'admin123',
  'admin1234',
  'iloveyou',
  'letmein1',
  'welcome1',
  'tracker',
  'tracker1',
  'abc12345',
  '11111111',
  'passw0rd',
]);

export function validateStaffPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) {
    return { ok: false, error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' };
  }
  if (pw.length > 128) return { ok: false, error: 'كلمة المرور طويلة جداً' };
  if (COMMON.has(pw.toLowerCase())) {
    return { ok: false, error: 'كلمة المرور شائعة جداً، اختر كلمة أقوى' };
  }

  const classes =
    Number(/[a-z]/.test(pw)) +
    Number(/[A-Z]/.test(pw)) +
    Number(/[0-9]/.test(pw)) +
    Number(/[^a-zA-Z0-9]/.test(pw));

  if (classes < 2) {
    return {
      ok: false,
      error: 'يجب أن تحتوي كلمة المرور على نوعين مختلفين على الأقل (أحرف، أرقام، رموز)',
    };
  }
  return { ok: true };
}

function isRun(pin) {
  let up = true;
  let down = true;
  for (let i = 1; i < pin.length; i += 1) {
    const diff = Number(pin[i]) - Number(pin[i - 1]);
    if (diff !== 1) up = false;
    if (diff !== -1) down = false;
  }
  return up || down;
}

export function validateStudentPin(pin) {
  if (typeof pin !== 'string' || !/^[0-9]{6}$/.test(pin)) {
    return { ok: false, error: 'الرمز يجب أن يكون 6 أرقام' };
  }
  if (new Set(pin).size === 1) return { ok: false, error: 'لا يمكن أن تكون كل الأرقام متطابقة' };
  if (isRun(pin)) return { ok: false, error: 'لا يمكن أن تكون الأرقام متسلسلة' };
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
