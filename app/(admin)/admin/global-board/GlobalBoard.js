'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { Panel, ErrorText } from '@/components/manage/Panel';
import { BoardTable, RankBadge } from '@/components/boards/BoardTable';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useSchedule } from '@/lib/manage/useSchedule';
import { fetchGlobalBoard } from '@/lib/boards/global';
import { rankRows } from '@/lib/boards/queries';
import { buildWorkbook, downloadBlob } from '@/lib/excel/export';
import { sanitizeCell } from '@/lib/excel/sanitize';
import { todayInRiyadh } from '@/lib/schedule-time/day';
import ExcelJS from 'exceljs';

const GROUP_BY = [
  { value: 'student', label: 'حسب الطالب' },
  { value: 'name', label: 'حسب الاسم (عبر الرحلات)' },
  { value: 'group', label: 'حسب المجموعة' },
  { value: 'schedule', label: 'حسب الرحلة' },
];

export function GlobalBoard() {
  const { schedules } = useSchedule();
  const toast = useToast();

  const [scheduleIds, setScheduleIds] = useState([]);
  const [groupIds, setGroupIds] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupBy, setGroupBy] = useState('student');
  const [sortKey, setSortKey] = useState('total_points');
  const [sortDir, setSortDir] = useState('desc');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getBrowserClient()
      .from('groups')
      .select('id, name, schedule_id')
      .order('name')
      .then(({ data }) => setGroups(data ?? []));
  }, []);

  const load = useCallback(async () => {
    setResult(null);
    try {
      setResult(
        await fetchGlobalBoard(getBrowserClient(), {
          scheduleIds,
          groupIds,
          groupBy,
          sortKey,
          sortDir,
        }),
      );
    } catch (err) {
      setError(err.message);
      setResult({ rows: [], totals: { students: 0, points: 0, schedules: 0 } });
    }
  }, [scheduleIds, groupIds, groupBy, sortKey, sortDir]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSort(key) {
    if (key === sortKey) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const visibleGroups = groups.filter(
    (g) => scheduleIds.length === 0 || scheduleIds.includes(g.schedule_id),
  );

  const rows = result ? rankRows(result.rows, 'total_points') : [];

  async function exportView() {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('الصدارة', { views: [{ rightToLeft: true }] });
    sheet.addRow(['#', 'الاسم', 'المجموعة', 'الرحلة', 'نقاط البنود', 'نقاط التقييم', 'الإجمالي']);
    sheet.getRow(1).font = { bold: true };

    for (const r of rows) {
      sheet.addRow(
        [
          r.rank,
          r.full_name,
          r.group_name ?? '—',
          r.schedule_name ?? '—',
          Number(r.answer_points),
          Number(r.grant_points),
          Number(r.total_points),
        ].map(sanitizeCell),
      );
    }
    sheet.columns.forEach((c) => {
      c.width = 20;
    });

    const buffer = await wb.xlsx.writeBuffer();
    downloadBlob(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `tracker-global-${todayInRiyadh()}.xlsx`,
    );
    toast.push('تم تنزيل النتيجة المعروضة', 'success');
  }

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>

      <Panel title="الصدارة العامة عبر كل الرحلات">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="الرحلات" htmlFor="fsch" hint="اترك بدون تحديد لتشمل الكل">
            <select
              id="fsch"
              multiple
              size={4}
              value={scheduleIds}
              onChange={(e) =>
                setScheduleIds([...e.target.selectedOptions].map((o) => o.value))
              }
              className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm"
            >
              {(schedules ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="المجموعات" htmlFor="fgrp" hint="تتغيّر حسب الرحلات المحددة">
            <select
              id="fgrp"
              multiple
              size={4}
              value={groupIds}
              onChange={(e) => setGroupIds([...e.target.selectedOptions].map((o) => o.value))}
              className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm"
            >
              {visibleGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="space-y-3">
            <Field label="التجميع" htmlFor="fgb">
              <Select id="fgb" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                {GROUP_BY.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex gap-2">
              <Button
                tone="outline"
                onClick={() => {
                  setScheduleIds([]);
                  setGroupIds([]);
                  setGroupBy('student');
                }}
              >
                مسح الفلاتر
              </Button>
              <Button tone="gold" onClick={exportView} disabled={rows.length === 0}>
                تصدير
              </Button>
            </div>
          </div>
        </div>

        {result && (
          <p className="mt-3 text-sm text-muted">
            {result.totals.students} طالباً · {result.totals.schedules} رحلة ·{' '}
            {result.totals.points} نقطة إجمالاً
          </p>
        )}
      </Panel>

      <Panel title="النتائج">
        <BoardTable
          loading={result === null}
          rows={rows}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          mobileCard={(row) => (
            <div className="flex items-center gap-3 rounded-xl border border-line p-3">
              <RankBadge rank={row.rank} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{row.full_name}</span>
                <span className="block truncate text-xs text-muted">
                  {row.group_name ?? 'بدون مجموعة'} · بنود {Number(row.answer_points ?? 0)} · تقييم{' '}
                  {Number(row.grant_points ?? 0)}
                </span>
              </span>
              <span className="shrink-0 text-lg font-bold tabular-nums text-brand" dir="ltr">
                {Number(row.total_points)}
              </span>
            </div>
          )}
          columns={[
            { key: 'rank', label: '#', sortable: false, render: (r) => <RankBadge rank={r.rank} /> },
            {
              key: 'full_name',
              label: groupBy === 'student' || groupBy === 'name' ? 'الطالب' : 'العنصر',
              render: (r) => <span className="font-semibold">{r.full_name}</span>,
            },
            { key: 'group_name', label: 'المجموعة', render: (r) => r.group_name ?? '—' },
            {
              key: 'schedule_name',
              label: 'الرحلة',
              render: (r) =>
                r.schedule_count > 1 ? `${r.schedule_count} رحلات` : (r.schedule_name ?? '—'),
            },
            { key: 'answer_points', label: 'نقاط البنود', render: (r) => Number(r.answer_points) },
            { key: 'grant_points', label: 'نقاط التقييم', render: (r) => Number(r.grant_points) },
            {
              key: 'total_points',
              label: 'الإجمالي',
              render: (r) => (
                <span className="font-bold tabular-nums text-brand">
                  {Number(r.total_points)}
                </span>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}
