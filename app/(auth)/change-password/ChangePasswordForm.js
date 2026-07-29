'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { PinInput } from '@/components/ui/PinInput';
import { getBrowserClient } from '@/lib/supabase/browser';
import { applySession, getStoredRole, patchStoredRole, signOut } from '@/lib/auth/session';
import { validateStaffPassword, validateStudentPin } from '@/lib/auth/password';

export function ChangePasswordForm() {
  const router = useRouter();
  const [role, setRole] = useState(null);
  const [firstTime, setFirstTime] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const stored = getStoredRole();
    setRole(stored?.role ?? 'manager');
    setFirstTime(Boolean(stored?.mustChangePassword));
  }, []);

  const isStudent = role === 'student';

  async function submit(event) {
    event.preventDefault();
    setError('');

    if (next !== confirm) {
      setError(isStudent ? 'الرمزان غير متطابقين' : 'كلمتا المرور غير متطابقتين');
      return;
    }

    const policy = isStudent ? validateStudentPin(next) : validateStaffPassword(next);
    if (!policy.ok) {
      setError(policy.error);
      return;
    }

    setBusy(true);
    try {
      const { data } = await getBrowserClient().auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        await signOut();
        return;
      }

      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          // Omitted entirely on a first-time change; the server decides whether
          // it is required by reading the account's own flag.
          ...(firstTime ? {} : { currentPassword: current }),
          newPassword: next,
        }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || 'تعذّر تغيير كلمة المرور');
        return;
      }

      setDone(true);
      patchStoredRole({ mustChangePassword: false });

      // The server hands back a session minted from the new password, so there
      // is nothing left to prove by making anyone sign in again.
      if (body.session) {
        await applySession({ ...getStoredRole(), session: body.session, mustChangePassword: false });
        router.replace(body.redirect || (isStudent ? '/today' : '/schedules'));
        return;
      }

      // No session came back — the password did change, so the only safe way
      // forward is a fresh sign-in.
      setTimeout(() => signOut('/login'), 1600);
    } catch {
      setError('تعذّر الاتصال بالخادم');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card p-6 text-center">
        <p className="font-semibold text-emerald-600">تم التغيير بنجاح</p>
        <p className="mt-2 text-sm text-muted">جارٍ متابعة الدخول…</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <h2 className="text-lg font-bold">
        {firstTime
          ? isStudent
            ? 'اختر رمزك السري'
            : 'اختر كلمة المرور الخاصة بك'
          : isStudent
            ? 'تغيير الرمز السري'
            : 'تغيير كلمة المرور'}
      </h2>
      <p className="text-sm text-muted">
        {firstTime && 'الرمز الذي دخلت به مؤقت. اختر واحداً خاصاً بك للمتابعة. '}
        {isStudent
          ? 'اختر رمزاً من 6 أرقام تحفظه ولا تشاركه مع أحد.'
          : 'كلمة المرور 8 أحرف على الأقل وتحتوي نوعين مختلفين على الأقل.'}
      </p>

      {/* Skipped on a first-time change: the temporary secret was just typed at
          the sign-in screen, so asking for it again is a hurdle without a
          purpose. */}
      {!firstTime && (
        <Field label={isStudent ? 'الرمز الحالي' : 'كلمة المرور الحالية'}>
          {isStudent ? (
            <PinInput value={current} onChange={setCurrent} label="الرمز الحالي" />
          ) : (
            <Input
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          )}
        </Field>
      )}

      <Field label={isStudent ? 'الرمز الجديد' : 'كلمة المرور الجديدة'}>
        {isStudent ? (
          <PinInput value={next} onChange={setNext} label="الرمز الجديد" />
        ) : (
          <Input
            type="password"
            dir="ltr"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        )}
      </Field>

      <Field label={isStudent ? 'تأكيد الرمز الجديد' : 'تأكيد كلمة المرور'} error={error}>
        {isStudent ? (
          <PinInput value={confirm} onChange={setConfirm} label="تأكيد الرمز" />
        ) : (
          <Input
            type="password"
            dir="ltr"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        )}
      </Field>

      <Button type="submit" loading={busy} className="w-full">
        حفظ
      </Button>
    </form>
  );
}
