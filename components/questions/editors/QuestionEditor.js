'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { ErrorText } from '@/components/manage/Panel';
import { QuestionCard } from '@/components/questions';
import { QUESTION_TYPES, TYPE_LABELS, TYPE_HINTS, DEFAULT_CONFIG } from '@/lib/questions/types';
import { parseConfig } from '@/lib/questions/config-schema';
import { WEEKDAY_LABELS } from '@/lib/schedule-time/day';
import { CONFIG_EDITORS } from './ConfigEditors';

const NEW_SECTION = '__new__';

const emptyQuestion = () => ({
  section: '',
  title: '',
  help_text: '',
  type: 'bool',
  config: {},
  points: 5,
  active_weekdays: null,
  active_from: null,
  active_to: null,
  is_required: false,
});

export function QuestionEditor({
  question,
  onSave,
  onCancel,
  showSection = true,
  sections = [],
}) {
  const [draft, setDraft] = useState({ ...emptyQuestion(), ...question });
  // An existing question whose section is not in the list is being edited after
  // that section was renamed elsewhere; treat it as a new one so the value is
  // not silently dropped.
  const [newSection, setNewSection] = useState(
    Boolean(question?.section) && !sections.includes(question.section),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const ConfigEditor = CONFIG_EDITORS[draft.type];
  const weekdays = draft.active_weekdays ?? [];
  const usesFlatPoints = draft.type === 'bool';

  function changeType(type) {
    // A stale options array must not survive a switch to counter, so reset config.
    setDraft({ ...draft, type, config: DEFAULT_CONFIG[type]() });
  }

  function toggleWeekday(day) {
    const next = weekdays.includes(day)
      ? weekdays.filter((d) => d !== day)
      : [...weekdays, day].sort();
    setDraft({ ...draft, active_weekdays: next.length === 0 || next.length === 7 ? null : next });
  }

  async function submit(event) {
    event.preventDefault();
    setError('');

    if (!draft.title.trim()) {
      setError('عنوان البند مطلوب');
      return;
    }

    const parsed = parseConfig(draft.type, draft.config);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setBusy(true);
    try {
      await onSave({
        ...draft,
        title: draft.title.trim(),
        section: (draft.section ?? '').trim(),
        config: parsed.data,
        points: usesFlatPoints ? Number(draft.points) : 0,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const preview = { ...draft, id: draft.id ?? 'preview', config: draft.config };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-accent p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عنوان البند" htmlFor="qtitle">
          <Input
            id="qtitle"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            required
          />
        </Field>

        {showSection && (
          <Field
            label="القسم"
            htmlFor="qsection"
            hint={
              newSection
                ? 'سيُنشأ قسم جديد بهذا الاسم.'
                : 'اختر قسماً موجوداً، أو «قسم جديد…» لإنشاء واحد.'
            }
          >
            {/* Typing the section by hand produced near-duplicates that split a
                group in two — "الأذكار" and "الاذكار" are different strings and
                the same intent. Existing sections are offered first. */}
            <Select
              id="qsection"
              value={newSection ? NEW_SECTION : draft.section}
              onChange={(e) => {
                if (e.target.value === NEW_SECTION) {
                  setNewSection(true);
                  setDraft({ ...draft, section: '' });
                } else {
                  setNewSection(false);
                  setDraft({ ...draft, section: e.target.value });
                }
              }}
            >
              <option value="">بدون قسم</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={NEW_SECTION}>قسم جديد…</option>
            </Select>

            {newSection && (
              <Input
                aria-label="اسم القسم الجديد"
                placeholder="اسم القسم الجديد"
                value={draft.section}
                onChange={(e) => setDraft({ ...draft, section: e.target.value })}
                className="mt-2"
                autoFocus
              />
            )}
          </Field>
        )}

        <Field label="نوع البند" htmlFor="qtype" hint={TYPE_HINTS[draft.type]}>
          <Select id="qtype" value={draft.type} onChange={(e) => changeType(e.target.value)}>
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>

        {usesFlatPoints && (
          <Field label="النقاط" htmlFor="qpoints">
            <Input
              id="qpoints"
              type="number"
              value={draft.points}
              onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })}
            />
          </Field>
        )}

        <Field label="شرح إضافي (اختياري)" htmlFor="qhelp" >
          <Textarea
            id="qhelp"
            value={draft.help_text}
            onChange={(e) => setDraft({ ...draft, help_text: e.target.value })}
            className="min-h-16"
          />
        </Field>
      </div>

      {ConfigEditor && (
        <div className="rounded-xl bg-surface p-3">
          <ConfigEditor config={draft.config} onChange={(config) => setDraft({ ...draft, config })} />
        </div>
      )}

      <fieldset className="rounded-xl bg-surface p-3">
        <legend className="px-1 text-sm font-semibold">الجدولة</legend>

        <p className="mb-2 text-xs text-muted">
          اترك كل الأيام محددة (أو ألغِ التحديد كله) ليظهر البند يومياً.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_LABELS.map((label, day) => {
            const on = weekdays.length === 0 || weekdays.includes(day);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => toggleWeekday(day)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                  on ? 'bg-accent text-accent-ink' : 'bg-panel text-muted'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="يبدأ من (اختياري)" htmlFor="qfrom">
            <Input
              id="qfrom"
              type="date"
              value={draft.active_from ?? ''}
              onChange={(e) => setDraft({ ...draft, active_from: e.target.value || null })}
            />
          </Field>
          <Field label="ينتهي في (اختياري)" htmlFor="qto">
            <Input
              id="qto"
              type="date"
              value={draft.active_to ?? ''}
              onChange={(e) => setDraft({ ...draft, active_to: e.target.value || null })}
            />
          </Field>
        </div>
      </fieldset>

      <div className="rounded-xl bg-surface p-3">
        <p className="mb-2 text-sm font-semibold">معاينة مباشرة</p>
        <QuestionCard question={preview} value={undefined} onChange={() => {}} disabled />
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          حفظ
        </Button>
        <Button tone="ghost" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
