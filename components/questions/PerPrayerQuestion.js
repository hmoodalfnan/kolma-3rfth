'use client';

import { PRAYERS, PRAYER_LABELS } from '@/lib/questions/types';

export function PerPrayerQuestion({ question, value, onChange, disabled }) {
  const prayers = question.config?.prayers?.length ? question.config.prayers : PRAYERS;
  const current = value ?? {};

  const toggle = (prayer, checked) => {
    if (disabled) return;
    onChange({ ...current, [prayer]: checked });
  };

  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <p className="mb-2 font-semibold text-ink">{question.title}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {prayers.map((prayer) => {
          const checked = current[prayer] === true;
          return (
            <label
              key={prayer}
              className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-sm transition ${
                checked ? 'border-accent bg-chip' : 'border-line'
              } ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
            >
              <span>{PRAYER_LABELS[prayer]}</span>
              <input
                type="checkbox"
                aria-label={PRAYER_LABELS[prayer]}
                checked={checked}
                disabled={disabled}
                onChange={(e) => toggle(prayer, e.target.checked)}
                className="size-5 shrink-0 accent-[color:var(--color-accent)]"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
