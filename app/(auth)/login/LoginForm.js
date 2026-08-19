'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { applySession } from '@/lib/auth/session';
import { getBrowserClient } from '@/lib/supabase/browser';
import { PasskeyButton } from '@/components/auth/PasskeyButton';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [resent, setResent] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNeedsConfirm(false);
    setResent(false);
    setBusy(true);

    try {
      let res;
      try {
        res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        });
      } catch {
        setError('تعذّر الاتصال بالخادم، تحقّق من الإنترنت');
        return;
      }

      const body = await res.json().catch(() => ({}));

      if (res.status === 403 && body.needsConfirmation) {
        setNeedsConfirm(true);
        setError(body.error || 'يرجى تأكيد بريدك الإلكتروني أولاً');
        return;
      }

      if (!res.ok) {
        setError(body.error || `تعذّر تسجيل الدخول (خطأ ${res.status})`);
        setPassword('');
        return;
      }

      await applySession(body);
      router.replace(body.redirect);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setResent(false);
    try {
      await getBrowserClient().auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
      });
      setResent(true);
    } catch {
      setError('تعذّر إرسال رسالة التأكيد، حاول لاحقاً');
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <h2 className="text-lg font-bold">تسجيل الدخول</h2>

      <Field label="البريد الإلكتروني" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          dir="ltr"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>

      <Field label="كلمة المرور" htmlFor="password" error={error}>
        <Input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>

      {needsConfirm && (
        <div className="rounded-lg bg-warn-soft p-3 text-sm text-warn-ink">
          {resent ? (
            <span>تم إرسال رسالة التأكيد، تحقّق من بريدك.</span>
          ) : (
            <button type="button" onClick={resend} className="font-semibold underline">
              إعادة إرسال رسالة التأكيد
            </button>
          )}
        </div>
      )}

      <Button type="submit" loading={busy} className="w-full">
        دخول
      </Button>

      <PasskeyButton onError={setError} />

      <p className="text-center text-sm text-muted">
        ليس لديك حساب؟{' '}
        <Link href="/register" prefetch className="font-semibold text-brand underline">
          أنشئ حساباً
        </Link>
      </p>
    </form>
  );
}
