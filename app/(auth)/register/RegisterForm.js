'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { EmojiPicker } from '@/components/ui/EmojiPicker';
import { getBrowserClient } from '@/lib/supabase/browser';
import { registerSchema } from '@/lib/validation/auth';
import { siteUrl } from '@/lib/config/site';

export function RegisterForm() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emoji, setEmoji] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');

    const parsed = registerSchema.safeParse({ fullName, email, password, emoji });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'تحقّق من الحقول');
      return;
    }

    setBusy(true);
    try {
      const { error: signUpError } = await getBrowserClient().auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          data: { full_name: parsed.data.fullName, emoji: parsed.data.emoji },
          // Always the production origin (not localhost/preview) so the link in
          // the email works on any device and lands the confirmed user in the app.
          emailRedirectTo: `${siteUrl()}/today`,
        },
      });

      if (signUpError) {
        setError(
          /already registered|exists/i.test(signUpError.message || '')
            ? 'هذا البريد مسجّل بالفعل'
            : signUpError.message || 'تعذّر إنشاء الحساب',
        );
        return;
      }

      setDone(true);
    } catch {
      setError('تعذّر الاتصال بالخادم، تحقّق من الإنترنت');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card space-y-3 p-6 text-center">
        <div className="text-4xl" aria-hidden="true">
          📧
        </div>
        <h2 className="text-lg font-bold">تحقّق من بريدك الإلكتروني</h2>
        <p className="text-sm text-muted">
          أرسلنا رابط تأكيد إلى <span dir="ltr">{email}</span>. افتح الرابط ثم عُد لتسجيل الدخول.
        </p>
        <Link href="/login" prefetch className="font-semibold text-brand underline">
          العودة لتسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <h2 className="text-lg font-bold">إنشاء حساب</h2>

      <Field label="الاسم" htmlFor="fullName">
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </Field>

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

      <Field label="كلمة المرور" htmlFor="password" hint="8 أحرف على الأقل">
        <Input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>

      <Field label="اختر رمزك" error={error}>
        <EmojiPicker value={emoji} onChange={setEmoji} />
      </Field>

      <Button type="submit" loading={busy} className="w-full">
        إنشاء الحساب
      </Button>

      <p className="text-center text-sm text-muted">
        لديك حساب؟{' '}
        <Link href="/login" prefetch className="font-semibold text-brand underline">
          تسجيل الدخول
        </Link>
      </p>
    </form>
  );
}
