'use client';

export function BoolQuestion({ question, value, onChange, disabled }) {
  const checked = value === true;

  return (
    <label
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 transition ${
        checked ? 'border-navy-300 bg-navy-50' : 'border-line bg-panel'
      } ${disabled ? 'opacity-60' : 'cursor-pointer hover:border-navy-300'}`}
    >
      <span className="font-semibold text-ink">{question.title}</span>
      <input
        type="checkbox"
        aria-label={question.title}
        checked={checked}
        disabled={disabled}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        className="size-6 shrink-0 accent-[color:var(--color-navy-700)]"
      />
    </label>
  );
}
