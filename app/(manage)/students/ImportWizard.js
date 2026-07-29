'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { ErrorText } from '@/components/manage/Panel';
import {
  parseStudentWorkbook,
  validateDrafts,
  inspectFile,
  hasZipSignature,
  PHONE_DIGITS,
} from '@/lib/excel/import';
import { downloadStudentTemplate } from '@/lib/excel/template';

const BATCH = 50;

/**
 * Put the rows that need attention at the top — once, when the file lands.
 *
 * Deliberately not recomputed as rows get repaired: a list that re-sorts itself
 * mid-edit pulls the row out from under the cursor, and with it the focus of
 * the input being typed into. Fixed rows stay where they are and go green.
 */
function sortWorstFirst(drafts, groups) {
  const rank = (row) => (row.errors.length ? 0 : row.warnings.length ? 1 : 2);

  return validateDrafts(drafts, groups)
    .sort((a, b) => rank(a) - rank(b) || a.rowNumber - b.rowNumber)
    .map(({ errors, warnings, group_id, group_name, student, phone_link, ...draft }) => draft);
}

export function ImportWizard({ groups, scheduleName, onImport, onCancel }) {
  const [drafts, setDrafts] = useState(null);
  const [openRows, setOpenRows] = useState(() => new Set());
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');

  // Re-judged on every keystroke, which is what lets a row leave the problem
  // list the moment it is repaired instead of after another upload.
  const reviewed = useMemo(() => validateDrafts(drafts ?? [], groups), [drafts, groups]);
  const blocked = reviewed.filter((r) => r.errors.length > 0);
  const warned = reviewed.filter((r) => r.errors.length === 0 && r.warnings.length > 0);
  const ready = reviewed.filter((r) => r.errors.length === 0 && r.warnings.length === 0);
  const importable = reviewed.filter((r) => r.errors.length === 0);

  async function handleFile(file) {
    setError('');
    setDrafts(null);
    setOpenRows(new Set());
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

    const result = await parseStudentWorkbook(buffer);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.drafts.length === 0) {
      setError('لم يُعثر على أي صف فيه بيانات تحت رؤوس الأعمدة');
      return;
    }
    setDrafts(sortWorstFirst(result.drafts, groups));
  }

  const patch = (id, change) =>
    setDrafts((rows) =>
      // Clearing `formula` here is the point of the edit: a retyped value is a
      // value we read ourselves, not one Excel would have computed.
      rows.map((r) => (r.id === id ? { ...r, ...change, formula: false } : r)),
    );

  const remove = (id) => setDrafts((rows) => rows.filter((r) => r.id !== id));

  const toggle = (id) =>
    setOpenRows((open) => {
      const next = new Set(open);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function confirm() {
    const rows = importable;
    setProgress({ done: 0, total: rows.length });

    try {
      const created = [];
      let done = 0;

      // The create endpoint takes one group per call, so the rows are bucketed
      // by the group each of them named and every bucket sent in batches.
      const buckets = new Map();
      for (const row of rows) {
        const key = row.group_id ?? '';
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(row);
      }

      for (const [bucketGroupId, bucket] of buckets) {
        for (let i = 0; i < bucket.length; i += BATCH) {
          const slice = bucket.slice(i, i + BATCH);

          const result = await onImport({
            groupId: bucketGroupId || null,
            students: slice.map((r) => r.student),
            // Phones never reach the server; they are matched back onto the
            // created rows by name so the handover screen can build wa.me links.
            phones: Object.fromEntries(
              slice.filter((r) => r.phone_link).map((r) => [r.student.full_name, r.phone_link]),
            ),
          });
          created.push(...result.created);
          done += slice.length;
          setProgress({ done, total: rows.length });
        }
      }

      setProgress(null);
      setDrafts(null);
      setFileName('');
      return created;
    } catch (err) {
      setError(err.message);
      setProgress(null);
      return [];
    }
  }

  const rowProps = (row) => ({
    row,
    groups,
    open: openRows.has(row.id),
    onToggle: () => toggle(row.id),
    onChange: (change) => patch(row.id, change),
    onRemove: () => remove(row.id),
  });

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
            {groups.length > 0
              ? `نزّل القالب الجاهز — عمود «المجموعة» فيه قائمة منسدلة بمجموعات ${scheduleName} (${groups.length}) — املأه، ثم ارفعه هنا.`
              : 'نزّل القالب الجاهز بالأعمدة الصحيحة، املأه، ثم ارفعه هنا. لا توجد مجموعات في هذه الرحلة بعد، فسيُضاف الجميع بلا مجموعة.'}
          </p>
        </div>
        <Button tone="outline" onClick={() => downloadStudentTemplate(scheduleName, groups)}>
          تنزيل القالب
        </Button>
      </div>

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

      {drafts && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-ok px-3 py-1 text-ok-ink">جاهز {ready.length}</span>
            <span className="rounded-full bg-warn-soft px-3 py-1 text-warn-ink">
              تحذير {warned.length}
            </span>
            <span className="rounded-full bg-danger-soft px-3 py-1 text-danger-ink">
              مشاكل {blocked.length}
            </span>
          </div>

          <p className="text-xs text-muted">
            {blocked.length > 0
              ? 'الصفوف التي بها مشاكل في الأعلى. أصلح الصف ليُضاف مع البقية، أو احذفه.'
              : 'راجع الأسماء قبل التأكيد.'}
          </p>

          <ul className="max-h-[26rem] space-y-1.5 overflow-y-auto rounded-2xl border border-line p-2">
            {reviewed.map((row) => (
              <DraftRow key={row.id} {...rowProps(row)} />
            ))}
          </ul>

          {progress && (
            <p className="text-sm font-semibold text-brand">
              جارٍ الإضافة… {progress.done} / {progress.total}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={importable.length === 0 || Boolean(progress)} onClick={confirm}>
              إضافة {importable.length} طالباً
            </Button>
            <Button tone="ghost" onClick={onCancel}>
              إلغاء
            </Button>
            {blocked.length > 0 && (
              <span className="text-xs font-semibold text-danger-ink">
                {blocked.length} صفاً سيُترك خلفك.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Full opacity, not a tint: mixing either soft colour into the dark panel lands
// on the same murky grey, which is how a warning stopped looking like one.
const ROW_TONES = {
  danger: 'border-rose-500/50 bg-danger-soft',
  warn: 'border-gold-500/50 bg-warn-soft',
  ok: 'border-line bg-panel',
};

/**
 * One student as they will be created, with the file's version of them still
 * editable. Everything is repaired here rather than back in Excel, so a single
 * mistyped PIN in a file of two hundred names is no longer a reason to fix the
 * spreadsheet and upload it again.
 */
function DraftRow({ row, groups, open, onToggle, onChange, onRemove }) {
  const field = (name) => ({
    value: row[name],
    onChange: (e) => onChange({ [name]: e.target.value }),
  });

  const tone = row.errors.length ? 'danger' : row.warnings.length ? 'warn' : 'ok';
  const mark = { danger: '⛔', warn: '⚠️', ok: '✅' }[tone];

  return (
    <li className={`rounded-xl border p-2.5 ${ROW_TONES[tone]}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true">{mark}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted">صف {row.rowNumber}</span>
        <span className="min-w-0 flex-1 truncate font-semibold">
          {row.full_name || <span className="text-muted">بدون اسم</span>}
        </span>

        {row.group_name && (
          <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] text-muted">
            {row.group_name}
          </span>
        )}
        {row.phone && (
          <span dir="ltr" className="text-[11px] text-muted">
            {row.phone}
          </span>
        )}

        <Button
          tone="outline"
          className="min-h-0 shrink-0 px-3 py-1.5 text-xs"
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? 'تم' : row.errors.length ? 'إصلاح' : 'تعديل'}
        </Button>
        {/* Outline, not ghost: a bare-text control next to a bordered one reads
            as a caption rather than something you can press. */}
        <Button
          tone="outline"
          className="min-h-0 shrink-0 px-3 py-1.5 text-xs text-danger-ink"
          onClick={onRemove}
          aria-label={`حذف ${row.full_name || `الصف ${row.rowNumber}`} من الاستيراد`}
        >
          حذف
        </Button>
      </div>

      {(row.errors.length > 0 || row.warnings.length > 0) && (
        <ul className="mt-1.5 space-y-0.5 text-xs">
          {row.errors.map((message) => (
            <li key={message} className="font-semibold text-danger-ink">
              ⛔ {message}
            </li>
          ))}
          {row.warnings.map((message) => (
            <li key={message} className="font-semibold text-warn-ink">
              ⚠️ {message}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted">
            الاسم
            <Input {...field('full_name')} className="mt-1 min-h-0 py-1.5 text-sm" />
          </label>

          <label className="text-xs font-semibold text-muted">
            المجموعة
            <Select {...field('group')} className="mt-1 min-h-0 py-1.5 text-sm">
              <option value="">بدون مجموعة</option>
              {groups.map((g) => (
                <option key={g.id} value={g.name}>
                  {g.name}
                </option>
              ))}
              {/* Keeps an unrecognised group visible instead of silently
                  swapping it for "بدون مجموعة" the moment the editor opens. */}
              {row.group && !row.group_id && <option value={row.group}>{row.group} (غير معروفة)</option>}
            </Select>
          </label>

          <label className="text-xs font-semibold text-muted">
            الجوال ({PHONE_DIGITS} أرقام)
            <Input
              {...field('phone')}
              dir="ltr"
              inputMode="numeric"
              className="mt-1 min-h-0 py-1.5 text-sm"
            />
          </label>

          <label className="text-xs font-semibold text-muted">
            الرمز (6 أرقام أو فارغ)
            <Input
              {...field('pin')}
              dir="ltr"
              inputMode="numeric"
              className="mt-1 min-h-0 py-1.5 text-sm"
            />
          </label>
        </div>
      )}
    </li>
  );
}
