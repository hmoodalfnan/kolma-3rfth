'use client';

export function CounterQuestion({ question, value, onChange, disabled }) {
  const max = question.config?.max ?? 1;
  const unit = question.config?.unit_label ?? '';
  const current = typeof value === 'number' ? value : 0;

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
          className="size-11 rounded-xl border border-line text-xl font-bold text-navy-700 disabled:opacity-40"
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
          className="size-11 rounded-xl border border-line text-xl font-bold text-navy-700 disabled:opacity-40"
        >
          +
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-muted">الحد الأقصى {max}</p>
    </div>
  );
}
