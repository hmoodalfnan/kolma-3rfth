'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Modal, ModalActions } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import { getBrowserClient } from '@/lib/supabase/browser';
import {
  listStaffAccounts,
  listScheduleStaff,
  assignScheduleStaff,
  unassignScheduleStaff,
} from '@/lib/manage/api';
import { ROLE_LABELS } from '@/lib/auth/guard';

/**
 * Who runs this trip.
 *
 * The trip's owner — whoever created it — can only be removed by a super admin,
 * so that a manager added to a trip cannot remove the person whose trip it is.
 * The rule is enforced in the database (migration 0014); this only reflects it,
 * because a check that lives solely in the interface is not a rule.
 */
export function ScheduleStaffPanel({ schedule }) {
  const toast = useToast();
  const [accounts, setAccounts] = useState(null);
  const [assigned, setAssigned] = useState(null);
  const [me, setMe] = useState(null);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [{ data: auth }, all, rows] = await Promise.all([
        getBrowserClient().auth.getUser(),
        listStaffAccounts(),
        listScheduleStaff(schedule.id),
      ]);
      setMe(auth?.user?.id ?? null);
      setAccounts(all);
      setAssigned(new Set(rows.map((r) => r.user_id)));
    } catch (err) {
      setError(err.message);
      setAccounts([]);
      setAssigned(new Set());
    }
  }, [schedule.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (accounts === null || assigned === null) {
    return (
      <Panel title="مشرفو الرحلة">
        <SkeletonList rows={3} />
      </Panel>
    );
  }

  const isSuperAdmin = accounts.find((a) => a.id === me)?.role === 'super_admin';
  const staff = accounts.filter((a) => assigned.has(a.id));
  const available = accounts.filter((a) => !assigned.has(a.id));

  async function add(userId) {
    setError('');
    try {
      await assignScheduleStaff(schedule.id, userId);
      setAssigned(new Set([...assigned, userId]));
      setAdding(false);
      setPick('');
      toast.push('تمت إضافة المشرف للرحلة', 'success');
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(user) {
    setError('');
    const isSelf = user.id === me;
    const confirmText = isSelf
      ? 'ستفقد الوصول إلى هذه الرحلة. متابعة؟'
      : `سيفقد ${user.display_name} الوصول إلى هذه الرحلة. متابعة؟`;
    if (!window.confirm(confirmText)) return;

    try {
      await unassignScheduleStaff(schedule.id, user.id);
      const next = new Set(assigned);
      next.delete(user.id);
      setAssigned(next);

      // Removing yourself means this trip is about to vanish from your list, so
      // reload the whole thing rather than leaving a screen whose data you can
      // no longer read. A full navigation also clears the cached selection.
      if (isSelf) window.location.assign('/schedules');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Panel
      title="مشرفو الرحلة"
      action={
        available.length > 0 ? (
          <Button onClick={() => setAdding(true)}>إضافة مشرف</Button>
        ) : null
      }
    >
      <ErrorText>{error}</ErrorText>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="إضافة مشرف للرحلة"
        description="الحسابات الموجودة فقط — لإنشاء حساب جديد استخدم شاشة المشرفين."
        size="sm"
      >
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (pick) add(pick);
          }}
        >
          <Field label="الحساب" htmlFor="staffpick">
            <Select
              id="staffpick"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              required
            >
              <option value="">اختر حساباً…</option>
              {available.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name} ({ROLE_LABELS[a.role]})
                </option>
              ))}
            </Select>
          </Field>

          <ModalActions>
            <Button type="submit" disabled={!pick}>
              إضافة
            </Button>
            <Button tone="ghost" onClick={() => setAdding(false)}>
              إلغاء
            </Button>
          </ModalActions>
        </form>
      </Modal>

      {staff.length === 0 ? (
        <EmptyState>لا يوجد مشرفون على هذه الرحلة بعد.</EmptyState>
      ) : (
        <ul className="mt-3 space-y-2">
          {staff.map((u) => {
            const isOwner = u.id === schedule.created_by;
            const isSelf = u.id === me;
            const locked = isOwner && !isSuperAdmin;

            return (
              <li
                key={u.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {u.display_name}
                    {isSelf && <span className="ms-2 text-xs font-normal text-muted">(أنت)</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {ROLE_LABELS[u.role]}
                    {isOwner && ' · منشئ الرحلة'}
                  </p>
                </div>

                {locked ? (
                  <span className="rounded-full bg-chip px-2.5 py-1 text-[11px] font-bold text-brand">
                    لا يمكن إزالته
                  </span>
                ) : (
                  <Button
                    tone="outline"
                    className="min-h-0 px-3 py-1.5 text-xs"
                    onClick={() => remove(u)}
                  >
                    {isSelf ? 'إزالة نفسي' : 'إزالة'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
