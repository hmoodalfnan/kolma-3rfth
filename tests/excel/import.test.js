import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseStudentWorkbook, validateDrafts } from '@/lib/excel/import';

async function workbook(rows, header = ['الاسم', 'الرمز'], above = []) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('الطلاب');
  above.forEach((line) => ws.addRow([line]));
  ws.addRow(header);
  rows.forEach((r) => ws.addRow(r));
  return wb.xlsx.writeBuffer();
}

const parse = async (...args) => parseStudentWorkbook(await workbook(...args));

describe('parseStudentWorkbook', () => {
  it('reads a well-formed sheet into drafts', async () => {
    const { drafts, error } = await parse([
      ['محمد علي', '482913'],
      ['أحمد محمود', '571394'],
    ]);
    expect(error).toBe('');
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ full_name: 'محمد علي', pin: '482913', rowNumber: 2 });
  });

  it('accepts a sheet with only the name column', async () => {
    const { drafts } = await parse([['محمد علي'], ['أحمد محمود']], ['الاسم']);
    expect(drafts.map((d) => d.pin)).toEqual(['', '']);
  });

  it('accepts the English headers as aliases', async () => {
    const { drafts } = await parse([['Mohammed', '482913']], ['name', 'pin']);
    expect(drafts[0].full_name).toBe('Mohammed');
  });

  it('finds the header under the guidance the template puts above it', async () => {
    const { drafts } = await parse(
      [['محمد علي', 'غرفة 101']],
      ['الاسم', 'المجموعة'],
      ['املأ الجدول بالأسفل ثم ارفع الملف.', 'هذه الملاحظات تُتجاهل عند الاستيراد.', ''],
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ full_name: 'محمد علي', group: 'غرفة 101', rowNumber: 5 });
  });

  it('leaves the template example rows out of the import', async () => {
    const { drafts } = await parse(
      [['مثال: عبدالله محمد'], ['مثال : أحمد علي'], ['محمد علي']],
      ['الاسم'],
    );
    expect(drafts.map((d) => d.full_name)).toEqual(['محمد علي']);
  });

  it('skips rows that are blank in every column', async () => {
    const { drafts } = await parse([['محمد علي'], [''], ['   '], ['أحمد']], ['الاسم']);
    expect(drafts.map((d) => d.full_name)).toEqual(['محمد علي', 'أحمد']);
  });

  it('keeps a row whose name is missing so it can be repaired', async () => {
    const { drafts } = await parse([['', '12345678']], ['الاسم', 'الجوال']);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ full_name: '', phone: '12345678' });
  });

  it('trims and collapses whitespace in names', async () => {
    const { drafts } = await parse([['  محمد   علي  ', '482913']]);
    expect(drafts[0].full_name).toBe('محمد علي');
  });

  it('marks a row holding a formula instead of reading it', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('الطلاب');
    ws.addRow(['الاسم', 'الرمز']);
    ws.addRow([{ formula: 'HYPERLINK("http://evil.example")' }, '482913']);

    const { drafts } = await parseStudentWorkbook(await wb.xlsx.writeBuffer());
    expect(drafts[0]).toMatchObject({ full_name: '', formula: true });
  });

  it('rejects a workbook with too many columns', async () => {
    const header = Array.from({ length: 12 }, (_, i) => `col${i}`);
    header[0] = 'الاسم';
    const { error } = await parse([], header);
    expect(error).toMatch(/الأعمدة/);
  });

  it('reports a missing name column rather than guessing', async () => {
    const { drafts, error } = await parse([['x']], ['شيء آخر']);
    expect(drafts).toEqual([]);
    expect(error).toMatch(/الاسم/);
  });

  it('returns a readable message for a buffer that is not a workbook', async () => {
    const { error } = await parseStudentWorkbook(new ArrayBuffer(8));
    expect(error).toMatch(/غير صالح|تالف/);
  });
});

describe('validateDrafts', () => {
  const groups = [
    { id: 'g1', name: 'غرفة 101' },
    { id: 'g2', name: 'Room 2' },
  ];

  const check = (draft) =>
    validateDrafts([{ id: 'a', rowNumber: 2, full_name: 'محمد علي', ...draft }], groups)[0];

  it('passes a complete, correct row', () => {
    const row = check({ group: 'غرفة 101', phone: '12345678', pin: '482913' });
    expect(row.errors).toEqual([]);
    expect(row.warnings).toEqual([]);
    expect(row).toMatchObject({ group_id: 'g1', group_name: 'غرفة 101' });
  });

  it('passes a row that carries nothing but a full name', () => {
    const row = check({ group: '', phone: '', pin: '' });
    expect(row.errors).toEqual([]);
    expect(row.group_id).toBeNull();
  });

  describe('the name', () => {
    it('is required even when the rest of the row is filled', () => {
      const row = check({ full_name: '', phone: '12345678' });
      expect(row.errors).toContain('الاسم مطلوب');
    });

    it('warns rather than fails when it is a single word', () => {
      const row = check({ full_name: 'محمد' });
      expect(row.errors).toEqual([]);
      expect(row.warnings[0]).toMatch(/كلمة واحدة/);
    });

    it('fails past 120 characters', () => {
      const row = check({ full_name: 'م '.repeat(80) });
      expect(row.errors[0]).toMatch(/طويل/);
    });

    it('fails the second copy of a duplicate and keeps the first', () => {
      const [first, second] = validateDrafts(
        [
          { id: 'a', rowNumber: 2, full_name: 'محمد علي' },
          { id: 'b', rowNumber: 3, full_name: '  محمد   علي ' },
        ],
        groups,
      );
      expect(first.errors).toEqual([]);
      expect(second.errors[0]).toMatch(/مكرر مع الصف 2/);
    });
  });

  describe('the PIN', () => {
    it('passes six digits', () => {
      expect(check({ pin: '482913' }).errors).toEqual([]);
    });

    it('fails fewer than six digits', () => {
      expect(check({ pin: '4829' }).errors[0]).toMatch(/6 أرقام/);
    });

    it('fails more than six digits', () => {
      expect(check({ pin: '4829135' }).errors[0]).toMatch(/6 أرقام/);
    });

    it('fails letters with a message about digits', () => {
      expect(check({ pin: '48a913' }).errors[0]).toMatch(/أرقاماً فقط/);
    });

    it('treats an empty PIN as "generate one"', () => {
      expect(check({ pin: '' }).errors).toEqual([]);
    });
  });

  describe('the phone', () => {
    it('passes eight digits', () => {
      expect(check({ phone: '12345678' }).errors).toEqual([]);
    });

    it('ignores spaces and dashes people type by habit', () => {
      expect(check({ phone: '1234-5678' }).errors).toEqual([]);
      expect(check({ phone: '1234 5678' }).errors).toEqual([]);
    });

    it('fails letters', () => {
      expect(check({ phone: '1234567a' }).errors[0]).toMatch(/حروف/);
    });

    it('fails a number that is not eight digits', () => {
      expect(check({ phone: '1234567' }).errors[0]).toMatch(/8 أرقام/);
      expect(check({ phone: '0501234567' }).errors[0]).toMatch(/8 أرقام/);
    });

    it('treats an empty phone as no phone', () => {
      expect(check({ phone: '' }).errors).toEqual([]);
    });
  });

  describe('the group', () => {
    it('resolves the written name to the group id', () => {
      expect(check({ group: 'غرفة 101' }).group_id).toBe('g1');
    });

    it('ignores case and stray spacing when matching', () => {
      expect(check({ group: '  room 2 ' }).group_id).toBe('g2');
    });

    it('fails a group this trip does not have', () => {
      const row = check({ group: 'غرفة 999' });
      expect(row.errors[0]).toMatch(/مجموعة غير معروفة/);
      expect(row.group_id).toBeNull();
    });
  });

  it('leaves the typed text alone and cleans only what it hands to the server', () => {
    const row = check({ full_name: '  خالد   سعد ', pin: '482913' });
    expect(row.full_name).toBe('  خالد   سعد ');
    expect(row.student).toEqual({ full_name: 'خالد سعد', pin: '482913' });
  });

  it('turns the phone into the digits wa.me needs', () => {
    expect(check({ phone: '1234-5678' }).phone_link).toBe('96612345678');
    expect(check({ phone: '' }).phone_link).toBe('');
  });

  it('sends no PIN at all when the column was left empty', () => {
    expect(check({ pin: '' }).student.pin).toBeUndefined();
  });

  it('holds back a row that arrived as a formula until it is retyped', () => {
    const row = check({ full_name: '', formula: true });
    expect(row.errors[0]).toMatch(/صيغة/);
  });

  it('collects every problem in a row rather than stopping at the first', () => {
    const row = check({ full_name: '', phone: 'abc', pin: '12', group: 'مجهولة' });
    expect(row.errors).toHaveLength(4);
  });
});
