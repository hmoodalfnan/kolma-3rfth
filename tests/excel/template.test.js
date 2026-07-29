import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { parseStudentWorkbook } from '@/lib/excel/import';

const captured = { blob: null, filename: '' };

vi.mock('@/lib/excel/export', () => ({
  downloadBlob: (blob, filename) => {
    captured.blob = blob;
    captured.filename = filename;
  },
}));

const { downloadStudentTemplate } = await import('@/lib/excel/template');

const groups = [
  { id: 'g1', name: 'غرفة 101' },
  { id: 'g2', name: 'الفوج الأول, ب' },
];

// jsdom's Blob has no arrayBuffer(), so the bytes come back through FileReader.
const blobBuffer = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

async function bytes(...args) {
  await downloadStudentTemplate(...args);
  return blobBuffer(captured.blob);
}

async function build(...args) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await bytes(...args));
  return workbook;
}

function headerRowOf(sheet) {
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    if (sheet.getCell(r, 1).value === 'الاسم') return r;
  }
  return 0;
}

describe('downloadStudentTemplate', () => {
  beforeEach(() => {
    captured.blob = null;
    captured.filename = '';
  });

  it('puts the group between the name and the phone', async () => {
    const sheet = (await build('رحلة الصيف', groups)).getWorksheet('الطلاب');
    const header = sheet.getRow(headerRowOf(sheet)).values;
    expect(header.slice(1)).toEqual(['الاسم', 'المجموعة', 'الجوال', 'الرمز']);
  });

  it('keeps its guidance above the table, out of the name column of the data', async () => {
    const sheet = (await build('رحلة الصيف', groups)).getWorksheet('الطلاب');
    const header = headerRowOf(sheet);

    expect(header).toBeGreaterThan(1);
    const guidance = [];
    for (let r = 1; r < header; r += 1) {
      if (sheet.getCell(r, 1).value) guidance.push(String(sheet.getCell(r, 1).value));
    }
    expect(guidance.join(' ')).toMatch(/تُتجاهل عند الاستيراد/);
  });

  it('offers the trip groups as a dropdown on the group column', async () => {
    const sheet = (await build('رحلة الصيف', groups)).getWorksheet('الطلاب');
    const firstData = headerRowOf(sheet) + 1;

    const validation = sheet.getCell(firstData, 2).dataValidation;
    expect(validation).toMatchObject({ type: 'list', allowBlank: true });
    expect(validation.formulae).toEqual(['GroupNames']);

    // Reaching far enough down that a real roster stays inside the dropdown.
    expect(sheet.getCell(500, 2).dataValidation?.type).toBe('list');
  });

  it('keeps the group names on a hidden sheet so commas cannot split them', async () => {
    const workbook = await build('رحلة الصيف', groups);
    const lookup = workbook.getWorksheet('Groups');

    expect(lookup.state).toBe('veryHidden');
    expect([lookup.getCell('A1').value, lookup.getCell('A2').value]).toEqual([
      'غرفة 101',
      'الفوج الأول, ب',
    ]);
  });

  it('skips the dropdown for a trip that has no groups yet', async () => {
    const workbook = await build('رحلة الصيف', []);
    const sheet = workbook.getWorksheet('الطلاب');
    expect(workbook.getWorksheet('Groups')).toBeUndefined();
    expect(sheet.getCell(headerRowOf(sheet) + 1, 2).dataValidation).toBeUndefined();
  });

  it('imports as nothing at all until somebody types in it', async () => {
    // The whole point of the layout: an untouched template carries guidance and
    // examples, and not one of them arrives as a student.
    const { drafts, error } = await parseStudentWorkbook(await bytes('رحلة الصيف', groups));
    expect(error).toBe('');
    expect(drafts).toEqual([]);
  });
});
