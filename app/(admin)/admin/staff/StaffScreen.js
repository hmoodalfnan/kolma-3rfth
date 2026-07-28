'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Modal, ModalActions } from '@/components/ui/Modal';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import { CredentialsModal } from '@/components/manage/CredentialsModal';
import { getBrowserClient } from '@/lib/supabase/browser';
import { post } from '@/lib/manage/api';
import { useSchedule } from '@/lib/manage/useSchedule';
import { ROLE_LABELS } from '@/lib/auth/guard';

export function StaffScreen() {
  const { schedules } = useSchedule();

  const [staff, setStaff] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

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
        action={
          <Button
            onClick={() => {
              setFormError('');
              setCreating(true);
            }}
          >
            حساب جديد
          </Button>
        }
      >
        <StaffForm
          open={creating}
          error={formError}
          onCancel={() => setCreating(false)}
          onSubmit={async (values) => {
            setFormError('');
            try {
              const result = await post('/api/staff', { action: 'create', ...values });
              setCreating(false);
              await load();
              setCredentials({
                title: 'تم إنشاء الحساب',
                displayName: values.displayName,
                username: result.username,
                password: result.password,
              });
            } catch (err) {
              // Belongs inside the dialog: the page-level banner sits behind the
              // backdrop, so a failure here looked like nothing happened at all.
              setFormError(err.message);
            }
          }}
        />

        <CredentialsModal
          open={Boolean(credentials)}
          onClose={() => setCredentials(null)}
          title={credentials?.title}
          displayName={credentials?.displayName}
          username={credentials?.username}
          password={credentials?.password}
        />

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
                      u.is_active ? 'bg-ok text-ok-ink' : 'bg-line text-muted'
                    }`}
                  >
                    {u.is_active ? 'نشط' : 'معطّل'}
                  </button>

                  <Button
                    tone="ghost"
                    className="min-h-0 px-2 py-1 text-xs"
                    onClick={async () => {
                      try {
                        const result = await post('/api/staff', {
                          action: 'reset_password',
                          userId: u.id,
                        });
                        setCredentials({
                          title: `كلمة مرور جديدة لـ ${u.display_name}`,
                          displayName: u.display_name,
                          username: result.username,
                          password: result.password,
                        });
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                  >
                    كلمة مرور جديدة
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
                              on ? 'bg-accent text-accent-ink' : 'bg-chip text-brand'
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

function StaffForm({ open, error, onSubmit, onCancel }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('manager');
  const [busy, setBusy] = useState(false);

  // Reopening after a successful create should offer an empty form, not the
  // previous supervisor's details.
  useEffect(() => {
    if (open) {
      setUsername('');
      setDisplayName('');
      setRole('manager');
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="حساب مشرف جديد"
      description="تُنشأ كلمة المرور تلقائياً وتظهر مرة واحدة بعد الحفظ."
      size="sm"
    >
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSubmit({ username, displayName, role });
          setBusy(false);
        }}
      >
        <ErrorText>{error}</ErrorText>

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

        <ModalActions>
          <Button type="submit" loading={busy}>
            إنشاء الحساب
          </Button>
          <Button tone="ghost" onClick={onCancel}>
            إلغاء
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}
