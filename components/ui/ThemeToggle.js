'use client';

import { useEffect, useState } from 'react';

const KEY = 'tracker.theme';
const OPTIONS = [
  { value: 'system', label: 'تلقائي' },
  { value: 'light', label: 'فاتح' },
  { value: 'dark', label: 'داكن' },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState('system');

  useEffect(() => {
    setTheme(window.localStorage.getItem(KEY) || 'system');
  }, []);

  function apply(next) {
    setTheme(next);
    window.localStorage.setItem(KEY, next);
    if (next === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', next);
  }

  return (
    <div role="radiogroup" aria-label="المظهر" className="flex gap-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={theme === opt.value}
          onClick={() => apply(opt.value)}
          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
            theme === opt.value
              ? 'border-navy-700 bg-navy-700 text-white'
              : 'border-line text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
