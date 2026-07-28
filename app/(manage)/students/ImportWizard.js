'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { ErrorText } from '@/components/manage/Panel';
import { parseStudentWorkbook, inspectFile, hasZipSignature } from '@/lib/excel/import';

const BATCH = 50;

export function ImportWizard({ groups, onImport, onCancel }) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);

  async function handleFile(file) {
    setError('');
    setParsed(null);

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
    <div className="space-y-3 rounded-xl border border-line p-3">
      <p className="text-sm text-muted">
        الملف يحتاج عمود <strong>الاسم</strong> فقط، ويمكن إضافة عمود <strong>الرمز</strong>
        {' '}اختيارياً. المجموعة تُختار هنا وليست في الملف. الملف يُقرأ في متصفحك ولا يُرفع.
      </p>

      <Field label="المجموعة التي ستُضاف إليها الأسماء" htmlFor="impgroup">
        <Select id="impgroup" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">بدون مجموعة</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="ملف Excel أو CSV" htmlFor="impfile">
        <input
          id="impfile"
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm"
        />
      </Field>

      <ErrorText>{error}</ErrorText>

      {parsed && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">
            صالح: {parsed.rows.length} — به مشاكل: {parsed.errors.length}
          </p>

          {parsed.errors.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
              {parsed.errors.map((e) => (
                <li key={`${e.rowNumber}-${e.message}`}>
                  صف {e.rowNumber}: {e.message}
                </li>
              ))}
            </ul>
          )}

          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line p-2 text-sm">
            {parsed.rows.map((r) => (
              <li key={r.rowNumber} className="flex justify-between gap-2">
                <span>{r.full_name}</span>
                <span className="text-xs text-muted">{r.pin ? 'رمز محدد' : 'رمز تلقائي'}</span>
              </li>
            ))}
          </ul>

          {progress && (
            <p className="text-sm font-semibold text-navy-700">
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
