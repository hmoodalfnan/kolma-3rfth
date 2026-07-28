import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseStudentWorkbook } from '@/lib/excel/import';

async function workbook(rows, header = ['الاسم', 'الرمز']) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('الطلاب');
  ws.addRow(header);
  rows.forEach((r) => ws.addRow(r));
  return wb.xlsx.writeBuffer();
}

describe('parseStudentWorkbook', () => {
  it('parses a well-formed sheet', async () => {
    const { rows, errors } = await parseStudentWorkbook(
      await workbook([
        ['محمد علي', '482913'],
        ['أحمد محمود', '571394'],
      ]),
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ full_name: 'محمد علي', pin: '482913' });
  });

  it('accepts a sheet with only the name column', async () => {
    const { rows, errors } = await parseStudentWorkbook(
      await workbook([['محمد علي'], ['أحمد محمود']], ['الاسم']),
    );
    expect(errors).toEqual([]);
    expect(rows[0].pin).toBeUndefined();
  });

  it('accepts the English headers as aliases', async () => {
    const { rows } = await parseStudentWorkbook(
      await workbook([['Mohammed', '482913']], ['name', 'pin']),
    );
    expect(rows[0].full_name).toBe('Mohammed');
  });

  it('reports a blank name with its row number and skips the row', async () => {
    const { rows, errors } = await parseStudentWorkbook(
      await workbook([
        ['', '482913'],
        ['أحمد', '571394'],
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(errors[0]).toMatchObject({ rowNumber: 2 });
  });

  it('trims and collapses whitespace in names', async () => {
    const { rows } = await parseStudentWorkbook(await workbook([['  محمد   علي  ', '482913']]));
    expect(rows[0].full_name).toBe('محمد علي');
  });

  it('rejects a PIN that is not six digits', async () => {
    const { rows, errors } = await parseStudentWorkbook(await workbook([['محمد', '12']]));
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/6 أرقام/);
  });

  it('flags duplicate names within the file', async () => {
    const { rows, errors } = await parseStudentWorkbook(
      await workbook([['محمد علي'], ['محمد علي']], ['الاسم']),
    );
    expect(rows).toHaveLength(1);
    expect(errors[0].message).toMatch(/مكرر/);
  });

  it('rejects a cell containing a formula', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('الطلاب');
    ws.addRow(['الاسم', 'الرمز']);
    ws.addRow([{ formula: 'HYPERLINK("http://evil.example")' }, '482913']);

    const { errors } = await parseStudentWorkbook(await wb.xlsx.writeBuffer());
    expect(errors[0].message).toMatch(/صيغة/);
  });

  it('rejects a workbook with too many columns', async () => {
    const header = Array.from({ length: 12 }, (_, i) => `col${i}`);
    header[0] = 'الاسم';
    const { errors } = await parseStudentWorkbook(await workbook([], header));
    expect(errors[0].message).toMatch(/الأعمدة/);
  });

  it('reports a missing name column rather than guessing', async () => {
    const { rows, errors } = await parseStudentWorkbook(await workbook([['x']], ['شيء آخر']));
    expect(rows).toEqual([]);
    expect(errors[0].message).toMatch(/الاسم/);
  });

  it('returns a readable message for a buffer that is not a workbook', async () => {
    const { errors } = await parseStudentWorkbook(new ArrayBuffer(8));
    expect(errors[0].message).toMatch(/غير صالح|تالف/);
  });
});
