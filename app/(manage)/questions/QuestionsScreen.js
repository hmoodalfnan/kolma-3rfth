'use client';

import { useCallback, useEffect, useState } from 'react';
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
  reorderQuestions,
  listLibrary,
  copyFromLibrary,
} from '@/lib/manage/api';
import { groupBySection } from '@/lib/questions/active';
import { TYPE_LABELS } from '@/lib/questions/types';
import { WEEKDAY_LABELS } from '@/lib/schedule-time/day';
import { maxPoints } from '@/lib/points/score';

export function QuestionsScreen() {
  const { current } = useSchedule();
  const toast = useToast();

  const [questions, setQuestions] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [error, setError] = useState('');

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
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    'سيُخفى البند من الأيام القادمة، وتبقى إجاباته ونقاطه السابقة محفوظة. متابعة؟',
                                  )
                                ) {
                                  return;
                                }
                                setQuestions((rows) => rows.filter((r) => r.id !== q.id));
                                try {
                                  await archiveQuestion(q.id);
                                } catch (err) {
                                  setError(err.message);
                                  load();
                                }
                              }}
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

function LibraryPicker({ existing, onCopy, onCancel }) {
  const [library, setLibrary] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    listLibrary()
      .then(setLibrary)
      .catch((err) => {
        setError(err.message);
        setLibrary([]);
      });
  }, []);

  const copied = new Set(existing.map((q) => q.library_id).filter(Boolean));

  if (library === null) return <SkeletonList rows={6} />;

  return (
    <div className="space-y-3">
      <ErrorText>{error}</ErrorText>

      <ul className="space-y-1.5">
        {library.map((q) => {
          const already = copied.has(q.id);
          return (
            <li key={q.id}>
              <label
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                  already ? 'border-line opacity-60' : 'cursor-pointer border-line'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={already}
                  checked={selected.has(q.id)}
                  aria-label={q.title}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(q.id);
                      else next.delete(q.id);
                      return next;
                    })
                  }
                  className="size-5 accent-[color:var(--color-accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{q.title}</span>
                  <span className="block text-xs text-muted">
                    {q.section} · {TYPE_LABELS[q.type]}
                  </span>
                </span>
                {already && <span className="text-xs font-bold text-muted">منسوخ</span>}
              </label>
            </li>
          );
        })}
      </ul>

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
