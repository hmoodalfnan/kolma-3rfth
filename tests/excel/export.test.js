import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbookBuffer } from '@/lib/excel/export';

const schedule = {
  id: 'sch1',
  name: 'رحلة الصيف',
  start_date: '2026-08-01',
  end_date: '2026-08-02',
};
const groups = [{ id: 'g1', name: 'غرفة 101' }];
const questions = [
  {
    id: 'q1',
    title: 'صلاة الوتر',
    type: 'bool',
    config: {},
    points: 5,
    sort_order: 1,
    active_weekdays: null,
    active_from: null,
    active_to: null,
    archived_at: null,
  },
];
const students = [
  { id: 's1', full_name: 'محمد علي', group_id: 'g1' },
  { id: 's2', full_name: '=cmd|calc', group_id: 'g1' },
];
const answers = [{ student_id: 's1', question_id: 'q1', entry_date: '2026-08-01', value: true }];
const totals = [
  { student_id: 's1', answer_points: 5, grant_points: 3, total_points: 8 },
  { student_id: 's2', answer_points: 0, grant_points: 0, total_points: 0 },
];
const groupTotals = [
  {
    group_id: 'g1',
    group_name: 'غرفة 101',
    member_count: 2,
    member_points: 8,
    group_points: 0,
    total_points: 8,
    avg_points: 4,
  },
];

// Fixed clock so the daily range does not depend on the day the suite runs.
const now = new Date('2026-08-05T09:00:00Z');
const base = { schedule, groups, students, questions, answers, totals, groupTotals, now };

async function readBack(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

describe('buildWorkbookBuffer', () => {
  it('produces the requested sheets', async () => {
    const wb = await readBack(await buildWorkbookBuffer(base));
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'ملخص الطلاب',
      'السجل اليومي',
      'سجل النقاط',
      'المجموعات',
    ]);
  });

  it('includes the audit sheet only when asked', async () => {
    const wb = await readBack(
      await buildWorkbookBuffer({
        ...base,
        auditEntries: [
          {
            created_at: '2026-08-01T10:00:00Z',
            actor_label: 'mohammed',
            actor_role: 'super_admin',
            entity_type: 'schedule',
            action: 'create',
          },
        ],
        sheets: { summary: true, daily: false, ledger: false, groups: false, audit: true },
      }),
    );
    expect(wb.worksheets.map((w) => w.name)).toContain('سجل العمليات');
  });

  it('neutralises a student name that looks like a formula', async () => {
    const wb = await readBack(await buildWorkbookBuffer(base));
    const summary = wb.getWorksheet('ملخص الطلاب');

    const names = [];
    summary.eachRow((row, n) => {
      if (n > 1) names.push(row.getCell(1).value);
    });

    expect(names).toContain("'=cmd|calc");
    expect(names).not.toContain('=cmd|calc');
  });

  it('writes one daily row per student per day', async () => {
    const wb = await readBack(await buildWorkbookBuffer(base));
    const daily = wb.getWorksheet('السجل اليومي');
    // 2 students x 2 days, plus the header row.
    expect(daily.actualRowCount).toBe(5);
  });

  it('sets right-to-left on every sheet', async () => {
    const wb = await readBack(await buildWorkbookBuffer(base));
    for (const sheet of wb.worksheets) {
      expect(sheet.views[0].rightToLeft).toBe(true);
    }
  });

  it('keeps computed points numeric so Excel can total them', async () => {
    const wb = await readBack(await buildWorkbookBuffer(base));
    const summary = wb.getWorksheet('ملخص الطلاب');
    expect(typeof summary.getRow(2).getCell(6).value).toBe('number');
  });
});
