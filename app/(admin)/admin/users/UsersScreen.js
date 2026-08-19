'use client';

import { useEffect, useState } from 'react';
import { EmptyState, ErrorText } from '@/components/manage/Panel';
import { Button } from '@/components/ui/Button';
import { SkeletonList } from '@/components/ui/Skeleton';
import { getBrowserClient } from '@/lib/supabase/browser';
import { post } from '@/lib/manage/api';

function tally(rows, key) {
  const map = new Map();
  for (const r of rows || []) map.set(r[key], (map.get(r[key]) || 0) + 1);
  return map;
}

function toCsv(users) {
  const header = ['الاسم', 'البريد', 'الرمز', 'الحالة', 'تاريخ الانضمام', 'مهام المجموعة المنجزة'];
  const esc = (v) => {
    const s = String(v ?? '');
    // Neutralise spreadsheet formula injection, then CSV-quote.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [header.map(esc).join(',')];
  for (const u of users) {
    lines.push(
      [u.full_name, u.email, u.emoji, u.is_active ? 'مفعّل' : 'معطّل', u.joined, u.assignments]
        .map(esc)
        .join(','),
    );
  }
  return '﻿' + lines.join('\r\n'); // BOM so Excel reads Arabic UTF-8
}

export function UsersScreen() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const client = getBrowserClient();
        const [uRes, acRes] = await Promise.all([
          client
            .from('students')
            .select('id, full_name, email, emoji, is_active, created_at')
            .order('created_at'),
          client.from('assignment_completions').select('user_id'),
        ]);
        const asg = tally(acRes.data, 'user_id');
        setUsers(
          (uRes.data || []).map((u) => ({
            ...u,
            joined: new Date(u.created_at).toLocaleDateString('ar-SA', { timeZone: 'Asia/Riyadh' }),
            assignments: asg.get(u.id) || 0,
          })),
        );
      } catch {
        setError('تعذّر تحميل المستخدمين');
        setUsers([]);
      }
    })();
  }, []);

  async function toggleActive(user) {
    setError('');
    setBusyId(user.id);
    try {
      await post('/api/users/set-active', { studentId: user.id, active: !user.is_active });
      setUsers((list) =>
        list.map((u) => (u.id === user.id ? { ...u, is_active: !u.is_active } : u)),
      );
    } catch (e) {
      setError(e.message || 'تعذّر تحديث الحساب');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(user) {
    if (!window.confirm(`حذف حساب «${user.full_name}» نهائياً؟ لا يمكن التراجع.`)) return;
    setError('');
    setBusyId(user.id);
    try {
      await post('/api/users/delete', { studentId: user.id });
      setUsers((list) => list.filter((u) => u.id !== user.id));
    } catch (e) {
      setError(e.message || 'تعذّر حذف الحساب');
    } finally {
      setBusyId(null);
    }
  }

  function download() {
    const blob = new Blob([toCsv(users)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand">المستخدمون</h1>
        <Button tone="outline" onClick={download} disabled={!users?.length}>
          ⬇ تنزيل (CSV)
        </Button>
      </div>
      <p className="text-sm text-muted">
        يمكنك تعطيل حساب (يمنع الدخول ويُخفيه من اللوحات) أو حذفه نهائياً.
      </p>

      <ErrorText>{error}</ErrorText>

      {users === null ? (
        <SkeletonList rows={6} />
      ) : users.length === 0 ? (
        <EmptyState>لا يوجد مستخدمون بعد.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-line text-start text-xs text-muted">
                <th className="p-3 text-start font-semibold">الرمز</th>
                <th className="p-3 text-start font-semibold">الاسم</th>
                <th className="p-3 text-start font-semibold">البريد</th>
                <th className="p-3 text-start font-semibold">الانضمام</th>
                <th className="p-3 text-center font-semibold">المجموعة</th>
                <th className="p-3 text-center font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={`border-b border-line last:border-0 ${u.is_active ? '' : 'opacity-60'}`}
                >
                  <td className="p-3 text-xl">{u.emoji || '—'}</td>
                  <td className="p-3 font-semibold text-ink">
                    {u.full_name}
                    {!u.is_active && (
                      <span className="ms-2 rounded-full bg-chip px-2 py-0.5 text-[10px] font-bold text-chip-ink">
                        معطّل
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-muted" dir="ltr">
                    {u.email || '—'}
                  </td>
                  <td className="p-3 text-muted">{u.joined}</td>
                  <td className="p-3 text-center">{u.assignments}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleActive(u)}
                        disabled={busyId === u.id}
                        className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-chip disabled:opacity-50"
                      >
                        {u.is_active ? 'تعطيل' : 'تفعيل'}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(u)}
                        disabled={busyId === u.id}
                        className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-rose-600 transition hover:bg-danger-soft disabled:opacity-50"
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
