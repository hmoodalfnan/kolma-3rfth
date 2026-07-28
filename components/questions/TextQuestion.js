'use client';

export function TextQuestion({ question, value, onChange, disabled }) {
  const maxLength = question.config?.max_length ?? 500;
  const current = typeof value === 'string' ? value : '';
  const id = `q_${question.id}`;

  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <label htmlFor={id} className="mb-2 block font-semibold text-ink">
        {question.title}
      </label>
      <textarea
        id={id}
        aria-label={question.title}
        maxLength={maxLength}
        disabled={disabled}
        value={current}
        onChange={(e) => !disabled && onChange(e.target.value)}
        className="min-h-24 w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/25 disabled:opacity-60"
      />
      <p className="mt-1 text-left text-xs text-muted" dir="ltr">
        {current.length} / {maxLength}
      </p>
    </div>
  );
}
