'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Select } from '@/components/ui/Field';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import { BoardTable, RankBadge, StudentName } from '@/components/boards/BoardTable';
import { PerQuestionBoard } from './PerQuestionBoard';
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
  const blur = schedule.blur_leaderboard_names;

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
        <StudentName
          name={row.full_name}
          blurred={blur}
          className="block truncate font-semibold"
        />
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
                <StudentName name={r.full_name} blurred={blur} />
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

      <StudentBreakdown student={open} schedule={schedule} onClose={() => setOpen(null)} />
    </Panel>
  );
}

const UNGROUPED = '__ungrouped__';

function GroupsBoard({ schedule, onError }) {
  const [rows, setRows] = useState(null);
  const [students, setStudents] = useState([]);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const blur = schedule.blur_leaderboard_names;

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

  // Students with no group are invisible to v_group_totals, which groups by
  // group_id — so a whole bucket of people simply did not appear anywhere on
  // this screen. They are folded in as a pseudo-group, ranked alongside the
  // real ones but marked as not being one.
  const withUngrouped = useMemo(() => {
    if (!rows) return null;

    const loose = students.filter((s) => !s.group_id);
    if (loose.length === 0) return rows;

    const total = loose.reduce((sum, s) => sum + Number(s.total_points), 0);
    const bucket = {
      group_id: UNGROUPED,
      group_name: 'بدون مجموعة',
      member_count: loose.length,
      total_points: total,
      group_points: 0,
      avg_points: Math.round((total / loose.length) * 10) / 10,
    };

    return rankRows(
      [...rows, bucket].sort((a, b) => Number(b.total_points) - Number(a.total_points)),
    );
  }, [rows, students]);

  const best = withUngrouped?.[0]?.total_points ? Number(withUngrouped[0].total_points) : 1;

  return (
    <Panel title="ترتيب المجموعات">
      {withUngrouped === null ? (
        <BoardTable loading rows={[]} columns={[]} />
      ) : withUngrouped.length === 0 ? (
        <EmptyState>لا توجد مجموعات ولا طلاب.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {withUngrouped.map((g) => (
            <li key={g.group_id} className="rounded-xl border border-line p-3">
              <button
                type="button"
                onClick={() => setOpen(open === g.group_id ? null : g.group_id)}
                className="flex w-full items-center gap-3 text-right"
              >
                <RankBadge rank={g.rank} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {g.group_id === UNGROUPED ? g.group_name : `مجموعة: ${g.group_name}`}
                    {g.group_id === UNGROUPED && (
                      <span className="ms-2 rounded-full bg-line px-2 py-0.5 text-[10px] font-bold text-muted">
                        ليست مجموعة
                      </span>
                    )}
                  </span>
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
                    .filter((s) =>
                      g.group_id === UNGROUPED ? !s.group_id : s.group_id === g.group_id,
                    )
                    .sort((a, b) => Number(b.total_points) - Number(a.total_points))
                    .map((s) => (
                      <li key={s.student_id}>
                        <button
                          type="button"
                          onClick={() => setDetail(s)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-right hover:bg-chip"
                        >
                          <StudentName
                            name={s.full_name}
                            blurred={blur}
                            className="min-w-0 truncate"
                          />
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="font-semibold tabular-nums">
                              {Number(s.total_points)}
                            </span>
                            <span aria-hidden="true" className="text-muted">
                              ‹
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <StudentBreakdown student={detail} schedule={schedule} onClose={() => setDetail(null)} />
    </Panel>
  );
}
