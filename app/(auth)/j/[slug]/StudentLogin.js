'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { PinInput } from '@/components/ui/PinInput';
import { SkeletonList } from '@/components/ui/Skeleton';
import { applySession } from '@/lib/auth/session';

/**
 * Two numbered steps, always visible.
 *
 * A student opening this link has never seen the app. Without them the page is
 * a search box and a list with no indication that a PIN comes next, or that
 * picking a name is not itself signing in.
 */
function Steps({ current }) {
  const steps = [
    { n: 1, label: 'اختر اسمك' },
    { n: 2, label: 'اكتب رمزك' },
  ];

  return (
    <ol className="flex items-center justify-center gap-2 text-xs">
      {steps.map((s, i) => (
        <li key={s.n} className="flex items-center gap-2">
          <span
            className={`flex size-6 items-center justify-center rounded-full font-bold ${
              current >= s.n ? 'bg-accent text-accent-ink' : 'bg-line text-muted'
            }`}
          >
            {s.n}
          </span>
          <span className={current >= s.n ? 'font-semibold' : 'text-muted'}>{s.label}</span>
          {i < steps.length - 1 && (
            <span aria-hidden="true" className="text-muted">
              ←
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function StudentLogin({ slug }) {
  const router = useRouter();
  const [state, setState] = useState({ status: 'loading' });
  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState('all');
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/join/${slug}`)
      .then(async (res) => {
        const body = await res.json();
        if (!alive) return;
        if (!res.ok) setState({ status: 'error', message: body.error || 'الرابط غير صالح' });
        else setState({ status: 'ready', ...body });
      })
      .catch(() => {
        if (alive) setState({ status: 'error', message: 'تعذّر الاتصال بالخادم' });
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  const students = useMemo(() => {
    if (state.status !== 'ready') return [];
    const term = search.trim();
    return state.students.filter(
      (s) =>
        (groupId === 'all' || s.group_id === groupId) && (!term || s.full_name.includes(term)),
    );
  }, [state, search, groupId]);

  const groupName = (id) =>
    state.status === 'ready' ? (state.groups.find((g) => g.id === id)?.name ?? '') : '';

  async function submit(event) {
    event.preventDefault();
    if (pin.length !== 6) {
      setError('أدخل الرمز المكوّن من 6 أرقام');
      return;
    }

    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'student', studentId: selected.id, pin, slug }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || 'تعذّر تسجيل الدخول');
        setPin('');
        return;
      }

      await applySession({ ...body, studentId: selected.id, scheduleSlug: slug });
      router.replace(body.redirect);
    } catch {
      setError('تعذّر الاتصال بالخادم، تحقّق من الإنترنت');
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="card space-y-4 p-6">
        <SkeletonList rows={6} />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="card p-6 text-center">
        <p className="font-semibold text-rose-600">{state.message}</p>
        <p className="mt-2 text-sm text-muted">تأكد من الرابط مع المشرف.</p>
      </div>
    );
  }

  if (selected) {
    return (
      <form onSubmit={submit} className="card space-y-5 p-6">
        <Steps current={2} />

        <div className="rounded-xl bg-chip p-3 text-center">
          <p className="text-xs text-muted">أنت تدخل باسم</p>
          <h2 className="mt-0.5 text-xl font-bold">{selected.full_name}</h2>
          {selected.group_id && (
            <p className="text-xs text-muted">مجموعة: {groupName(selected.group_id)}</p>
          )}
        </div>

        <Field label="اكتب رمزك السري (٦ أرقام)" error={error}>
          <PinInput value={pin} onChange={setPin} length={6} label="الرمز السري" />
        </Field>

        <p className="text-center text-xs text-muted">
          الرمز وصلك من المشرف. نسيته؟ اطلب منه إعادة تعيينه.
        </p>

        <Button type="submit" loading={busy} className="w-full">
          دخول
        </Button>
        <Button
          tone="ghost"
          className="w-full"
          onClick={() => {
            setSelected(null);
            setPin('');
            setError('');
          }}
        >
          اختيار اسم آخر
        </Button>
      </form>
    );
  }

  return (
    <div className="card space-y-4 p-6">
      <Steps current={1} />

      <div className="text-center">
        <p className="text-sm text-muted">رحلة: {state.schedule.name}</p>
        <h2 className="mt-1 text-xl font-bold">ابحث عن اسمك واضغط عليه</h2>
        <p className="mt-1 text-sm text-muted">ثم اكتب رمزك السري في الخطوة التالية.</p>
      </div>

      {state.schedule.archived && (
        <p className="rounded-xl bg-gold-100 px-3 py-2 text-center text-sm font-semibold text-gold-700">
          هذه الرحلة مؤرشفة — يمكنك الاطلاع فقط.
        </p>
      )}

      <Input
        type="search"
        placeholder="اكتب أول حروف اسمك…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="ابحث عن اسمك"
      />

      {state.groups.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setGroupId('all')}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              groupId === 'all' ? 'bg-accent text-accent-ink' : 'bg-chip text-brand'
            }`}
          >
            الكل
          </button>
          {state.groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroupId(g.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                groupId === g.id ? 'bg-accent text-accent-ink' : 'bg-chip text-brand'
              }`}
            >
              مجموعة: {g.name}
            </button>
          ))}
        </div>
      )}

      <ul className="max-h-96 space-y-1.5 overflow-y-auto">
        {students.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setSelected(s)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-3.5 text-right transition hover:border-accent hover:bg-chip"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{s.full_name}</span>
                <span className="block truncate text-xs text-muted">
                  مجموعة: {groupName(s.group_id)}
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-muted">
                ‹
              </span>
            </button>
          </li>
        ))}
        {students.length === 0 && (
          <li className="py-6 text-center text-sm text-muted">
            لا يوجد اسم مطابق — جرّب حروفاً أقل، أو راجع المشرف.
          </li>
        )}
      </ul>
    </div>
  );
}
