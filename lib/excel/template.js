'use client';

import ExcelJS from 'exceljs';
import { PHONE_DIGITS } from './import';
import { downloadBlob } from './export';

// Excel only keeps a dropdown on cells that carry the rule, so the rule is
// stamped on a fixed block of rows. Beyond it the column still imports, it just
// stops offering the list.
const LAST_VALIDATED_ROW = 500;

/**
 * The import template.
 *
 * Handing someone a file with the right headers already in it removes the whole
 * class of "لم يُعثر على عمود الاسم" failures, which were the common way an
 * import went wrong.
 *
 * The guidance sits *above* the table rather than below it: the importer finds
 * the header row and reads only what follows, so instructions can never be
 * mistaken for students the way trailing notes used to be. Example rows stay in
 * the table where they illustrate the format, marked «مثال:» so the importer
 * drops them too.
 *
 * The groups of the trip being imported into are baked in as a dropdown on the
 * «المجموعة» column, so the group is chosen per student inside the file instead
 * of one group for the whole upload.
 */
export async function downloadStudentTemplate(scheduleName = '', groups = []) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('الطلاب', { views: [{ rightToLeft: true }] });

  // Widths only: a `header` here would pin the table to row 1 and leave the
  // guidance nowhere to go but underneath it.
  sheet.columns = [
    { key: 'name', width: 32 },
    { key: 'group', width: 24 },
    { key: 'phone', width: 20 },
    { key: 'pin', width: 14 },
  ];

  const guidance = [
    'املأ الجدول بالأسفل ثم ارفع الملف في صفحة «استيراد Excel».',
    '«الاسم» مطلوب — والاسم الكامل أفضل. «المجموعة» و«الجوال» و«الرمز» اختيارية.',
    groups.length > 0
      ? 'اختر «المجموعة» من القائمة المنسدلة، أو اتركها فارغة لطالب بلا مجموعة.'
      : 'لا توجد مجموعات في هذه الرحلة بعد، لذلك سيُضاف الجميع بلا مجموعة.',
    `«الجوال» ${PHONE_DIGITS} أرقام. «الرمز» 6 أرقام، أو اتركه فارغاً ليُنشأ رمز مؤقت تلقائياً.`,
    'هذه الملاحظات وصفوف «مثال:» تُتجاهل عند الاستيراد، لا حاجة لحذفها.',
  ];

  guidance.forEach((line) => {
    const row = sheet.addRow([line]);
    row.font = { italic: true, color: { argb: 'FF6B7391' }, size: 10 };
  });
  sheet.addRow([]);

  const header = sheet.addRow(['الاسم', 'المجموعة', 'الجوال', 'الرمز']);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2A3563' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  sheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: header.number }];

  const sample = groups[0]?.name ?? '';
  sheet.addRow({ name: 'مثال: عبدالله محمد', group: sample, phone: '12345678', pin: '' });
  sheet.addRow({ name: 'مثال: أحمد علي', group: sample, phone: '87654321', pin: '482913' });

  // Phone and PIN are text: Excel would otherwise eat a leading zero and render
  // a six-digit PIN in scientific notation.
  sheet.getColumn('phone').numFmt = '@';
  sheet.getColumn('pin').numFmt = '@';

  if (groups.length > 0) addGroupDropdown(workbook, sheet, groups, header.number + 1);

  const buffer = await workbook.xlsx.writeBuffer();
  const suffix = scheduleName ? `-${scheduleName.replace(/[\\/:*?"<>|]/g, '')}` : '';
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `قالب-الطلاب${suffix}.xlsx`,
  );
}

/**
 * Back the «المجموعة» column with a real Excel list.
 *
 * The names live on a hidden sheet behind a defined name rather than inline in
 * the rule: an inline list is capped at 255 characters and splits on commas,
 * which a group called "الفوج الأول, ب" would quietly break.
 */
function addGroupDropdown(workbook, sheet, groups, firstRow) {
  const lookup = workbook.addWorksheet('Groups', { state: 'veryHidden' });
  groups.forEach((g, i) => {
    lookup.getCell(i + 1, 1).value = g.name;
  });
  workbook.definedNames.add(`Groups!$A$1:$A$${groups.length}`, 'GroupNames');

  for (let r = firstRow; r <= LAST_VALIDATED_ROW; r += 1) {
    sheet.getCell(r, 2).dataValidation = {
      type: 'list',
      allowBlank: true,
      // A bare name, no leading "=": Excel reads the element as a formula
      // already and rejects the sheet if the sign is written out.
      formulae: ['GroupNames'],
      showErrorMessage: true,
      errorStyle: 'error',
      errorTitle: 'مجموعة غير معروفة',
      error: 'اختر مجموعة من القائمة، أو اترك الخلية فارغة.',
    };
  }
}
