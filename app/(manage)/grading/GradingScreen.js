'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import { useSchedule } from '@/lib/manage/useSchedule';
import {
  listCriteria,
  createCriterion,
  archiveCriterion,
  listGroups,
  listStudents,
  listGrants,
  grantPoints,
  undoGrant,
} from '@/lib/manage/api';

const QUICK = [1, 5, 10, 20];

export function GradingScreen() {
  const { current } = useSchedule();
  const toast = useToast();

  const [criteria, setCriteria] = useState(null);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [grants, setGrants] = useState([]);
  const [error, setError] = useState('');

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

      <div className="grid gap-4 lg:grid-cols-2">
        <GrantForm
          title="تقييم طالب"
          criteria={criteria}
          targets={students.map((s) => ({
            id: s.id,
            label: `${s.full_name} — ${groups.find((g) => g.id === s.group_id)?.name ?? 'بدون مجموعة'}`,
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
            label: `${g.name} (${students.filter((s) => s.group_id === g.id).length} طالب)`,
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

      <CriteriaPanel
        scheduleId={current.id}
        criteria={criteria}
        onChanged={load}
        onError={setError}
      />

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
                      تراجع
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

  const run = async (sign) => {
    setBusy(true);
    await onSubmit(criterionId, sign * Math.abs(Number(points)), note, targetId, applyToMembers);
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

        <Field label="النقاط" htmlFor={`${title}-points`}>
          <div className="flex flex-wrap gap-2">
            <Input
              id={`${title}-points`}
              type="number"
              min={1}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="w-28"
            />
            {QUICK.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPoints(n)}
                className={`rounded-lg px-3 text-sm font-bold ${
                  Number(points) === n ? 'bg-accent text-accent-ink' : 'bg-chip text-brand'
                }`}
              >
                {n}
              </button>
            ))}
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

        <div className="flex gap-2">
          <Button loading={busy} onClick={() => run(1)}>
            زيادة
          </Button>
          {criterion?.allow_negative && (
            <Button tone="danger" loading={busy} onClick={() => run(-1)}>
              خصم
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}

function CriteriaPanel({ scheduleId, criteria, onChanged, onError }) {
  const [name, setName] = useState('');
  const [allowNegative, setAllowNegative] = useState(true);

  return (
    <Panel title="بنود التقييم">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          setName('');
          try {
            await createCriterion(scheduleId, trimmed, allowNegative, criteria.length);
            onChanged();
          } catch (err) {
            onError(err.message);
          }
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسم البند، مثل: التعاون"
          aria-label="اسم بند التقييم"
          className="max-w-xs"
        />
        <label className="flex items-center gap-2 pb-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={allowNegative}
            onChange={(e) => setAllowNegative(e.target.checked)}
            className="size-5 accent-[color:var(--color-accent)]"
          />
          يسمح بالخصم
        </label>
        <Button type="submit">إضافة</Button>
      </form>

      <ul className="mt-3 flex flex-wrap gap-2">
        {criteria.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm"
          >
            <span className="font-semibold">{c.name}</span>
            <span className="text-xs text-muted">{c.allow_negative ? '+/−' : '+ فقط'}</span>
            <button
              type="button"
              aria-label={`حذف ${c.name}`}
              onClick={async () => {
                try {
                  await archiveCriterion(c.id);
                  onChanged();
                } catch (err) {
                  onError(err.message);
                }
              }}
              className="text-rose-600"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
