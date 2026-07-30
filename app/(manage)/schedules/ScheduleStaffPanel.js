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
  leaveSchedule,
} from '@/lib/manage/api';
import { ROLE_LABELS } from '@/lib/auth/guard';
import { useTransientError } from '@/lib/ui/useTransientError';

/**
 * Who runs this trip.
 *
 * Removing somebody else and stepping off yourself are different acts. The
 * trip's owner — whoever created it — can only be removed *by* someone else if
 * that someone is a super admin, so a manager added to a trip cannot remove the
 * person whose trip it is. Leaving it yourself is always allowed, and settles
 * who is accountable afterwards: the trip passes to another manager, or is
 * archived when there is nobody left. Both rules are enforced in the database
 * (migrations 0014 and 0018); this only reflects them, because a check that
 * lives solely in the interface is not a rule.
 */
export function ScheduleStaffPanel({ schedule }) {
  const toast = useToast();
  const [accounts, setAccounts] = useState(null);
  const [assigned, setAssigned] = useState(null);
  const [order, setOrder] = useState([]);
  const [me, setMe] = useState(null);
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [pick, setPick] = useState('');
  const [error, setError] = useTransientError();
  const [formError, setFormError] = useTransientError();

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
      setOrder(rows.map((r) => r.user_id));
    } catch (err) {
      setError(err.message);
      setAccounts([]);
      setAssigned(new Set());
      setOrder([]);
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
  const iAmOwner = me === schedule.created_by;

  // Mirrors the successor the database will pick: longest-standing manager who
  // is not the one leaving. Shown so the dialog can say the name rather than
  // "somebody".
  const successorId = order.find((id) => id !== me && assigned.has(id));
  const successor = accounts.find((a) => a.id === successorId) ?? null;

  async function add(userId) {
    setFormError('');
    try {
      await assignScheduleStaff(schedule.id, userId);
      setAssigned(new Set([...assigned, userId]));
      setAdding(false);
      setPick('');
      toast.push('تمت إضافة المشرف للرحلة', 'success');
    } catch (err) {
      // Reported inside the dialog. On the panel behind it the message was
      // hidden by the backdrop and only surfaced after closing, which read as
      // the add having silently worked and then failed later.
      setFormError(err.message);
    }
  }

  async function remove(user) {
    setError('');
    if (!window.confirm(`سيفقد ${user.display_name} الوصول إلى هذه الرحلة. متابعة؟`)) return;

    try {
      await unassignScheduleStaff(schedule.id, user.id);
      const next = new Set(assigned);
      next.delete(user.id);
      setAssigned(next);
      setOrder((ids) => ids.filter((id) => id !== user.id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function leave() {
    setFormError('');
    try {
      await leaveSchedule(schedule.id);
      // The trip is about to vanish from this account's list, so reload rather
      // than leave a screen whose data can no longer be read. A full navigation
      // also clears the cached selection.
      window.location.assign('/schedules');
    } catch (err) {
      setFormError(err.message);
    }
  }

  return (
    <Panel
      title="مشرفو الرحلة"
      action={
        available.length > 0 ? (
          <Button
            onClick={() => {
              setFormError('');
              setAdding(true);
            }}
          >
            إضافة مشرف
          </Button>
        ) : null
      }
    >
      <ErrorText>{error}</ErrorText>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        error={formError}
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

      <LeaveDialog
        open={leaving}
        error={formError}
        schedule={schedule}
        isOwner={iAmOwner}
        successor={successor}
        onCancel={() => setLeaving(false)}
        onConfirm={leave}
      />

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

                {isSelf ? (
                  <Button
                    tone="outline"
                    className="min-h-0 px-3 py-1.5 text-xs"
                    onClick={() => {
                      setFormError('');
                      setLeaving(true);
                    }}
                  >
                    الخروج من الرحلة
                  </Button>
                ) : locked ? (
                  <span className="rounded-full bg-chip px-2.5 py-1 text-[11px] font-bold text-brand">
                    لا يمكن إزالته
                  </span>
                ) : (
                  <Button
                    tone="outline"
                    className="min-h-0 px-3 py-1.5 text-xs"
                    onClick={() => remove(u)}
                  >
                    إزالة
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

/**
 * Leaving is stated as its consequence, not as a warning. The three outcomes
 * are genuinely different — one of them ends the trip for everybody — and which
 * one applies is already decided by who else is on it, so it is named up front
 * rather than discovered afterwards.
 */
function LeaveDialog({ open, error, schedule, isOwner, successor, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);
  const archives = isOwner && !successor;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      error={error}
      title="الخروج من الرحلة"
      size="sm"
    >
      <div className="grid gap-3">
        <p className="text-sm">
          الرحلة: <span className="font-bold">{schedule.name}</span>
        </p>

        {archives ? (
          <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-ink">
            لا يوجد مشرف آخر على هذه الرحلة، فستُؤرشف بخروجك. يبقى كل شيء فيها محفوظاً وقابلاً
            للاطلاع، ولن يستطيع الطلاب تسجيل أو تعديل أي شيء بعدها.
          </p>
        ) : isOwner ? (
          <p className="rounded-xl bg-gold-100 px-3 py-2 text-sm font-semibold text-gold-700">
            تنتقل ملكية الرحلة إلى {successor.display_name}، وتستمر الرحلة كما هي. لن يتغيّر شيء
            بالنسبة للطلاب.
          </p>
        ) : (
          <p className="rounded-xl bg-gold-100 px-3 py-2 text-sm font-semibold text-gold-700">
            ستفقد الوصول إلى هذه الرحلة. تستمر الرحلة مع بقية المشرفين.
          </p>
        )}

        <p className="text-xs text-muted">
          {archives
            ? 'يستطيع المشرف العام إعادة فتح الرحلة أو إضافتك إليها من جديد.'
            : 'يستطيع أي مشرف على الرحلة إعادتك إليها لاحقاً.'}
        </p>

        <ModalActions>
          <Button
            tone="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
          >
            {archives ? 'الخروج وأرشفة الرحلة' : 'الخروج من الرحلة'}
          </Button>
          <Button tone="ghost" onClick={onCancel}>
            إلغاء
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
}
