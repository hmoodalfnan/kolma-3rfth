'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useSchedule } from '@/lib/manage/useSchedule';
import {
  listGroups,
  listStudents,
  listQuestions,
  listGrants,
  listAnswersForSchedule,
  post,
} from '@/lib/manage/api';
import { fetchStudentTotals, fetchGroupTotals } from '@/lib/boards/queries';
import { buildWorkbook, downloadBlob } from '@/lib/excel/export';
import { fetchAuditLog } from '@/lib/audit/query';
import { todayInRiyadh } from '@/lib/schedule-time/day';

const SHEETS = [
  { key: 'summary', label: 'ملخص الطلاب' },
  { key: 'daily', label: 'السجل اليومي' },
  { key: 'ledger', label: 'سجل النقاط' },
  { key: 'groups', label: 'المجموعات' },
  { key: 'audit', label: 'سجل العمليات' },
];

export function ExportScreen() {
  const { current } = useSchedule();
  const toast = useToast();
  const [selected, setSelected] = useState({
    summary: true,
    daily: true,
    ledger: true,
    groups: true,
    audit: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!current) return <EmptyState>اختر رحلة أولاً.</EmptyState>;

  async function run() {
    setBusy(true);
    setError('');

    try {
      const client = getBrowserClient();
      const [groups, students, questions, totals, groupTotals] = await Promise.all([
        listGroups(current.id),
        listStudents(current.id),
        listQuestions(current.id),
        fetchStudentTotals(client, { scheduleId: current.id }),
        fetchGroupTotals(client, { scheduleId: current.id }),
      ]);

      const answers = selected.daily
        ? await listAnswersForSchedule(students.map((s) => s.id))
        : [];

      const rawGrants = selected.ledger ? await listGrants(current.id, 5000) : [];
      const grants = rawGrants.map((g) => ({
        created_at: g.created_at,
        points: g.points,
        note: g.note,
        student_name: g.students?.full_name ?? '',
        group_name: g.groups?.name ?? '',
        criterion_name: g.criteria?.name ?? '',
      }));

      const auditEntries = selected.audit
        ? (await fetchAuditLog(client, { scheduleId: current.id, limit: 1000 })).rows
        : [];

      const blob = await buildWorkbook({
        schedule: current,
        groups,
        students,
        questions,
        answers,
        grants,
        totals,
        groupTotals,
        auditEntries,
        sheets: selected,
      });

      const safeName = current.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40);
      downloadBlob(blob, `tracker-${safeName}-${todayInRiyadh()}.xlsx`);

      await post('/api/audit/export', {
        scheduleId: current.id,
        sheets: Object.keys(selected).filter((k) => selected[k]),
      }).catch(() => {});

      toast.push('تم تنزيل الملف', 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={`تصدير — ${current.name}`}>
      <ErrorText>{error}</ErrorText>

      <p className="mb-3 text-sm text-muted">
        يُبنى الملف داخل متصفحك ثم يُنزَّل مباشرة. أي نص يبدأ بعلامة معادلة يُعطَّل حتى لا يعمل
        كصيغة داخل Excel.
      </p>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">الأوراق المطلوبة</legend>
        {SHEETS.map((s) => (
          <label key={s.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected[s.key]}
              onChange={(e) => setSelected({ ...selected, [s.key]: e.target.checked })}
              className="size-5 accent-[color:var(--color-navy-700)]"
            />
            {s.label}
          </label>
        ))}
      </fieldset>

      <div className="mt-4">
        <Button
          loading={busy}
          disabled={!Object.values(selected).some(Boolean)}
          onClick={run}
        >
          تصدير Excel
        </Button>
      </div>
    </Panel>
  );
}
