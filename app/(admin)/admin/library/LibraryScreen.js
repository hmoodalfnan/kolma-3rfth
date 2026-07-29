'use client';

import { friendlyError } from '@/lib/errors/friendly';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Panel, EmptyState, ErrorText } from '@/components/manage/Panel';
import { QuestionEditor } from '@/components/questions/editors/QuestionEditor';
import { getBrowserClient } from '@/lib/supabase/browser';
import { listLibrary } from '@/lib/manage/api';
import { SuggestedQuestions } from './SuggestedQuestions';
import { TYPE_LABELS } from '@/lib/questions/types';
import { maxPoints } from '@/lib/points/score';
import { useTransientError } from '@/lib/ui/useTransientError';

export function LibraryScreen() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [usage, setUsage] = useState({});
  const [editing, setEditing] = useState(null);
  const [error, setError] = useTransientError();

  const load = useCallback(async () => {
    setRows(null);
    try {
      const client = getBrowserClient();
      const [library, { data: copies }] = await Promise.all([
        listLibrary(),
        client.from('questions').select('library_id').not('library_id', 'is', null),
      ]);

      const counts = {};
      for (const c of copies ?? []) counts[c.library_id] = (counts[c.library_id] ?? 0) + 1;

      setRows(library);
      setUsage(counts);
    } catch (err) {
      setError(err.message);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const client = getBrowserClient();

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>

      <SuggestedQuestions onAccepted={load} />

      <Panel
        title="مكتبة البنود الرئيسية"
        action={<Button onClick={() => setEditing('new')}>بند جديد</Button>}
      >
        <p className="mb-3 text-sm text-muted">
          هذه المكتبة مرجع للمشرفين ينسخون منها. تعديل بند هنا لا يغيّر النسخ الموجودة داخل
          الرحلات الجارية.
        </p>

        <Modal
          open={editing !== null}
          onClose={() => setEditing(null)}
          title={editing === 'new' ? 'بند جديد في المكتبة' : 'تعديل بند المكتبة'}
          description="النسخ الموجودة داخل الرحلات لا تتأثر بهذا التعديل."
          size="lg"
        >
          {editing !== null && (
            <QuestionEditor
              key={editing === 'new' ? 'new' : editing.id}
              question={editing === 'new' ? undefined : editing}
              sections={[...new Set((rows ?? []).map((q) => q.section).filter(Boolean))]}
              onCancel={() => setEditing(null)}
              onSave={async (draft) => {
                const payload = {
                  section: draft.section,
                  title: draft.title,
                  help_text: draft.help_text,
                  type: draft.type,
                  config: draft.config,
                  points: draft.points,
                };

                const { error: writeError } =
                  editing === 'new'
                    ? await client
                        .from('question_library')
                        .insert({ ...payload, sort_order: rows.length })
                    : await client.from('question_library').update(payload).eq('id', editing.id);
                if (writeError) throw new Error(friendlyError(writeError));

                setEditing(null);
                await load();
                toast.push(
                  editing === 'new'
                    ? 'تمت إضافة البند للمكتبة'
                    : 'تم الحفظ — النسخ داخل الرحلات لم تتأثر',
                  'success',
                );
              }}
            />
          )}
        </Modal>

        {rows === null ? (
          <SkeletonList rows={10} />
        ) : rows.length === 0 ? (
          <EmptyState>المكتبة فارغة.</EmptyState>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((q) => (
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
                        {q.section && <span className="rounded-full bg-line px-2 py-0.5">{q.section}</span>}
                        <span className="rounded-full bg-line px-2 py-0.5">
                          مستخدم في {usage[q.id] ?? 0} رحلة
                        </span>
                      </p>
                    </div>

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
                            'سيُحذف البند من المكتبة فقط. النسخ داخل الرحلات تبقى كما هي. متابعة؟',
                          )
                        ) {
                          return;
                        }
                        setRows((prev) => prev.filter((r) => r.id !== q.id));
                        const { error: deleteError } = await client
                          .from('question_library')
                          .delete()
                          .eq('id', q.id);
                        if (deleteError) {
                          setError(deleteError.message);
                          load();
                        }
                      }}
                    >
                      حذف
                    </Button>
                  </div>
                }
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
