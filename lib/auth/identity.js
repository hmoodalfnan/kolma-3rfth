export const AUTH_DOMAIN = process.env.AUTH_EMAIL_DOMAIN || 'tracker.internal';

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

export function normalizeUsername(raw) {
  const name = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!USERNAME_RE.test(name)) {
    throw new Error(
      'اسم المستخدم يجب أن يكون بين 3 و 32 حرفاً إنجليزياً أو رقماً أو شرطة سفلية',
    );
  }
  return name;
}

export function isValidUsername(raw) {
  return USERNAME_RE.test(
    String(raw ?? '')
      .trim()
      .toLowerCase(),
  );
}

export function staffEmail(username) {
  return `${normalizeUsername(username)}@${AUTH_DOMAIN}`;
}

export function studentEmail(studentId) {
  return `stu_${studentId}@${AUTH_DOMAIN}`;
}

export function usernameFromEmail(email) {
  return String(email ?? '')
    .split('@')[0]
    .toLowerCase();
}
