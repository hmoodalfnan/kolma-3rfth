import ExcelJS from 'exceljs';
import { sanitizeCell } from './sanitize';
import { scoreAnswer, maxPoints } from '@/lib/points/score';
import { activeQuestionsOn } from '@/lib/questions/active';
import { scheduleDayRange, formatDayArabic } from '@/lib/schedule-time/day';

function addSheet(workbook, name, header) {
  const sheet = workbook.addWorksheet(name, { views: [{ rightToLeft: true }] });
  sheet.addRow(header.map(sanitizeCell));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2A3563' },
  };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }];
  return sheet;
}

/**
 * Build the workbook entirely in the browser. Every text cell passes through
 * sanitizeCell so a student named "=cmd" cannot become a live formula.
 */
export async function buildWorkbookBuffer({
  schedule,
  groups = [],
  students = [],
  questions = [],
  answers = [],
  grants = [],
  auditEntries = [],
  totals = [],
  groupTotals = [],
  now = new Date(),
  sheets = {
    summary: true,
    daily: true,
    ledger: true,
    groups: true,
    audit: false,
  },
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'سجل الأعمال';
  workbook.created = new Date();

  const groupName = (id) => groups.find((g) => g.id === id)?.name ?? '';
  const totalFor = (id) => totals.find((t) => t.student_id === id);

  if (sheets.summary) {
    const sheet = addSheet(workbook, 'ملخص الطلاب', [
      'الطالب',
      'المجموعة',
      'الرحلة',
      'نقاط البنود',
      'نقاط التقييم',
      'الإجمالي',
    ]);
    for (const s of students) {
      const t = totalFor(s.id);
      sheet.addRow(
        [
          s.full_name,
          groupName(s.group_id),
          schedule.name,
          Number(t?.answer_points ?? 0),
          Number(t?.grant_points ?? 0),
          Number(t?.total_points ?? 0),
        ].map(sanitizeCell),
      );
    }
    sheet.columns.forEach((c) => {
      c.width = 22;
    });
  }

  if (sheets.daily) {
    const days = scheduleDayRange(schedule, now);
    const sheet = addSheet(workbook, 'السجل اليومي', [
      'الطالب',
      'المجموعة',
      'اليوم',
      ...questions.map((q) => q.title),
      'نقاط اليوم',
      'النسبة',
    ]);

    const byKey = new Map();
    for (const a of answers) byKey.set(`${a.student_id}|${a.question_id}|${a.entry_date}`, a.value);

    for (const s of students) {
      for (const day of days) {
        const active = new Set(activeQuestionsOn(questions, day).map((q) => q.id));
        let earned = 0;
        let possible = 0;

        const cells = questions.map((q) => {
          if (!active.has(q.id)) return '—';
          const value = byKey.get(`${s.id}|${q.id}|${day}`);
          const points = scoreAnswer(q, value);
          earned += points;
          possible += maxPoints(q);
          return points;
        });

        sheet.addRow(
          [
            s.full_name,
            groupName(s.group_id),
            formatDayArabic(day),
            ...cells,
            earned,
            possible > 0 ? Math.round((earned / possible) * 1000) / 10 : 0,
          ].map(sanitizeCell),
        );
      }
    }
  }

  if (sheets.ledger) {
    const sheet = addSheet(workbook, 'سجل النقاط', [
      'التاريخ',
      'الطالب',
      'المجموعة',
      'البند',
      'النقاط',
      'ملاحظة',
      'بواسطة',
    ]);
    for (const g of grants) {
      sheet.addRow(
        [
          new Date(g.created_at).toISOString().slice(0, 16).replace('T', ' '),
          g.student_name ?? '',
          g.group_name ?? '',
          g.criterion_name ?? '',
          Number(g.points),
          g.note ?? '',
          g.created_by_label ?? '',
        ].map(sanitizeCell),
      );
    }
    sheet.columns.forEach((c) => {
      c.width = 20;
    });
  }

  if (sheets.groups) {
    const sheet = addSheet(workbook, 'المجموعات', [
      'المجموعة',
      'عدد الطلاب',
      'نقاط الأعضاء',
      'نقاط المجموعة',
      'الإجمالي',
      'المعدل',
    ]);
    for (const g of groupTotals) {
      sheet.addRow(
        [
          g.group_name,
          Number(g.member_count),
          Number(g.member_points),
          Number(g.group_points),
          Number(g.total_points),
          Number(g.avg_points),
        ].map(sanitizeCell),
      );
    }
    sheet.columns.forEach((c) => {
      c.width = 18;
    });
  }

  if (sheets.audit) {
    const sheet = addSheet(workbook, 'سجل العمليات', [
      'التاريخ',
      'المستخدم',
      'الصلاحية',
      'العنصر',
      'الإجراء',
      'قبل',
      'بعد',
    ]);
    for (const e of auditEntries) {
      sheet.addRow(
        [
          new Date(e.created_at).toISOString().slice(0, 19).replace('T', ' '),
          e.actor_label,
          e.actor_role,
          e.entity_type,
          e.action,
          e.before ? JSON.stringify(e.before) : '',
          e.after ? JSON.stringify(e.after) : '',
        ].map(sanitizeCell),
      );
    }
    sheet.columns.forEach((c) => {
      c.width = 22;
    });
  }

  return workbook.xlsx.writeBuffer();
}

/** Browser-facing wrapper. Kept separate so the builder stays testable in Node. */
export async function buildWorkbook(options) {
  const buffer = await buildWorkbookBuffer(options);
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
