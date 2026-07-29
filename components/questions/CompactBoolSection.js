'use client';

import { scoreAnswer, maxPoints } from '@/lib/points/score';

/**
 * A whole section of yes/no deeds as one grid.
 *
 * السنن الرواتب is five separate cards, each a full-width row for a single
 * checkbox — half a phone screen to answer five questions that belong together.
 * Rendered like the per-prayer card instead: one heading, five tap targets.
 *
 * Only used when every question in the section is a bool, so nothing with its
 * own controls gets flattened into a checkbox.
 */
export function CompactBoolSection({ section, items, values, disabled, onChange }) {
  const prefix = commonPrefix(items.map((q) => q.title));

  const earned = items.reduce((sum, q) => sum + scoreAnswer(q, values[q.id]), 0);
  const possible = items.reduce((sum, q) => sum + maxPoints(q), 0);

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-2">
        <h2 className="min-w-0 text-sm font-bold text-brand">{section}</h2>
        {possible > 0 && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
              earned > 0 ? 'bg-gold-100 text-gold-700' : 'bg-line/60 text-muted'
            }`}
            dir="ltr"
          >
            {earned} / {possible}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((q) => {
          const checked = values[q.id] === true;
          // The shared prefix lives in the heading, so "سنة الظهر القبلية"
          // shows as "الظهر القبلية" and قبلية/بعدية stay tellable apart.
          const label = q.title.slice(prefix.length).trim() || q.title;

          return (
            <label
              key={q.id}
              className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2.5 text-sm transition ${
                checked ? 'border-accent bg-chip' : 'border-line'
              } ${disabled ? 'opacity-60' : 'cursor-pointer hover:border-accent'}`}
            >
              <span className="min-w-0 break-words font-semibold">{label}</span>
              <input
                type="checkbox"
                aria-label={q.title}
                checked={checked}
                disabled={disabled}
                onChange={(e) => !disabled && onChange(q.id, e.target.checked)}
                className="size-5 shrink-0 accent-[color:var(--color-accent)]"
              />
            </label>
          );
        })}
      </div>

      {items.some((q) => q.help_text) && (
        <ul className="mt-2 space-y-0.5">
          {items
            .filter((q) => q.help_text)
            .map((q) => (
              <li key={q.id} className="break-words text-xs text-muted">
                {q.title.slice(prefix.length).trim() || q.title}: {q.help_text}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The leading words every title shares, e.g. "سنة " across the rawatib.
 * Whole words only, so "الظهر" and "الظهيرة" are not merged on a partial match.
 */
function commonPrefix(titles) {
  if (titles.length < 2) return '';

  const wordLists = titles.map((t) => t.trim().split(/\s+/));
  const shortest = Math.min(...wordLists.map((w) => w.length));

  let shared = 0;
  // Never consume the entire shortest title — a label has to survive.
  for (let i = 0; i < shortest - 1; i += 1) {
    const word = wordLists[0][i];
    if (!wordLists.every((w) => w[i] === word)) break;
    shared += 1;
  }

  return shared === 0 ? '' : `${wordLists[0].slice(0, shared).join(' ')} `;
}
