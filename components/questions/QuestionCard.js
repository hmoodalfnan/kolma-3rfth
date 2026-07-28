'use client';

import { RENDERERS } from './index';
import { scoreAnswer, maxPoints } from '@/lib/points/score';
import { Skeleton } from '@/components/ui/Skeleton';

export function QuestionCard({ question, value, onChange, disabled }) {
  const Renderer = RENDERERS[question.type];
  if (!Renderer) return <Skeleton className="h-16" />;

  const earned = scoreAnswer(question, value);
  const max = maxPoints(question);

  return (
    <div className="space-y-1">
      <Renderer question={question} value={value} onChange={onChange} disabled={disabled} />
      <div className="flex items-center justify-between px-1">
        {question.help_text ? (
          <p className="text-xs text-muted">{question.help_text}</p>
        ) : (
          <span />
        )}
        {max > 0 && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
              earned > 0 ? 'bg-gold-100 text-gold-700' : 'bg-line/60 text-muted'
            }`}
            dir="ltr"
          >
            {earned} / {max}
          </span>
        )}
      </div>
    </div>
  );
}
