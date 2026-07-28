'use client';

export function MultiChoiceQuestion({ question, value, onChange, disabled }) {
  const options = question.config?.options ?? [];
  const selected = Array.isArray(value) ? value : [];

  const toggle = (id) => {
    if (disabled) return;
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <fieldset className="rounded-xl border border-line bg-panel p-3" disabled={disabled}>
      <legend className="px-1 font-semibold text-ink">{question.title}</legend>
      <div className="mt-2 space-y-2">
        {options.map((opt) => {
          const checked = selected.includes(opt.id);
          return (
            <label
              key={opt.id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition ${
                checked ? 'border-navy-300 bg-navy-50' : 'border-line'
              } ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
            >
              <span className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  aria-label={opt.label}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(opt.id)}
                  className="size-5 accent-[color:var(--color-navy-700)]"
                />
                <span className="text-sm font-medium">{opt.label}</span>
              </span>
              <span className="text-xs font-bold text-muted">
                {opt.points > 0 ? `+${opt.points}` : opt.points}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
