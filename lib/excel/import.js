import ExcelJS from 'exceljs';

const MAX_ROWS = 5000;
const MAX_COLUMNS = 10;

const NAME_HEADERS = ['الاسم', 'الأسم', 'اسم الطالب', 'name', 'full_name', 'student'];
const PIN_HEADERS = ['الرمز', 'الرمز السري', 'كلمة المرور', 'pin', 'password', 'code'];

const normalizeHeader = (v) => String(v ?? '').trim().toLowerCase();

function cellText(cell) {
  const value = cell?.value;
  if (value === null || value === undefined) return { text: '', formula: false };
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) return { text: '', formula: true };
    if ('richText' in value) {
      return { text: value.richText.map((r) => r.text).join(''), formula: false };
    }
    if ('text' in value) return { text: String(value.text), formula: false };
    return { text: '', formula: false };
  }
  return { text: String(value), formula: false };
}

/**
 * Parse a student sheet holding exactly two meaningful columns: name and an
 * optional PIN. The group is chosen in the UI, never in the file.
 */
export async function parseStudentWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return { rows: [], errors: [{ rowNumber: 0, message: 'الملف غير صالح أو تالف' }] };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], errors: [{ rowNumber: 0, message: 'لا توجد أوراق في الملف' }] };

  if (sheet.actualColumnCount > MAX_COLUMNS) {
    return {
      rows: [],
      errors: [{ rowNumber: 0, message: `عدد الأعمدة كبير جداً (الحد ${MAX_COLUMNS})` }],
    };
  }
  if (sheet.actualRowCount > MAX_ROWS + 1) {
    return {
      rows: [],
      errors: [{ rowNumber: 0, message: `عدد الصفوف كبير جداً (الحد ${MAX_ROWS})` }],
    };
  }

  const headerRow = sheet.getRow(1);
  let nameCol = 0;
  let pinCol = 0;

  headerRow.eachCell((cell, colNumber) => {
    const header = normalizeHeader(cellText(cell).text);
    if (!nameCol && NAME_HEADERS.some((h) => header === h.toLowerCase())) nameCol = colNumber;
    if (!pinCol && PIN_HEADERS.some((h) => header === h.toLowerCase())) pinCol = colNumber;
  });

  if (!nameCol) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, message: 'لم يُعثر على عمود «الاسم» في الصف الأول' }],
    };
  }

  const rows = [];
  const errors = [];
  const seen = new Map();

  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const nameCell = cellText(row.getCell(nameCol));
    const pinCell = pinCol ? cellText(row.getCell(pinCol)) : { text: '', formula: false };

    if (nameCell.formula || pinCell.formula) {
      errors.push({ rowNumber: r, message: 'الخلية تحتوي على صيغة ولا يمكن استيرادها' });
      continue;
    }

    const name = nameCell.text.trim().replace(/\s+/g, ' ');
    const pin = pinCell.text.trim();

    if (!name && !pin) continue; // genuinely blank row
    if (!name) {
      errors.push({ rowNumber: r, message: 'الاسم فارغ' });
      continue;
    }
    if (name.length > 120) {
      errors.push({ rowNumber: r, message: 'الاسم طويل جداً (الحد 120 حرفاً)' });
      continue;
    }
    if (pin && !/^[0-9]{6}$/.test(pin)) {
      errors.push({ rowNumber: r, message: 'الرمز يجب أن يكون 6 أرقام' });
      continue;
    }
    if (seen.has(name)) {
      errors.push({ rowNumber: r, message: `اسم مكرر مع الصف ${seen.get(name)}` });
      continue;
    }

    seen.set(name, r);
    rows.push({ rowNumber: r, full_name: name, pin: pin || undefined });
  }

  return { rows, errors };
}

/** Cheap structural checks before we even hand the bytes to ExcelJS. */
export function inspectFile(file) {
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: 'حجم الملف أكبر من 2 ميجابايت' };
  if (!/\.(xlsx|csv)$/i.test(file.name)) return { ok: false, error: 'الصيغة المدعومة: xlsx أو csv' };
  return { ok: true };
}

export async function hasZipSignature(buffer) {
  const head = new Uint8Array(buffer.slice(0, 2));
  return head[0] === 0x50 && head[1] === 0x4b;
}
