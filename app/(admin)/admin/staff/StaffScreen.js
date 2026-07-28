'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import { getBrowserClient } from '@/lib/supabase/browser';
import { post } from '@/lib/manage/api';
import { useSchedule } from '@/lib/manage/useSchedule';
import { validateStaffPassword } from '@/lib/auth/password';
import { ROLE_LABELS } from '@/lib/auth/guard';

export function StaffScreen() {
  const toast = useToast();
  const { schedules } = useSchedule();

  const [staff, setStaff] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setStaff(null);
    try {
      const client = getBrowserClient();
      const [{ data: users, error: usersError }, { data: links }] = await Promise.all([
        client.from('app_users').select('*').order('username'),
        client.from('schedule_staff').select('schedule_id, user_id'),
      ]);
      if (usersError) throw new Error(usersError.message);

      const map = {};
      for (const link of links ?? []) {
        map[link.user_id] ??= new Set();
        map[link.user_id].add(link.schedule_id);
      }

      setStaff(users ?? []);
      setAssignments(map);
    } catch (err) {
      setError(err.message);
      setStaff([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleAssignment(userId, scheduleId) {
    const currentSet = new Set(assignments[userId] ?? []);
    if (currentSet.has(scheduleId)) currentSet.delete(scheduleId);
    else currentSet.add(scheduleId);

    setAssignments({ ...assignments, [userId]: currentSet }); // optimistic

    try {
      await post('/api/staff', {
        action: 'assign',
        userId,
        scheduleIds: [...currentSet],
      });
    } catch (err) {
      setError(err.message);
      load();
    }
  }

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>

      <Panel
        title="حسابات المشرفين"
        action={<Button onClick={() => setCreating((v) => !v)}>{creating ? 'إلغاء' : 'حساب جديد'}</Button>}
      >
        {creating && (
          <StaffForm
            onCancel={() => setCreating(false)}
            onSubmit={async (values) => {
              try {
                await post('/api/staff', { action: 'create', ...values });
                setCreating(false);
                await load();
                toast.push('تم إنشاء الحساب', 'success');
              } catch (err) {
                setError(err.message);
              }
            }}
          />
        )}

        {staff === null ? (
          <SkeletonList rows={5} />
        ) : staff.length === 0 ? (
          <EmptyState>لا توجد حسابات.</EmptyState>
        ) : (
          <ul className="mt-3 space-y-2">
            {staff.map((u) => (
              <li key={u.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {u.display_name}
                      <span className="ms-2 text-xs font-normal text-muted" dir="ltr">
                        {u.username}
                      </span>
                    </p>
                    <p className="text-xs text-muted">
                      {ROLE_LABELS[u.role]} · {(assignments[u.id]?.size ?? 0)} رحلة
                    </p>
                  </div>

                  <Select
                    aria-label={`صلاحية ${u.username}`}
                    value={u.role}
                    className="min-h-0 w-auto py-1 text-xs"
                    onChange={async (e) => {
                      try {
                        await post('/api/staff', {
                          action: 'update',
                          userId: u.id,
                          role: e.target.value,
                        });
                        await load();
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                  >
                    <option value="manager">مشرف</option>
                    <option value="super_admin">مشرف عام</option>
                  </Select>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await post('/api/staff', {
                          action: 'update',
                          userId: u.id,
                          isActive: !u.is_active,
                        });
                        await load();
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-line text-muted'
                    }`}
                  >
                    {u.is_active ? 'نشط' : 'معطّل'}
                  </button>

                  <Button
                    tone="ghost"
                    className="min-h-0 px-2 py-1 text-xs"
                    onClick={async () => {
                      const pw = window.prompt('كلمة المرور الجديدة (8 أحرف على الأقل)');
                      if (!pw) return;
                      const policy = validateStaffPassword(pw);
                      if (!policy.ok) {
                        setError(policy.error);
                        return;
                      }
                      try {
                        await post('/api/staff', {
                          action: 'reset_password',
                          userId: u.id,
                          newPassword: pw,
                        });
                        toast.push('تم تغيير كلمة المرور', 'success');
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                  >
                    تغيير كلمة المرور
                  </Button>
                </div>

                {schedules && schedules.length > 0 && (
                  <div className="mt-3 border-t border-line pt-2">
                    <p className="mb-1.5 text-xs font-semibold text-muted">الرحلات المسندة</p>
                    <div className="flex flex-wrap gap-1.5">
                      {schedules.map((s) => {
                        const on = assignments[u.id]?.has(s.id) ?? false;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleAssignment(u.id, s.id)}
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                              on ? 'bg-navy-700 text-white' : 'bg-navy-50 text-navy-700'
                            }`}
                          >
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function StaffForm({ onSubmit, onCancel }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('manager');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const policy = validateStaffPassword(password);
        if (!policy.ok) {
          setLocalError(policy.error);
          return;
        }
        setBusy(true);
        await onSubmit({ username, displayName, role, password });
        setBusy(false);
      }}
    >
      <Field label="اسم المستخدم" htmlFor="uname" hint="أحرف إنجليزية وأرقام وشرطة سفلية فقط">
        <Input
          id="uname"
          dir="ltr"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </Field>

      <Field label="الاسم المعروض" htmlFor="dname">
        <Input
          id="dname"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
      </Field>

      <Field label="الصلاحية" htmlFor="urole">
        <Select id="urole" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="manager">مشرف</option>
          <option value="super_admin">مشرف عام</option>
        </Select>
      </Field>

      <Field label="كلمة المرور" htmlFor="upass" error={localError}>
        <Input
          id="upass"
          type="password"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>

      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={busy}>
          إنشاء
        </Button>
        <Button tone="ghost" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
