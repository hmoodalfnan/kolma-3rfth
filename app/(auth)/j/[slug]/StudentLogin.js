'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { PinInput } from '@/components/ui/PinInput';
import { SkeletonList } from '@/components/ui/Skeleton';
import { applySession } from '@/lib/auth/session';

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
        <div className="text-center">
          <p className="text-sm text-muted">{state.schedule.name}</p>
          <h2 className="mt-1 text-lg font-bold">{selected.full_name}</h2>
          {selected.group_id && (
            <p className="text-xs text-muted">{groupName(selected.group_id)}</p>
          )}
        </div>

        <Field label="الرمز السري (6 أرقام)" error={error}>
          <PinInput value={pin} onChange={setPin} length={6} label="الرمز السري" />
        </Field>

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
      <div className="text-center">
        <h2 className="text-lg font-bold">{state.schedule.name}</h2>
        <p className="mt-1 text-sm text-muted">اختر اسمك من القائمة</p>
      </div>

      {state.schedule.archived && (
        <p className="rounded-xl bg-gold-100 px-3 py-2 text-center text-sm font-semibold text-gold-700">
          هذه الرحلة مؤرشفة — يمكنك الاطلاع فقط.
        </p>
      )}

      <Input
        type="search"
        placeholder="ابحث عن اسمك…"
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
              groupId === 'all' ? 'bg-navy-700 text-white' : 'bg-navy-50 text-navy-700'
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
                groupId === g.id ? 'bg-navy-700 text-white' : 'bg-navy-50 text-navy-700'
              }`}
            >
              {g.name}
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
              className="flex w-full items-center justify-between rounded-xl border border-line bg-panel px-3 py-3 text-right transition hover:border-navy-300 hover:bg-navy-50"
            >
              <span className="font-semibold">{s.full_name}</span>
              <span className="text-xs text-muted">{groupName(s.group_id)}</span>
            </button>
          </li>
        ))}
        {students.length === 0 && (
          <li className="py-6 text-center text-sm text-muted">لا يوجد اسم مطابق</li>
        )}
      </ul>
    </div>
  );
}
