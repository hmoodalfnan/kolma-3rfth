import ExcelJS from 'exceljs';

const MAX_ROWS = 5000;
const MAX_COLUMNS = 10;

// The template puts its guidance above the table, so the header is not on row 1
// and has to be looked for.
const HEADER_SCAN_ROWS = 12;

// Rows the template ships as a demonstration. They are marked in the file
// itself rather than guessed at, so nothing an admin actually typed is dropped.
const EXAMPLE_PREFIX = /^مثال\s*:/;

/** A local mobile number, as typed, with no country code in front of it. */
export const PHONE_DIGITS = 8;

const NAME_HEADERS = ['الاسم', 'الأسم', 'اسم الطالب', 'name', 'full_name', 'student'];
const PIN_HEADERS = ['الرمز', 'الرمز السري', 'كلمة المرور', 'pin', 'password', 'code'];
const PHONE_HEADERS = ['الجوال', 'الهاتف', 'رقم الجوال', 'الواتساب', 'phone', 'mobile', 'whatsapp'];
const GROUP_HEADERS = ['المجموعة', 'مجموعة', 'الفوج', 'group', 'group_name', 'team'];

/**
 * Reduce a typed phone number to the digits wa.me needs.
 *
 * wa.me takes an international number with no plus, spaces or dashes. People
 * type 05xxxxxxxx locally, so a leading 0 is swapped for the country code and a
 * leading + is dropped. Anything that does not end up looking like a real number
 * is discarded rather than guessed at — a wrong number is worse than none.
 */
export function normalizePhone(raw, countryCode = '966') {
  const digits = String(raw ?? '').replace(/[^0-9+]/g, '');
  if (!digits) return '';

  let out = digits.replace(/^\+/, '');
  if (out.startsWith('00')) out = out.slice(2);
  else if (out.startsWith('0')) out = countryCode + out.slice(1);
  else if (out.length <= 10 && !out.startsWith(countryCode)) out = countryCode + out;

  return /^[0-9]{10,15}$/.test(out) ? out : '';
}

const normalizeHeader = (v) => String(v ?? '').trim().toLowerCase();
const tidy = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
const matchKey = (v) => tidy(v).toLowerCase();

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
 * Find the header row and the column each field landed in.
 *
 * Looking for the name header instead of assuming row 1 lets the template carry
 * its instructions above the table: guidance text can never be mistaken for a
 * student, because everything above the header is simply not read.
 */
function locateColumns(sheet) {
  const limit = Math.min(sheet.rowCount, HEADER_SCAN_ROWS);

  for (let r = 1; r <= limit; r += 1) {
    const cols = { name: 0, pin: 0, phone: 0, group: 0 };

    sheet.getRow(r).eachCell((cell, colNumber) => {
      const header = normalizeHeader(cellText(cell).text);
      const is = (list) => list.some((h) => header === h.toLowerCase());
      if (!cols.name && is(NAME_HEADERS)) cols.name = colNumber;
      if (!cols.pin && is(PIN_HEADERS)) cols.pin = colNumber;
      if (!cols.phone && is(PHONE_HEADERS)) cols.phone = colNumber;
      if (!cols.group && is(GROUP_HEADERS)) cols.group = colNumber;
    });

    if (cols.name) return { headerRow: r, ...cols };
  }

  return null;
}

/**
 * Read the sheet into editable drafts.
 *
 * Nothing is judged here beyond "is this a row at all" — every usable row comes
 * back so the admin can see and repair it on screen. `validateDrafts` decides
 * what is wrong with each one, and it runs again after every edit.
 */
export async function parseStudentWorkbook(buffer) {
  const fail = (message) => ({ drafts: [], error: message });
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return fail('الملف غير صالح أو تالف');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return fail('لا توجد أوراق في الملف');
  if (sheet.actualColumnCount > MAX_COLUMNS) {
    return fail(`عدد الأعمدة كبير جداً (الحد ${MAX_COLUMNS})`);
  }
  if (sheet.actualRowCount > MAX_ROWS + 1) {
    return fail(`عدد الصفوف كبير جداً (الحد ${MAX_ROWS})`);
  }

  const cols = locateColumns(sheet);
  if (!cols) return fail('لم يُعثر على عمود «الاسم» في الملف');

  const drafts = [];

  for (let r = cols.headerRow + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const read = (col) => (col ? cellText(row.getCell(col)) : { text: '', formula: false });

    const name = read(cols.name);
    const group = read(cols.group);
    const phone = read(cols.phone);
    const pin = read(cols.pin);
    const cells = [name, group, phone, pin];

    // A row with nothing in any column is spacing, not a student.
    if (cells.every((c) => !c.text.trim() && !c.formula)) continue;
    if (EXAMPLE_PREFIX.test(name.text.trim())) continue;

    drafts.push({
      id: `row-${r}`,
      rowNumber: r,
      full_name: tidy(name.text),
      group: tidy(group.text),
      phone: phone.text.trim(),
      pin: pin.text.trim(),
      // Formulas are never evaluated, so the cell arrives blank. The row is held
      // back until a human retypes the value.
      formula: cells.some((c) => c.formula),
    });
  }

  return { drafts, error: '' };
}

/**
 * Judge every draft and resolve its group, returning the same rows enriched
 * with what is wrong with them.
 *
 * Errors hold a row back from the import; warnings only ask the admin to look.
 * Pure and re-run on every keystroke, so a row that gets fixed on screen stops
 * being a problem straight away.
 */
export function validateDrafts(drafts, groups = []) {
  const byName = new Map(groups.map((g) => [matchKey(g.name), g]));
  const seen = new Map();

  return drafts.map((draft) => {
    const errors = [];
    const warnings = [];

    const full_name = tidy(draft.full_name);
    const group = tidy(draft.group);
    const phone = String(draft.phone ?? '').trim();
    const pin = String(draft.pin ?? '').trim();

    if (draft.formula) {
      errors.push('الخلية كانت تحتوي على صيغة — أعد كتابة القيم يدوياً');
    }

    if (!full_name) errors.push('الاسم مطلوب');
    else if (full_name.length > 120) errors.push('الاسم طويل جداً (الحد 120 حرفاً)');
    else if (seen.has(matchKey(full_name))) {
      errors.push(`اسم مكرر مع الصف ${seen.get(matchKey(full_name))}`);
    } else if (!full_name.includes(' ')) {
      warnings.push('الاسم كلمة واحدة — هل تريد إضافته بالاسم الأول فقط؟');
    }

    if (full_name && !seen.has(matchKey(full_name))) seen.set(matchKey(full_name), draft.rowNumber);

    if (pin && !/^[0-9]{6}$/.test(pin)) {
      errors.push(
        /[^0-9]/.test(pin) ? 'الرمز يجب أن يكون أرقاماً فقط' : 'الرمز يجب أن يكون 6 أرقام',
      );
    }

    // Separators people type by habit are fine; anything else is a typo worth
    // stopping for, because a wrong number sends the PIN to a stranger.
    const bare = phone.replace(/[\s()+-]/g, '');
    if (phone && /[^0-9]/.test(bare)) errors.push('رقم الجوال يحتوي على حروف أو رموز');
    else if (phone && bare.length !== PHONE_DIGITS) {
      errors.push(`رقم الجوال يجب أن يكون ${PHONE_DIGITS} أرقام`);
    }

    let matched = null;
    if (group) {
      matched = byName.get(matchKey(group)) ?? null;
      if (!matched) errors.push(`مجموعة غير معروفة: «${group}»`);
    }

    return {
      // Raw, exactly as typed. The editor binds to these, and tidying them here
      // would delete the space the moment someone types one.
      ...draft,
      group_id: matched?.id ?? null,
      group_name: matched?.name ?? '',
      // Cleaned forms, ready to send: the name the server will store, and the
      // digits wa.me needs.
      student: { full_name, pin: pin || undefined },
      phone_link: normalizePhone(bare),
      errors,
      warnings,
    };
  });
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
