'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Modal, ModalActions } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import { useSchedule } from '@/lib/manage/useSchedule';
import {
  listCriteria,
  createCriterion,
  updateCriterion,
  archiveCriterion,
  deleteCriterion,
  countCriterionGrants,
  listGroups,
  listStudents,
  listGrants,
  grantPoints,
  undoGrant,
} from '@/lib/manage/api';
import { useTransientError } from '@/lib/ui/useTransientError';

// Symmetric, so a deduction is the same gesture as an award.
const QUICK = [1, 3, 5, -1, -3, -5];

export function GradingScreen() {
  const { current } = useSchedule();
  const toast = useToast();

  const [criteria, setCriteria] = useState(null);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [grants, setGrants] = useState([]);
  const [error, setError] = useTransientError();

  const load = useCallback(async () => {
    if (!current) return;
    setCriteria(null);
    try {
      const [c, g, s, h] = await Promise.all([
        listCriteria(current.id),
        listGroups(current.id),
        listStudents(current.id),
        listGrants(current.id),
      ]);
      setCriteria(c);
      setGroups(g);
      setStudents(s.filter((x) => x.is_active));
      setGrants(h);
    } catch (err) {
      setError(err.message);
      setCriteria([]);
    }
  }, [current]);

  useEffect(() => {
    load();
  }, [load]);

  if (!current) return <EmptyState>اختر رحلة أولاً.</EmptyState>;
  if (criteria === null) return <SkeletonList rows={8} className="h-20" />;

  const submit = async (payload) => {
    try {
      await grantPoints({ scheduleId: current.id, ...payload });
      await load();
      toast.push('تم تسجيل النقاط', 'success');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>

      <CriteriaPanel scheduleId={current.id} criteria={criteria} onChanged={load} />

      <div className="grid gap-4 lg:grid-cols-2">
        <GrantForm
          title="تقييم طالب"
          criteria={criteria}
          targets={students.map((s) => ({
            id: s.id,
            label: `${s.full_name} — مجموعة: ${groups.find((g) => g.id === s.group_id)?.name ?? 'بدون مجموعة'}`,
          }))}
          emptyLabel="لا يوجد طلاب نشطون."
          onSubmit={(criterionId, points, note, targetId) =>
            submit({ criterionId, points, note, target: { kind: 'student', studentId: targetId } })
          }
        />

        <GrantForm
          title="تقييم مجموعة"
          criteria={criteria}
          targets={groups.map((g) => ({
            id: g.id,
            label: `مجموعة: ${g.name} (${students.filter((s) => s.group_id === g.id).length} طالب)`,
          }))}
          emptyLabel="لا توجد مجموعات."
          showApplyToMembers
          memberCount={(groupId) => students.filter((s) => s.group_id === groupId).length}
          onSubmit={(criterionId, points, note, targetId, applyToMembers) =>
            submit({
              criterionId,
              points,
              note,
              target: { kind: 'group', groupId: targetId, applyToMembers },
            })
          }
        />
      </div>

      <Panel title="آخر العمليات">
        {grants.length === 0 ? (
          <EmptyState>لا توجد عمليات بعد.</EmptyState>
        ) : (
          <ul className="space-y-1.5">
            {grants.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {g.students?.full_name ?? g.groups?.name ?? '—'}
                    {g.parent_event_id && (
                      <span className="ms-1 text-xs font-normal text-muted">(من تقييم جماعي)</span>
                    )}
                  </span>
                  <span className="block text-xs text-muted">
                    {g.criteria?.name} · {new Date(g.created_at).toLocaleString('ar')}
                    {g.note ? ` · ${g.note}` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={`font-bold tabular-nums ${
                      Number(g.points) > 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                    dir="ltr"
                  >
                    {Number(g.points) > 0 ? `+${g.points}` : g.points}
                  </span>
                  {!g.parent_event_id && (
                    <Button
                      tone="ghost"
                      className="min-h-0 px-2 py-1 text-xs"
                      onClick={async () => {
                        setGrants((rows) => rows.filter((r) => r.id !== g.id));
                        try {
                          await undoGrant(g.id);
                          await load();
                        } catch (err) {
                          setError(err.message);
                          load();
                        }
                      }}
                    >
                      حذف
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function GrantForm({
  title,
  criteria,
  targets,
  emptyLabel,
  onSubmit,
  showApplyToMembers = false,
  memberCount,
}) {
  const [targetId, setTargetId] = useState('');
  const [criterionId, setCriterionId] = useState(criteria[0]?.id ?? '');
  const [points, setPoints] = useState(5);
  const [note, setNote] = useState('');
  const [applyToMembers, setApplyToMembers] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!targetId && targets[0]) setTargetId(targets[0].id);
  }, [targets, targetId]);

  const criterion = useMemo(
    () => criteria.find((c) => c.id === criterionId),
    [criteria, criterionId],
  );

  if (targets.length === 0) {
    return (
      <Panel title={title}>
        <EmptyState>{emptyLabel}</EmptyState>
      </Panel>
    );
  }

  const run = async () => {
    const value = Number(points);
    if (!value) return;

    setBusy(true);
    // The sign is carried by the value the user picked, so a criterion that
    // forbids deductions clamps rather than silently flipping it.
    const signed = criterion?.allow_negative ? value : Math.abs(value);
    await onSubmit(criterionId, signed, note, targetId, applyToMembers);
    setNote('');
    setBusy(false);
  };

  return (
    <Panel title={title}>
      <div className="space-y-3">
        <Field label="الهدف" htmlFor={`${title}-target`}>
          <Select
            id={`${title}-target`}
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="بند التقييم" htmlFor={`${title}-crit`}>
          <Select
            id={`${title}-crit`}
            value={criterionId}
            onChange={(e) => setCriterionId(e.target.value)}
          >
            {criteria.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.allow_negative ? '' : ' (زيادة فقط)'}
              </option>
            ))}
          </Select>
        </Field>

        {/* The sign lives on the number, not on a pair of submit buttons. Two
            buttons meant choosing an amount and then choosing a direction, and
            the direction was the easier of the two to get wrong. */}
        <Field
          label="النقاط"
          htmlFor={`${title}-points`}
          hint={
            criterion?.allow_negative
              ? 'اختر قيمة موجبة للزيادة أو سالبة للخصم.'
              : 'هذا البند لا يسمح بالخصم.'
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((n) => {
              const disabled = n < 0 && !criterion?.allow_negative;
              const on = Number(points) === n;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPoints(n)}
                  className={`min-w-14 rounded-lg px-3 py-2 text-sm font-bold tabular-nums transition disabled:opacity-30 ${
                    on
                      ? n < 0
                        ? 'bg-rose-600 text-white'
                        : 'bg-accent text-accent-ink'
                      : 'chip'
                  }`}
                  dir="ltr"
                >
                  {n > 0 ? `+${n}` : n}
                </button>
              );
            })}

            <Input
              id={`${title}-points`}
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              aria-label="قيمة أخرى"
              placeholder="أخرى"
              className="w-24"
              dir="ltr"
            />
          </div>
        </Field>

        <Field label="ملاحظة (اختياري)" htmlFor={`${title}-note`}>
          <Input id={`${title}-note`} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {showApplyToMembers && (
          <>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={applyToMembers}
                onChange={(e) => setApplyToMembers(e.target.checked)}
                className="size-5 accent-[color:var(--color-accent)]"
              />
              إضافة النقاط لكل طالب في المجموعة أيضاً
            </label>
            <p className="text-xs text-muted">
              {applyToMembers
                ? `سيحصل ${memberCount(targetId)} طالباً على ${Math.abs(Number(points) || 0)} نقطة لكل واحد، بالإضافة إلى رصيد المجموعة.`
                : 'ستُضاف النقاط لرصيد المجموعة فقط دون أرصدة الطلاب.'}
            </p>
          </>
        )}

        <Button
          loading={busy}
          disabled={!Number(points)}
          tone={Number(points) < 0 ? 'danger' : 'primary'}
          onClick={run}
        >
          {Number(points) < 0
            ? `خصم ${Math.abs(Number(points))} نقطة`
            : `منح ${Number(points) || 0} نقطة`}
        </Button>
      </div>
    </Panel>
  );
}

function CriteriaPanel({ scheduleId, criteria, onChanged }) {
  const [editing, setEditing] = useState(null); // 'new' | criterion row
  const [removing, setRemoving] = useState(null);
  const [dialogError, setDialogError] = useTransientError();

  return (
    <Panel
      title="بنود التقييم"
      action={<Button onClick={() => setEditing('new')}>بند تقييم جديد</Button>}
    >
      <CriterionForm
        // Remounted between the new-criterion form and each existing one, so the
        // dialog never opens holding the previous one's draft.
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        open={editing !== null}
        criterion={editing === 'new' ? null : editing}
        error={dialogError}
        onCancel={() => setEditing(null)}
        onSubmit={async ({ name, allowNegative }) => {
          try {
            if (editing === 'new') {
              await createCriterion(scheduleId, name, allowNegative, criteria.length);
            } else {
              await updateCriterion(editing.id, { name, allow_negative: allowNegative });
            }
            onChanged();
            setEditing(null);
          } catch (err) {
            setDialogError(err.message);
          }
        }}
      />

      <RemoveCriterionDialog
        criterion={removing}
        error={dialogError}
        onCancel={() => setRemoving(null)}
        onDone={async (action) => {
          try {
            if (action === 'delete') await deleteCriterion(removing.id);
            else await archiveCriterion(removing.id);
            onChanged();
            setRemoving(null);
          } catch (err) {
            setDialogError(err.message);
          }
        }}
      />

      {criteria.length === 0 ? (
        <EmptyState>لا توجد بنود تقييم — أضف بنداً للبدء.</EmptyState>
      ) : (
        <ul className="mt-3 space-y-2">
          {criteria.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold break-words">{c.name}</span>
                <span className="block text-xs text-muted">
                  {c.allow_negative ? 'يسمح بالزيادة والخصم' : 'زيادة فقط'}
                </span>
              </span>
              <Button
                tone="outline"
                className="min-h-0 px-3 py-1.5 text-xs"
                onClick={() => setEditing(c)}
              >
                تعديل
              </Button>
              <Button
                tone="danger"
                className="min-h-0 px-3 py-1.5 text-xs"
                onClick={() => setRemoving(c)}
              >
                حذف
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function CriterionForm({ open, criterion, error, onSubmit, onCancel }) {
  const [name, setName] = useState(criterion?.name ?? '');
  const [allowNegative, setAllowNegative] = useState(criterion?.allow_negative ?? true);
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={criterion ? 'تعديل بند التقييم' : 'بند تقييم جديد'}
      error={error}
      size="sm"
    >
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          setBusy(true);
          await onSubmit({ name: trimmed, allowNegative });
          setBusy(false);
        }}
      >
        <Field label="اسم البند" htmlFor="cname" hint="مثل: التعاون">
          <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>

        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={allowNegative}
            onChange={(e) => setAllowNegative(e.target.checked)}
            className="accent-[color:var(--color-accent)]"
          />
          يسمح بالخصم
        </label>

        {criterion && (
          <p className="text-xs text-muted">
            تغيير الاسم يسري على العمليات السابقة أيضاً — البند واحد، والاسم صفة له.
          </p>
        )}

        <ModalActions>
          <Button type="submit" loading={busy}>
            {criterion ? 'حفظ' : 'إضافة'}
          </Button>
          <Button tone="ghost" onClick={onCancel}>
            إلغاء
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}

/**
 * A criterion with grants behind it cannot simply go: the points already given
 * out reference it, and the database refuses to orphan them. So the dialog
 * counts them first and offers the honest choice — hide it, or delete it along
 * with every grant made under it.
 */
function RemoveCriterionDialog({ criterion, error, onDone, onCancel }) {
  const [grants, setGrants] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!criterion) return;
    setGrants(null);
    let alive = true;
    countCriterionGrants(criterion.id)
      .then((n) => alive && setGrants(n))
      .catch(() => alive && setGrants(-1)); // unknown; the buttons still work
    return () => {
      alive = false;
    };
  }, [criterion]);

  const run = async (action) => {
    setBusy(action);
    await onDone(action);
    setBusy(null);
  };

  return (
    <Modal
      open={Boolean(criterion)}
      onClose={onCancel}
      title="حذف بند التقييم"
      error={error}
      size="sm"
    >
      {criterion && (
        <div className="grid gap-4">
          <p className="text-sm">
            البند: <span className="font-bold">{criterion.name}</span>
          </p>

          {grants === null ? (
            <p className="text-sm text-muted">جارٍ حساب العمليات المرتبطة…</p>
          ) : grants < 0 ? (
            <p className="text-sm text-muted">تعذّر حساب العمليات المرتبطة به.</p>
          ) : grants > 0 ? (
            <p className="rounded-xl bg-gold-100 px-3 py-2 text-sm font-semibold text-gold-700">
              مرتبط به {grants} عملية تقييم سابقة.
            </p>
          ) : (
            <p className="text-sm text-muted">لا توجد عمليات تقييم مرتبطة به.</p>
          )}

          <div className="rounded-xl border border-line p-3">
            <p className="text-sm font-semibold">إخفاء البند</p>
            <p className="mt-1 text-xs text-muted">
              يختفي من قوائم التقييم، وتبقى العمليات السابقة ونقاطها كما هي.
            </p>
            <Button
              tone="outline"
              className="mt-2 min-h-0 px-3 py-1.5 text-xs"
              loading={busy === 'archive'}
              onClick={() => run('archive')}
            >
              إخفاء
            </Button>
          </div>

          <div className="rounded-xl border border-rose-600/40 p-3">
            <p className="text-sm font-semibold text-danger-ink">حذف نهائي</p>
            <p className="mt-1 text-xs text-muted">
              {grants > 0
                ? `يُحذف البند و${grants} عملية تقييم معه، فتتغيّر أرصدة من حصلوا عليها. لا يمكن التراجع.`
                : 'يُحذف البند وأي عمليات تقييم تمّت تحته. لا يمكن التراجع.'}
            </p>
            <Button
              tone="danger"
              className="mt-2 min-h-0 px-3 py-1.5 text-xs"
              loading={busy === 'delete'}
              onClick={() => run('delete')}
            >
              حذف نهائياً
            </Button>
          </div>

          <ModalActions>
            <Button tone="ghost" onClick={onCancel}>
              إلغاء
            </Button>
          </ModalActions>
        </div>
      )}
    </Modal>
  );
}
