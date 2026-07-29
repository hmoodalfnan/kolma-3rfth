'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { Panel, ErrorText } from '@/components/manage/Panel';
import {
  listSuggestedQuestions,
  acceptSuggestedQuestion,
  dismissSuggestedQuestion,
} from '@/lib/manage/api';
import { TYPE_LABELS } from '@/lib/questions/types';
import { maxPoints } from '@/lib/points/score';
import { useTransientError } from '@/lib/ui/useTransientError';

/**
 * بنود managers wrote themselves, waiting on a decision about the library.
 *
 * Hidden entirely when the queue is empty — a permanently visible "0 pending"
 * panel is noise on the screen you actually came to use.
 *
 * Neither action touches the manager's trip. Students may already have answered
 * the بند, and this is an editorial judgement about the shared library, not a
 * veto over somebody else's trip.
 */
export function SuggestedQuestions({ onAccepted }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useTransientError();

  const load = useCallback(async () => {
    try {
      setRows(await listSuggestedQuestions());
    } catch (err) {
      setError(err.message);
      setRows([]);
    }
  }, [setError]);

  useEffect(() => {
    load();
  }, [load]);

  if (rows === null) return <SkeletonList rows={2} />;
  if (rows.length === 0) return null;

  async function act(row, kind) {
    setBusyId(row.id);
    try {
      if (kind === 'accept') {
        await acceptSuggestedQuestion(row.id);
        toast.push('أُضيف البند إلى المكتبة', 'success');
        onAccepted?.();
      } else {
        await dismissSuggestedQuestion(row.id);
        toast.push('تم تجاهل الاقتراح — البند باقٍ في رحلته', 'info');
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title="بنود مقترحة من المشرفين"
      action={
        <span className="rounded-full bg-gold-100 px-2.5 py-1 text-xs font-bold text-gold-700">
          {rows.length}
        </span>
      }
    >
      <ErrorText>{error}</ErrorText>

      <p className="mb-3 text-sm text-muted">
        بنود أنشأها المشرفون في رحلاتهم. الإضافة تنسخها إلى المكتبة للجميع، والتجاهل يخفيها من هنا
        فقط — في الحالتين يبقى البند في رحلته كما هو.
      </p>

      <ul className="space-y-2">
        {rows.map((q) => (
          <li key={q.id} className="rounded-xl border border-line p-3">
            <p className="font-semibold">{q.title}</p>
            <p className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted">
              <span className="rounded-full bg-chip px-2 py-0.5 font-bold text-brand">
                {TYPE_LABELS[q.type]}
              </span>
              <span className="rounded-full bg-gold-100 px-2 py-0.5 font-bold text-gold-700">
                {maxPoints(q)} نقطة
              </span>
              {q.section && <span className="rounded-full bg-line px-2 py-0.5">{q.section}</span>}
              <span className="rounded-full bg-line px-2 py-0.5">
                رحلة: {q.schedules?.name ?? '—'}
              </span>
            </p>

            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button
                className="min-h-0 px-3 py-1.5 text-xs"
                loading={busyId === q.id}
                onClick={() => act(q, 'accept')}
              >
                أضف إلى المكتبة
              </Button>
              <Button
                tone="outline"
                className="min-h-0 px-3 py-1.5 text-xs"
                disabled={busyId === q.id}
                onClick={() => act(q, 'dismiss')}
              >
                تجاهل
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
