'use client';

import { useEffect, useState } from 'react';
import { EmptyState, ErrorText } from '@/components/manage/Panel';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SkeletonList } from '@/components/ui/Skeleton';
import { QuestionEditor } from '@/components/questions/editors/QuestionEditor';
import { groupBySection } from '@/lib/questions/active';
import { TYPE_LABELS } from '@/lib/questions/types';
import { WEEKDAY_LABELS } from '@/lib/schedule-time/day';
import { maxPoints } from '@/lib/points/score';
import {
  listQuestions,
  createQuestion,
  updateQuestion,
  archiveQuestion,
  deleteQuestion,
  reorderQuestions,
} from '@/lib/admin/questions';

export function QuestionsAdminScreen() {
  const [questions, setQuestions] = useState(null);
  const [editing, setEditing] = useState(null); // 'new' | question | null
  const [confirmDel, setConfirmDel] = useState(null);
  const [error, setError] = useState('');

  async function reload() {
    try {
      setQuestions(await listQuestions());
    } catch {
      setError('تعذّر تحميل البنود');
      setQuestions([]);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const sections = questions ? [...new Set(questions.map((q) => q.section).filter(Boolean))] : [];

  async function move(question, delta) {
    const index = questions.findIndex((q) => q.id === question.id);
    const target = index + delta;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    setQuestions(next); // optimistic
    try {
      await reorderQuestions(next.map((q) => q.id));
    } catch {
      setError('تعذّر إعادة الترتيب');
      reload();
    }
  }

  async function hide(question) {
    setQuestions((rows) => rows.filter((r) => r.id !== question.id));
    setConfirmDel(null);
    try {
      await archiveQuestion(question.id);
    } catch {
      setError('تعذّر الإخفاء');
      reload();
    }
  }

  async function destroy(question) {
    setConfirmDel(null);
    try {
      await deleteQuestion(question.id);
      setQuestions((rows) => rows.filter((r) => r.id !== question.id));
    } catch {
      setError('تعذّر الحذف');
      reload();
    }
  }

  const grouped = questions ? groupBySection(questions) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand">البنود اليومية</h1>
        <Button onClick={() => setEditing('new')}>+ بند جديد</Button>
      </div>
      <p className="text-sm text-muted">
        بنود غنيّة (نعم/لا، لكل صلاة، عدّاد، اختيار، تقييم…) يجيب عنها المستخدم كل يوم وتُحتسب نقاطها تلقائياً.
      </p>

      <ErrorText>{error}</ErrorText>

      {questions === null ? (
        <SkeletonList rows={6} />
      ) : questions.length === 0 ? (
        <EmptyState>لا توجد بنود بعد. أضف أول بند.</EmptyState>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ section, items }) => (
            <section key={section} className="space-y-2">
              <h2 className="px-1 text-sm font-bold text-muted">{section}</h2>
              <ul className="space-y-2">
                {items.map((q) => (
                  <li key={q.id} className="card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">{q.title}</p>
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
                            <span className="rounded-full bg-line px-2 py-0.5" dir="ltr">
                              {q.active_from ?? '…'} → {q.active_to ?? '…'}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
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
                        <button
                          type="button"
                          onClick={() => setEditing(q)}
                          className="rounded-lg border border-line px-2 py-1 text-xs font-semibold text-brand"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => hide(q)}
                          className="rounded-lg border border-line px-2 py-1 text-xs font-semibold"
                        >
                          إخفاء
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDel(q)}
                          className="rounded-lg border border-line px-2 py-1 text-xs font-semibold text-rose-600"
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'بند جديد' : 'تعديل البند'}
        size="lg"
      >
        {editing !== null && (
          <QuestionEditor
            key={editing === 'new' ? 'new' : editing.id}
            question={editing === 'new' ? undefined : editing}
            sections={sections}
            onCancel={() => setEditing(null)}
            onSave={async (draft) => {
              if (editing === 'new') {
                const created = await createQuestion({ ...draft, sort_order: questions.length });
                setQuestions((rows) => [...(rows || []), created]);
              } else {
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
              }
              setEditing(null);
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDel !== null}
        title="حذف البند"
        message="سيُحذف البند وكل إجابات المستخدمين عليه ونقاطها، وتتغيّر أرصدتهم. لا يمكن التراجع."
        note="للإبقاء على الإجابات السابقة استخدم «إخفاء» بدلاً من الحذف — يختفي البند من الأيام القادمة وتبقى النقاط."
        confirmLabel="حذف نهائي"
        onConfirm={() => confirmDel && destroy(confirmDel)}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
