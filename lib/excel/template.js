'use client';

import ExcelJS from 'exceljs';
import { downloadBlob } from './export';

/**
 * The import template.
 *
 * Handing someone a file with the right headers already in it removes the whole
 * class of "لم يُعثر على عمود الاسم" failures, which were the common way an
 * import went wrong. Two example rows show the expected shape of each column and
 * are ignored on import because the parser skips rows it cannot use — but they
 * are labelled anyway so nobody imports the examples by accident.
 */
export async function downloadStudentTemplate(scheduleName = '') {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('الطلاب', { views: [{ rightToLeft: true }] });

  sheet.columns = [
    { header: 'الاسم', key: 'name', width: 32 },
    { header: 'الجوال', key: 'phone', width: 20 },
    { header: 'الرمز', key: 'pin', width: 14 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2A3563' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  sheet.addRow({ name: 'مثال: عبدالله محمد', phone: '0501234567', pin: '' });
  sheet.addRow({ name: 'مثال: أحمد علي', phone: '0559876543', pin: '482913' });

  // Phone and PIN are text: Excel would otherwise eat the leading zero of
  // 05xxxxxxxx and render a six-digit PIN in scientific notation.
  sheet.getColumn('phone').numFmt = '@';
  sheet.getColumn('pin').numFmt = '@';

  const notes = sheet.addRow([]);
  sheet.addRow(['احذف صفوف المثال قبل الاستيراد.']);
  sheet.addRow(['«الاسم» مطلوب. «الجوال» و«الرمز» اختياريان.']);
  sheet.addRow(['اترك «الرمز» فارغاً ليُنشأ رمز مؤقت تلقائياً.']);
  sheet.addRow(['«الجوال» يُستخدم لإنشاء رابط واتساب فقط ولا يُحفظ في النظام.']);

  for (let r = notes.number; r <= sheet.rowCount; r += 1) {
    sheet.getRow(r).font = { italic: true, color: { argb: 'FF6B7391' }, size: 10 };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const suffix = scheduleName ? `-${scheduleName.replace(/[\\/:*?"<>|]/g, '')}` : '';
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `قالب-الطلاب${suffix}.xlsx`,
  );
}
