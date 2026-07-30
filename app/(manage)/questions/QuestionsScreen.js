'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Modal, ModalActions } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import { QuestionEditor } from '@/components/questions/editors/QuestionEditor';
import { useSchedule } from '@/lib/manage/useSchedule';
import {
  listQuestions,
  createQuestion,
  updateQuestion,
  archiveQuestion,
  deleteQuestion,
  reorderQuestions,
  listLibrary,
  copyFromLibrary,
} from '@/lib/manage/api';
import { groupBySection } from '@/lib/questions/active';
import { TYPE_LABELS } from '@/lib/questions/types';
import { WEEKDAY_LABELS } from '@/lib/schedule-time/day';
import { maxPoints } from '@/lib/points/score';
import { useTransientError } from '@/lib/ui/useTransientError';

export function QuestionsScreen() {
  const { current } = useSchedule();
  const toast = useToast();

  const [questions, setQuestions] = useState(null);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [error, setError] = useTransientError();
  const [dialogError, setDialogError] = useTransientError();

  const load = useCallback(async () => {
    if (!current) return;
    setQuestions(null);
    try {
      setQuestions(await listQuestions(current.id));
    } catch (err) {
      setError(err.message);
      setQuestions([]);
    }
  }, [current]);

  useEffect(() => {
    load();
  }, [load]);

  if (!current) return <EmptyState>اختر رحلة أولاً.</EmptyState>;

  async function move(question, delta) {
    const index = questions.findIndex((q) => q.id === question.id);
    const target = index + delta;
    if (target < 0 || target >= questions.length) return;

    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    setQuestions(next); // optimistic

    try {
      await reorderQuestions(next.map((q) => q.id));
    } catch (err) {
      setError(err.message);
      load();
    }
  }

  /**
   * Hiding and deleting are different promises, so they are different buttons.
   * Hiding keeps every answer already given and only drops the بند off future
   * days; deleting takes the answers and their points with it.
   */
  async function hide(question) {
    setQuestions((rows) => rows.filter((r) => r.id !== question.id));
    setRemoving(null);
    try {
      await archiveQuestion(question.id);
      toast.push('تم إخفاء البند — إجاباته السابقة محفوظة', 'info');
    } catch (err) {
      setError(err.message);
      load();
    }
  }

  async function destroy(question) {
    try {
      await deleteQuestion(question.id);
      setQuestions((rows) => rows.filter((r) => r.id !== question.id));
      setRemoving(null);
      toast.push('تم حذف البند نهائياً', 'success');
    } catch (err) {
      setDialogError(err.message);
    }
  }

  const sections = questions ? groupBySection(questions) : [];

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>

      <Panel
        title={`بنود الرحلة — ${current.name}`}
        action={
          <div className="flex gap-2">
            <Button onClick={() => setEditing('new')}>بند جديد</Button>
            <Button tone="outline" onClick={() => setShowLibrary(true)}>
              نسخ من المكتبة
            </Button>
          </div>
        }
      >
        <Modal
          open={editing !== null}
          onClose={() => setEditing(null)}
          title={editing === 'new' ? 'بند جديد' : 'تعديل البند'}
          size="lg"
        >
          {editing !== null && (
            <QuestionEditor
              // Remounts between the new-question form and each existing one, so
              // the editor never opens holding the previous question's draft.
              key={editing === 'new' ? 'new' : editing.id}
              question={editing === 'new' ? undefined : editing}
              sections={[...new Set((questions ?? []).map((q) => q.section).filter(Boolean))]}
              onCancel={() => setEditing(null)}
              onSave={async (draft) => {
                if (editing === 'new') {
                  const created = await createQuestion({
                    ...draft,
                    schedule_id: current.id,
                    sort_order: questions.length,
                  });
                  setQuestions((rows) => [...rows, created]);
                  setEditing(null);
                  toast.push('تمت إضافة البند', 'success');
                  return;
                }

                const updated = await updateQuestion(editing.id, {
                  section: draft.section,
                  title: draft.title,
                  help_text: draft.help_text,
                  type: draft.type,
                  config: draft.config,
                  points: draft.points,
                  active_weekdays: draft.active_weekdays,
                  active_from: draft.active_from,
                  active_to: draft.active_to,
                });
                setQuestions((rows) => rows.map((r) => (r.id === editing.id ? updated : r)));
                setEditing(null);
                toast.push('تم حفظ التعديل', 'success');
              }}
            />
          )}
        </Modal>

        <Modal
          open={showLibrary}
          onClose={() => setShowLibrary(false)}
          title="نسخ من مكتبة البنود"
          description="البنود المنسوخة تصبح مستقلة تماماً — تعديل المكتبة لاحقاً لا يغيّر رحلتك."
        >
          {showLibrary && (
            <LibraryPicker
              existing={questions ?? []}
              onCancel={() => setShowLibrary(false)}
              onCopy={async (rows) => {
                const created = await copyFromLibrary(current.id, rows, questions.length);
                setQuestions((prev) => [...prev, ...created]);
                setShowLibrary(false);
                toast.push(`تم نسخ ${created.length} بنداً — النسخ مستقلة عن المكتبة`, 'success');
              }}
            />
          )}
        </Modal>

        <RemoveQuestionDialog
          question={removing}
          error={dialogError}
          onCancel={() => setRemoving(null)}
          onHide={() => hide(removing)}
          onDelete={() => destroy(removing)}
        />

        {questions === null ? (
          <SkeletonList rows={8} />
        ) : questions.length === 0 ? (
          <EmptyState>لا توجد بنود — أضف بنداً أو انسخ من المكتبة.</EmptyState>
        ) : (
          <div className="mt-3 space-y-4">
            {sections.map(({ section, items }) => (
              <div key={section}>
                <h3 className="mb-2 text-xs font-bold text-muted">{section || 'عام'}</h3>
                <ul className="space-y-2">
                  {items.map((q) => (
                    <li key={q.id} className="rounded-xl border border-line p-3">
                      {
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{q.title}</p>
                            <p className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted">
                              <span className="rounded-full bg-chip px-2 py-0.5 font-bold text-brand">
                                {TYPE_LABELS[q.type]}
                              </span>
                              <span className="rounded-full bg-gold-100 px-2 py-0.5 font-bold text-gold-700">
                                {maxPoints(q)} نقطة
                              </span>
                              {q.active_weekdays && (
                                <span className="rounded-full bg-line px-2 py-0.5">
                                  {q.active_weekdays.map((d) => WEEKDAY_LABELS[d]).join('، ')}
                                </span>
                              )}
                              {(q.active_from || q.active_to) && (
                                <span className="rounded-full bg-line px-2 py-0.5">
                                  {q.active_from ?? '…'} → {q.active_to ?? '…'}
                                </span>
                              )}
                            </p>
                          </div>

                          <div className="flex gap-1">
                            <button
                              type="button"
                              aria-label={`تحريك "${q.title}" لأعلى`}
                              onClick={() => move(q, -1)}
                              className="size-9 rounded-lg border border-line"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={`تحريك "${q.title}" لأسفل`}
                              onClick={() => move(q, 1)}
                              className="size-9 rounded-lg border border-line"
                            >
                              ↓
                            </button>
                            <Button
                              tone="ghost"
                              className="min-h-0 px-2 py-1 text-xs"
                              onClick={() => setEditing(q)}
                            >
                              تعديل
                            </Button>
                            <Button
                              tone="danger"
                              className="min-h-0 px-2 py-1 text-xs"
                              onClick={() => setRemoving(q)}
                            >
                              حذف
                            </Button>
                          </div>
                        </div>
                      }
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

/**
 * One question, two very different outcomes, so the reader picks the outcome
 * rather than confirming a word. «حذف» used to mean "archive" behind a confirm
 * box that said so in passing — the button and the effect disagreed.
 */
function RemoveQuestionDialog({ question, error, onHide, onDelete, onCancel }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => setTyped(''), [question]);

  const matches = question ? typed.trim() === question.title.trim() : false;

  return (
    <Modal open={Boolean(question)} onClose={onCancel} title="حذف البند" error={error} size="sm">
      {question && (
        <div className="grid gap-4">
          <p className="text-sm">
            البند: <span className="font-bold">{question.title}</span>
          </p>

          <div className="rounded-xl border border-line p-3">
            <p className="text-sm font-semibold">إخفاء من الأيام القادمة</p>
            <p className="mt-1 text-xs text-muted">
              يختفي البند من صفحات الطلاب، وتبقى كل الإجابات والنقاط السابقة كما هي. هذا هو
              الخيار المناسب في أغلب الحالات.
            </p>
            <Button
              tone="outline"
              className="mt-2 min-h-0 px-3 py-1.5 text-xs"
              loading={busy === 'hide'}
              onClick={async () => {
                setBusy('hide');
                await onHide();
                setBusy(null);
              }}
            >
              إخفاء البند
            </Button>
          </div>

          <div className="rounded-xl border border-rose-600/40 p-3">
            <p className="text-sm font-semibold text-danger-ink">حذف نهائي</p>
            <p className="mt-1 text-xs text-muted">
              يُحذف البند وكل إجابات الطلاب عليه ونقاطها. تتغيّر أرصدة الطلاب نتيجة لذلك، ولا
              يمكن التراجع.
            </p>

            <label className="mt-2 block text-xs font-semibold" htmlFor="del-qtitle">
              اكتب عنوان البند للتأكيد
            </label>
            <input
              id="del-qtitle"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={question.title}
              autoComplete="off"
              className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-navy-500"
            />

            <Button
              tone="danger"
              className="mt-2 min-h-0 px-3 py-1.5 text-xs"
              disabled={!matches}
              loading={busy === 'delete'}
              onClick={async () => {
                setBusy('delete');
                await onDelete();
                setBusy(null);
              }}
            >
              حذف نهائياً
            </Button>
          </div>

          <ModalActions>
            <Button tone="ghost" onClick={onCancel}>
              إلغاء
            </Button>
          </ModalActions>
        </div>
      )}
    </Modal>
  );
}

function LibraryPicker({ existing, onCopy, onCancel }) {
  const [library, setLibrary] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useTransientError();

  useEffect(() => {
    listLibrary()
      .then(setLibrary)
      .catch((err) => {
        setError(err.message);
        setLibrary([]);
      });
  }, []);

  const copied = new Set(existing.map((q) => q.library_id).filter(Boolean));

  // The library is one long undifferentiated list once it holds more than a
  // handful of بنود, and «الرواتب» arrives as a set of five that are nearly
  // always wanted together. Grouping by the category the library already
  // carries makes the whole set one tick instead of five.
  const categories = useMemo(() => (library ? groupBySection(library) : []), [library]);

  const toggleMany = (ids, on) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  if (library === null) return <SkeletonList rows={6} />;

  return (
    <div className="space-y-3">
      <ErrorText>{error}</ErrorText>

      {library.length === 0 && <EmptyState>المكتبة فارغة.</EmptyState>}

      {categories.map(({ section, items }) => {
        // Already-copied بنود are not selectable, so they must not count
        // towards "the whole category is ticked" either.
        const selectable = items.filter((q) => !copied.has(q.id)).map((q) => q.id);
        const chosen = selectable.filter((id) => selected.has(id));
        const all = selectable.length > 0 && chosen.length === selectable.length;

        return (
          <section key={section} className="rounded-xl border border-line">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  type="checkbox"
                  disabled={selectable.length === 0}
                  checked={all}
                  ref={(el) => {
                    // Partly-chosen reads as neither on nor off, which is what
                    // it is: ticking it takes the rest of the category.
                    if (el) el.indeterminate = chosen.length > 0 && !all;
                  }}
                  onChange={(e) => toggleMany(selectable, e.target.checked)}
                  className="size-5 accent-[color:var(--color-accent)]"
                />
                <span className="min-w-0 text-sm font-bold break-words text-brand">
                  {section || 'عام'}
                </span>
              </label>
              <span className="shrink-0 text-xs text-muted">
                {selectable.length === 0
                  ? 'كل بنودها منسوخة'
                  : `${chosen.length} من ${selectable.length}`}
              </span>
            </div>

            <ul className="divide-y divide-line/60">
              {items.map((q) => {
                const already = copied.has(q.id);
                return (
                  <li key={q.id}>
                    <label
                      className={`flex items-center gap-3 px-3 py-2 ${
                        already ? 'opacity-60' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={already}
                        checked={selected.has(q.id)}
                        aria-label={q.title}
                        onChange={(e) => toggleMany([q.id], e.target.checked)}
                        className="size-5 accent-[color:var(--color-accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold break-words">{q.title}</span>
                        <span className="block text-xs text-muted">
                          {TYPE_LABELS[q.type]} · {maxPoints(q)} نقطة
                        </span>
                      </span>
                      {already && <span className="text-xs font-bold text-muted">منسوخ</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <ModalActions>
        <Button
          disabled={selected.size === 0}
          onClick={() => onCopy(library.filter((q) => selected.has(q.id)))}
        >
          نسخ {selected.size} بنداً
        </Button>
        <Button tone="ghost" onClick={onCancel}>
          إلغاء
        </Button>
      </ModalActions>
    </div>
  );
}
