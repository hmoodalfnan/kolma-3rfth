'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal, ModalActions } from '@/components/ui/Modal';
import { Panel, EmptyState } from '@/components/manage/Panel';
import { BoardTable, RankBadge } from '@/components/boards/BoardTable';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchStudentTotals, fetchQuestionLeaders, rankRows } from '@/lib/boards/queries';
import { listQuestions } from '@/lib/manage/api';
import { groupBySection } from '@/lib/questions/active';

/**
 * Leaders across any set of بنود.
 *
 * Was one dropdown, one بند. Picking a whole قسم answers a question the single
 * select could not — who is strongest on the sunan overall — so selection is a
 * multi-select grouped by قسم, with a select-all per قسم.
 *
 * The totals for the whole trip are fetched once and summed in the browser:
 * changing the selection is then instant, and the payload is one row per student
 * per بند either way.
 */
export function PerQuestionBoard({ schedule, onError }) {
  const [questions, setQuestions] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [rows, setRows] = useState(null);
  const [students, setStudents] = useState([]);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listQuestions(schedule.id),
      fetchStudentTotals(getBrowserClient(), { scheduleId: schedule.id }),
    ])
      .then(([q, s]) => {
        if (!alive) return;
        setQuestions(q);
        setStudents(s);
        if (q[0]) setSelected(new Set([q[0].id]));
      })
      .catch((err) => alive && onError(err.message));
    return () => {
      alive = false;
    };
  }, [schedule.id, onError]);

  const load = useCallback(async () => {
    setRows(null);
    try {
      setRows(await fetchQuestionLeaders(getBrowserClient(), { scheduleId: schedule.id, limit: 5000 }));
    } catch (err) {
      onError(err.message);
      setRows([]);
    }
  }, [schedule.id, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const nameOf = useMemo(() => {
    const map = new Map(students.map((s) => [s.student_id, s]));
    return (id) => map.get(id);
  }, [students]);

  const sections = useMemo(() => (questions ? groupBySection(questions) : []), [questions]);

  const summed = useMemo(() => {
    if (!rows) return null;
    const totals = new Map();

    for (const row of rows) {
      if (!selected.has(row.question_id)) continue;
      const current = totals.get(row.student_id) ?? {
        student_id: row.student_id,
        times_completed: 0,
        points: 0,
      };
      current.times_completed += Number(row.times_completed ?? 0);
      current.points += Number(row.points ?? 0);
      totals.set(row.student_id, current);
    }

    return [...totals.values()].sort(
      (a, b) => b.points - a.points || b.times_completed - a.times_completed,
    );
  }, [rows, selected]);

  if (questions === null) return <BoardTable loading rows={[]} columns={[]} />;
  if (questions.length === 0) return <EmptyState>لا توجد بنود في هذه الرحلة.</EmptyState>;

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleSection = (items) => {
    const ids = items.map((q) => q.id);
    const allOn = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    for (const id of ids) {
      if (allOn) next.delete(id);
      else next.add(id);
    }
    setSelected(next);
  };

  const ranked = rankRows(summed ?? [], 'points');
  const chosen = questions.filter((q) => selected.has(q.id));

  return (
    <Panel
      title="الأوائل حسب البند"
      action={<Button tone="outline" onClick={() => setPicking(true)}>اختيار البنود ({selected.size})</Button>}
    >
      <p className="mb-3 text-sm text-muted">
        {chosen.length === 0
          ? 'لم تختر أي بند بعد.'
          : chosen.length === 1
            ? chosen[0].title
            : `مجموع ${chosen.length} بنود: ${chosen.map((q) => q.title).join('، ')}`}
      </p>

      <Modal
        open={picking}
        onClose={() => setPicking(false)}
        title="اختر البنود"
        description="يمكن اختيار قسم كامل أو بنوداً متفرقة، وتُجمع نقاطها معاً."
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            tone="outline"
            className="min-h-0 px-3 py-1.5 text-xs"
            onClick={() => setSelected(new Set(questions.map((q) => q.id)))}
          >
            اختيار الكل
          </Button>
          <Button
            tone="ghost"
            className="min-h-0 px-3 py-1.5 text-xs"
            onClick={() => setSelected(new Set())}
          >
            إلغاء الكل
          </Button>
        </div>

        <div className="space-y-4">
          {sections.map(({ section, items }) => {
            const allOn = items.every((q) => selected.has(q.id));
            return (
              <div key={section}>
                <label className="flex cursor-pointer items-center gap-2 border-b border-line pb-1.5">
                  <input
                    type="checkbox"
                    checked={allOn}
                    onChange={() => toggleSection(items)}
                    className="accent-[color:var(--color-accent)]"
                  />
                  <span className="text-sm font-bold text-brand">{section}</span>
                  <span className="text-xs text-muted">({items.length})</span>
                </label>

                <ul className="mt-1.5 space-y-1">
                  {items.map((q) => (
                    <li key={q.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-chip">
                        <input
                          type="checkbox"
                          checked={selected.has(q.id)}
                          onChange={() => toggle(q.id)}
                          className="accent-[color:var(--color-accent)]"
                        />
                        {q.title}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <ModalActions>
          <Button onClick={() => setPicking(false)}>تم</Button>
        </ModalActions>
      </Modal>

      <BoardTable
        loading={rows === null}
        rows={ranked}
        empty="لا توجد إجابات للبنود المختارة بعد."
        mobileCard={(r) => (
          <div className="flex items-center gap-3 rounded-xl border border-line p-3">
            <RankBadge rank={r.rank} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {nameOf(r.student_id)?.full_name ?? '—'}
              </span>
              <span className="block truncate text-xs text-muted">
                مجموعة: {nameOf(r.student_id)?.group_name ?? 'بدون مجموعة'} · التزم{' '}
                {r.times_completed} مرة
              </span>
            </span>
            <span className="shrink-0 text-lg font-bold tabular-nums text-brand" dir="ltr">
              {r.points}
            </span>
          </div>
        )}
        columns={[
          { key: 'rank', label: '#', render: (r) => <RankBadge rank={r.rank} /> },
          {
            key: 'student',
            label: 'الطالب',
            render: (r) => (
              <span className="font-semibold">{nameOf(r.student_id)?.full_name ?? '—'}</span>
            ),
          },
          {
            key: 'group',
            label: 'المجموعة',
            render: (r) => nameOf(r.student_id)?.group_name ?? 'بدون مجموعة',
          },
          { key: 'times_completed', label: 'مرات الالتزام', render: (r) => r.times_completed },
          {
            key: 'points',
            label: 'النقاط',
            render: (r) => <span className="font-bold tabular-nums text-brand">{r.points}</span>,
          },
        ]}
      />
    </Panel>
  );
}
