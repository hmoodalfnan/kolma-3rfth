'use client';

export function RatingQuestion({ question, value, onChange, disabled }) {
  const max = question.config?.max ?? 5;
  const current = typeof value === 'number' ? value : 0;

  const set = (n) => {
    if (disabled) return;
    onChange(Math.min(max, Math.max(0, n)));
  };

  function handleKeyDown(event) {
    if (disabled) return;
    // In an RTL page, ArrowLeft advances visually forwards.
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      set(current + 1);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      set(current - 1);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <p className="mb-3 font-semibold text-ink">{question.title}</p>
      <div
        role="radiogroup"
        aria-label={question.title}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        className="flex justify-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-navy-500/40"
      >
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={current === n}
            aria-label={`${n} من ${max}`}
            disabled={disabled}
            onClick={() => set(current === n ? 0 : n)}
            className={`size-11 rounded-lg text-2xl leading-none transition ${
              n <= current ? 'text-gold-500' : 'text-line'
            } disabled:opacity-60`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}
