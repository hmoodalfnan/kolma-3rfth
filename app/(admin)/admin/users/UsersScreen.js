'use client';

import { useEffect, useState } from 'react';
import { EmptyState, ErrorText } from '@/components/manage/Panel';
import { Button } from '@/components/ui/Button';
import { SkeletonList } from '@/components/ui/Skeleton';
import { getBrowserClient } from '@/lib/supabase/browser';

function tally(rows, key) {
  const map = new Map();
  for (const r of rows || []) map.set(r[key], (map.get(r[key]) || 0) + 1);
  return map;
}

function toCsv(users) {
  const header = ['الاسم', 'البريد', 'الرمز', 'تاريخ الانضمام', 'مهام يومية منجزة', 'مهام مستمرة منجزة'];
  const esc = (v) => {
    const s = String(v ?? '');
    // Neutralise spreadsheet formula injection, then CSV-quote.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [header.map(esc).join(',')];
  for (const u of users) {
    lines.push(
      [u.full_name, u.email, u.emoji, u.joined, u.daily, u.assignments].map(esc).join(','),
    );
  }
  return '﻿' + lines.join('\r\n'); // BOM so Excel reads Arabic UTF-8
}

export function UsersScreen() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const client = getBrowserClient();
        const [uRes, dcRes, acRes] = await Promise.all([
          client
            .from('students')
            .select('id, full_name, email, emoji, created_at')
            .eq('is_active', true)
            .order('created_at'),
          client.from('daily_completions').select('user_id'),
          client.from('assignment_completions').select('user_id'),
        ]);
        const daily = tally(dcRes.data, 'user_id');
        const asg = tally(acRes.data, 'user_id');
        setUsers(
          (uRes.data || []).map((u) => ({
            ...u,
            joined: new Date(u.created_at).toLocaleDateString('ar-SA', { timeZone: 'Asia/Riyadh' }),
            daily: daily.get(u.id) || 0,
            assignments: asg.get(u.id) || 0,
          })),
        );
      } catch {
        setError('تعذّر تحميل المستخدمين');
        setUsers([]);
      }
    })();
  }, []);

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
      <p className="text-sm text-muted">الأسماء والبيانات كاملة — بدون نقاط (النقاط تظهر في لوحة الصدارة فقط).</p>

      <ErrorText>{error}</ErrorText>

      {users === null ? (
        <SkeletonList rows={6} />
      ) : users.length === 0 ? (
        <EmptyState>لا يوجد مستخدمون بعد.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-start text-xs text-muted">
                <th className="p-3 text-start font-semibold">الرمز</th>
                <th className="p-3 text-start font-semibold">الاسم</th>
                <th className="p-3 text-start font-semibold">البريد</th>
                <th className="p-3 text-start font-semibold">الانضمام</th>
                <th className="p-3 text-center font-semibold">يومية</th>
                <th className="p-3 text-center font-semibold">مستمرة</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="p-3 text-xl">{u.emoji || '—'}</td>
                  <td className="p-3 font-semibold text-ink">{u.full_name}</td>
                  <td className="p-3 text-muted" dir="ltr">{u.email || '—'}</td>
                  <td className="p-3 text-muted">{u.joined}</td>
                  <td className="p-3 text-center">{u.daily}</td>
                  <td className="p-3 text-center">{u.assignments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
