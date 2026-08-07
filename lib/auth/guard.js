const PUBLIC_PREFIXES = ['/login', '/change-password', '/j/'];
const STUDENT_PREFIXES = ['/today', '/board', '/notifications', '/settings'];
const MANAGE_PREFIXES = [
  '/schedules',
  '/students',
  '/questions',
  '/grading',
  '/boards',
  '/export',
  '/log',
  '/account',
];
const ADMIN_PREFIX = '/admin';

const startsWithAny = (path, prefixes) => prefixes.some((p) => path === p || path.startsWith(p));

export function homeFor(role) {
  if (role === 'student') return '/today';
  if (role === 'manager') return '/schedules';
  if (role === 'super_admin') return '/admin/global-board';
  return '/login';
}

export function canAccess(role, pathname) {
  if (startsWithAny(pathname, PUBLIC_PREFIXES)) return true;
  if (role === 'super_admin') return true;
  if (role === 'student') return startsWithAny(pathname, STUDENT_PREFIXES);
  if (role === 'manager') {
    return startsWithAny(pathname, MANAGE_PREFIXES) && !pathname.startsWith(ADMIN_PREFIX);
  }
  return false;
}

export const ROLE_LABELS = Object.freeze({
  super_admin: 'المشرف العام',
  manager: 'مشرف',
  student: 'طالب',
});
