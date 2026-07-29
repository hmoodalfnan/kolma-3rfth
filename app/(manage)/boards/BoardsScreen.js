'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Select } from '@/components/ui/Field';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import { BoardTable, RankBadge } from '@/components/boards/BoardTable';
import { StudentBreakdown } from '@/components/boards/StudentBreakdown';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useSchedule } from '@/lib/manage/useSchedule';
import { fetchStudentTotals, fetchGroupTotals, fetchQuestionLeaders, rankRows } from '@/lib/boards/queries';
import { listQuestions } from '@/lib/manage/api';
import { useTransientError } from '@/lib/ui/useTransientError';

const TABS = [
  { id: 'overall', label: 'الترتيب العام' },
  { id: 'groups', label: 'المجموعات' },
  { id: 'questions', label: 'حسب البند' },
];

export function BoardsScreen() {
  const { current } = useSchedule();
  const [tab, setTab] = useState('overall');
  const [error, setError] = useTransientError();

  if (!current) return <EmptyState>اختر رحلة أولاً.</EmptyState>;

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              tab === t.id ? 'bg-accent text-accent-ink' : 'bg-chip text-brand'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overall' && <OverallBoard schedule={current} onError={setError} />}
      {tab === 'groups' && <GroupsBoard schedule={current} onError={setError} />}
      {tab === 'questions' && <PerQuestionBoard schedule={current} onError={setError} />}
    </div>
  );
}

function OverallBoard({ schedule, onError }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchStudentTotals(getBrowserClient(), { scheduleId: schedule.id })
      .then((data) => alive && setRows(rankRows(data)))
      .catch((err) => {
        if (alive) {
          onError(err.message);
          setRows([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [schedule.id, onError]);

  const openRow = (row) => (
    <button
      type="button"
      onClick={() => setOpen(row)}
      className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-right"
    >
      <RankBadge rank={row.rank} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{row.full_name}</span>
        <span className="block text-xs text-muted">
          {row.group_name ?? 'بدون مجموعة'} · بنود {Number(row.answer_points)} · تقييم{' '}
          {Number(row.grant_points)}
        </span>
      </span>
      <span className="shrink-0 text-lg font-bold tabular-nums text-brand" dir="ltr">
        {Number(row.total_points)}
      </span>
      <span aria-hidden="true" className="shrink-0 text-muted">
        ‹
      </span>
    </button>
  );

  return (
    <Panel title={`الترتيب العام — ${schedule.name}`}>
      <p className="mb-2 text-xs text-muted">اضغط على اسم الطالب لعرض تفاصيل نقاطه.</p>

      <BoardTable
        loading={rows === null}
        rows={rows ?? []}
        mobileCard={openRow}
        columns={[
          { key: 'rank', label: '#', render: (r) => <RankBadge rank={r.rank} /> },
          {
            key: 'full_name',
            label: 'الطالب',
            render: (r) => (
              <button
                type="button"
                onClick={() => setOpen(r)}
                className="font-semibold underline decoration-dotted underline-offset-4 hover:text-brand"
              >
                {r.full_name}
              </button>
            ),
          },
          { key: 'group_name', label: 'المجموعة', render: (r) => r.group_name ?? '—' },
          { key: 'answer_points', label: 'نقاط البنود', render: (r) => Number(r.answer_points) },
          { key: 'grant_points', label: 'نقاط التقييم', render: (r) => Number(r.grant_points) },
          {
            key: 'total_points',
            label: 'الإجمالي',
            render: (r) => (
              <span className="font-bold tabular-nums text-brand">{Number(r.total_points)}</span>
            ),
          },
        ]}
      />

      <StudentBreakdown student={open} scheduleId={schedule.id} onClose={() => setOpen(null)} />
    </Panel>
  );
}

function GroupsBoard({ schedule, onError }) {
  const [rows, setRows] = useState(null);
  const [students, setStudents] = useState([]);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    Promise.all([
      fetchGroupTotals(getBrowserClient(), { scheduleId: schedule.id }),
      fetchStudentTotals(getBrowserClient(), { scheduleId: schedule.id }),
    ])
      .then(([g, s]) => {
        if (!alive) return;
        setRows(rankRows(g));
        setStudents(s);
      })
      .catch((err) => {
        if (alive) {
          onError(err.message);
          setRows([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [schedule.id, onError]);

  const best = rows?.[0]?.total_points ? Number(rows[0].total_points) : 1;

  return (
    <Panel title="ترتيب المجموعات">
      {rows === null ? (
        <BoardTable loading rows={[]} columns={[]} />
      ) : rows.length === 0 ? (
        <EmptyState>لا توجد مجموعات.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {rows.map((g) => (
            <li key={g.group_id} className="rounded-xl border border-line p-3">
              <button
                type="button"
                onClick={() => setOpen(open === g.group_id ? null : g.group_id)}
                className="flex w-full items-center gap-3 text-right"
              >
                <RankBadge rank={g.rank} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{g.group_name}</span>
                  <span className="block text-xs text-muted">
                    {g.member_count} طالب · معدل {Number(g.avg_points)} · نقاط جماعية{' '}
                    {Number(g.group_points)}
                  </span>
                  <span className="mt-1.5 block h-2 rounded-full bg-line" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-gold-500"
                      style={{ width: `${Math.max(2, (Number(g.total_points) / best) * 100)}%` }}
                    />
                  </span>
                </span>
                <span className="font-bold tabular-nums text-brand" dir="ltr">
                  {Number(g.total_points)}
                </span>
              </button>

              {open === g.group_id && (
                <ul className="mt-3 space-y-1 border-t border-line pt-2 text-sm">
                  {students
                    .filter((s) => s.group_id === g.group_id)
                    .map((s) => (
                      <li key={s.student_id} className="flex justify-between gap-2">
                        <span>{s.full_name}</span>
                        <span className="font-semibold tabular-nums">{Number(s.total_points)}</span>
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function PerQuestionBoard({ schedule, onError }) {
  const [questions, setQuestions] = useState(null);
  const [questionId, setQuestionId] = useState('');
  const [rows, setRows] = useState(null);
  const [students, setStudents] = useState([]);

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
        if (q[0]) setQuestionId(q[0].id);
      })
      .catch((err) => alive && onError(err.message));
    return () => {
      alive = false;
    };
  }, [schedule.id, onError]);

  const load = useCallback(async () => {
    if (!questionId) return;
    setRows(null);
    try {
      setRows(
        await fetchQuestionLeaders(getBrowserClient(), { scheduleId: schedule.id, questionId, limit: 100 }),
      );
    } catch (err) {
      onError(err.message);
      setRows([]);
    }
  }, [schedule.id, questionId, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const nameOf = useMemo(() => {
    const map = new Map(students.map((s) => [s.student_id, s]));
    return (id) => map.get(id);
  }, [students]);

  if (questions === null) return <BoardTable loading rows={[]} columns={[]} />;
  if (questions.length === 0) return <EmptyState>لا توجد بنود في هذه الرحلة.</EmptyState>;

  const ranked = rankRows(rows ?? [], 'times_completed');

  return (
    <Panel title="الأوائل في كل بند">
      <Select
        aria-label="اختر البند"
        value={questionId}
        onChange={(e) => setQuestionId(e.target.value)}
        className="mb-3 max-w-md"
      >
        {questions.map((q) => (
          <option key={q.id} value={q.id}>
            {q.title}
          </option>
        ))}
      </Select>

      <BoardTable
        loading={rows === null}
        rows={ranked}
        empty="لا توجد إجابات لهذا البند بعد."
        columns={[
          { key: 'rank', label: '#', render: (r) => <RankBadge rank={r.rank} /> },
          {
            key: 'student',
            label: 'الطالب',
            render: (r) => (
              <span className="font-semibold">{nameOf(r.student_id)?.full_name ?? '—'}</span>
            ),
          },
          { key: 'group', label: 'المجموعة', render: (r) => nameOf(r.student_id)?.group_name ?? '—' },
          { key: 'times_completed', label: 'مرات الالتزام', render: (r) => Number(r.times_completed) },
          {
            key: 'points',
            label: 'النقاط',
            render: (r) => (
              <span className="font-bold tabular-nums text-brand">{Number(r.points)}</span>
            ),
          },
        ]}
      />
    </Panel>
  );
}
