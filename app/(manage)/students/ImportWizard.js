'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { ErrorText } from '@/components/manage/Panel';
import { parseStudentWorkbook, inspectFile, hasZipSignature } from '@/lib/excel/import';
import { downloadStudentTemplate } from '@/lib/excel/template';

const BATCH = 50;

export function ImportWizard({ groups, scheduleName, onImport, onCancel }) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');

  async function handleFile(file) {
    setError('');
    setParsed(null);
    setFileName(file.name);

    const check = inspectFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    const buffer = await file.arrayBuffer();
    if (/\.xlsx$/i.test(file.name) && !(await hasZipSignature(buffer))) {
      setError('محتوى الملف لا يطابق امتداد xlsx');
      return;
    }

    setParsed(await parseStudentWorkbook(buffer));
  }

  async function confirm() {
    const rows = parsed.rows;
    setProgress({ done: 0, total: rows.length });

    try {
      const created = [];
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH);
         
        const result = await onImport({
          groupId: groupId || null,
          students: slice.map((r) => ({ full_name: r.full_name, pin: r.pin })),
          // Phones never reach the server; they are matched back onto the
          // created rows by name so the handover screen can build wa.me links.
          phones: Object.fromEntries(slice.filter((r) => r.phone).map((r) => [r.full_name, r.phone])),
        });
        created.push(...result.created);
        setProgress({ done: Math.min(i + BATCH, rows.length), total: rows.length });
      }
      setProgress(null);
      setParsed(null);
      return created;
    } catch (err) {
      setError(err.message);
      setProgress(null);
      return [];
    }
  }

  return (
    <div className="space-y-4">
      {/* Step one is the template. Most failed imports were a missing or
          misspelled header, which a prepared file makes impossible. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line p-3">
        <span aria-hidden="true" className="text-2xl">
          📄
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">لم تجهّز الملف بعد؟</p>
          <p className="text-xs text-muted">
            نزّل القالب الجاهز بالأعمدة الصحيحة، املأه، ثم ارفعه هنا.
          </p>
        </div>
        <Button tone="outline" onClick={() => downloadStudentTemplate(scheduleName)}>
          تنزيل القالب
        </Button>
      </div>

      <Field label="المجموعة التي ستُضاف إليها الأسماء" htmlFor="impgroup">
        <Select id="impgroup" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">بدون مجموعة</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              مجموعة: {g.name}
            </option>
          ))}
        </Select>
      </Field>

      {/* A styled label wrapping a visually hidden input: the native file input
          cannot be restyled, and its default rendering gave no hint that a whole
          spreadsheet was expected. */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
          dragging ? 'border-accent bg-chip' : 'border-line hover:border-accent hover:bg-chip'
        }`}
      >
        <span aria-hidden="true" className="text-3xl">
          ⬆️
        </span>
        <span className="text-sm font-bold text-brand">
          {fileName || 'اختر ملف Excel أو CSV'}
        </span>
        <span className="text-xs text-muted">أو اسحب الملف وأفلته هنا · الحد 2 ميجابايت</span>
        <span className="text-[11px] text-muted">
          يُقرأ الملف داخل متصفحك ولا يُرفع إلى أي خادم
        </span>
        <input
          id="impfile"
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="sr-only"
        />
      </label>

      <ErrorText>{error}</ErrorText>

      {parsed && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">
            صالح: {parsed.rows.length} — به مشاكل: {parsed.errors.length}
          </p>

          {parsed.errors.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-danger-soft p-2 text-xs text-danger-ink">
              {parsed.errors.map((e) => (
                <li key={`${e.rowNumber}-${e.message}`}>
                  صف {e.rowNumber}: {e.message}
                </li>
              ))}
            </ul>
          )}

          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line p-2 text-sm">
            {parsed.rows.map((r) => (
              <li key={r.rowNumber} className="flex flex-wrap justify-between gap-2">
                <span>{r.full_name}</span>
                <span className="flex gap-2 text-xs text-muted">
                  {r.phone ? <span dir="ltr">{r.phone}</span> : <span>بدون جوال</span>}
                  <span>{r.pin ? 'رمز محدد' : 'رمز تلقائي'}</span>
                </span>
              </li>
            ))}
          </ul>

          {progress && (
            <p className="text-sm font-semibold text-brand">
              جارٍ الإضافة… {progress.done} / {progress.total}
            </p>
          )}

          <div className="flex gap-2">
            <Button disabled={parsed.rows.length === 0 || Boolean(progress)} onClick={confirm}>
              إضافة {parsed.rows.length} طالباً
            </Button>
            <Button tone="ghost" onClick={onCancel}>
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
