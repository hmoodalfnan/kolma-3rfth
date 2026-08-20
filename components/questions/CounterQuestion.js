'use client';

export function CounterQuestion({ question, value, onChange, disabled }) {
  const max = question.config?.max ?? 1;
  const target = question.config?.target ?? max;
  const unit = question.config?.unit_label ?? '';
  const current = typeof value === 'number' ? value : 0;
  // Percent of the target (the question's 100%); passing it is bonus above 100%.
  const pct = target > 0 ? Math.round((current / target) * 100) : 0;
  const overTarget = current > target;

  const step = (delta) => {
    if (disabled) return;
    onChange(Math.min(max, Math.max(0, current + delta)));
  };

  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <p className="mb-3 font-semibold text-ink">{question.title}</p>
      <div className="flex items-center justify-center gap-4" dir="ltr">
        <button
          type="button"
          aria-label={`إنقاص ${question.title}`}
          disabled={disabled || current <= 0}
          onClick={() => step(-1)}
          className="size-11 rounded-xl border border-line text-xl font-bold text-brand disabled:opacity-40"
        >
          −
        </button>
        <output
          aria-label={question.title}
          className="min-w-24 text-center text-2xl font-bold tabular-nums text-ink"
        >
          {current}
          {unit && <span className="ms-1 text-sm font-medium text-muted">{unit}</span>}
        </output>
        <button
          type="button"
          aria-label={`زيادة ${question.title}`}
          disabled={disabled || current >= max}
          onClick={() => step(1)}
          className="size-11 rounded-xl border border-line text-xl font-bold text-brand disabled:opacity-40"
        >
          +
        </button>
      </div>
      <div className="mt-2 flex items-center justify-center gap-2 text-xs">
        <span className="text-muted">
          الهدف {target}
          {target !== max && <span className="text-muted"> · الأقصى {max}</span>}
        </span>
        {current > 0 && (
          <span
            className={`rounded-full px-2 py-0.5 font-bold ${
              overTarget
                ? 'bg-gold-100 text-gold-700'
                : pct >= 100
                  ? 'bg-accent-soft text-accent'
                  : 'bg-chip text-chip-ink'
            }`}
          >
            {pct}%{overTarget && ' 🎉'}
          </span>
        )}
      </div>
    </div>
  );
}
