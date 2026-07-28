'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { applySession } from '@/lib/auth/session';

export function StaffLogin() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'staff', username: username.trim().toLowerCase(), password }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || 'تعذّر تسجيل الدخول');
        setPassword('');
        return;
      }

      await applySession(body);
      router.replace(body.redirect);
    } catch {
      setError('تعذّر الاتصال بالخادم، تحقّق من الإنترنت');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <h2 className="text-lg font-bold">دخول المشرفين</h2>

      <Field label="اسم المستخدم" htmlFor="username">
        <Input
          id="username"
          name="username"
          dir="ltr"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
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

      <Button type="submit" loading={busy} className="w-full">
        دخول
      </Button>

      <p className="text-center text-xs text-muted">
        الطلاب يدخلون عبر رابط الرحلة الخاص بهم.
      </p>
    </form>
  );
}
