'use client';

import { useRef } from 'react';

export function PinInput({ value = '', onChange, length = 6, label = 'الرمز', disabled = false }) {
  const refs = useRef([]);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');

  const emit = (next) => onChange(next.join('').trimEnd());

  function handleChange(index, raw) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    if (!digit) return;

    const next = [...digits];
    next[index] = digit;
    emit(next);
    if (index < length - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index, event) {
    if (event.key !== 'Backspace') return;
    event.preventDefault();

    const next = [...digits];
    if (next[index] !== ' ') {
      next[index] = ' ';
    } else if (index > 0) {
      next[index - 1] = ' ';
      refs.current[index - 1]?.focus();
    }
    emit(next);
  }

  function handlePaste(event) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    emit(pasted.padEnd(length, ' ').split(''));
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div className="flex justify-center gap-2" dir="ltr" role="group" aria-label={label}>
      {digits.map((digit, index) => (
        <input
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          role="textbox"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          aria-label={`${label} - الخانة ${index + 1}`}
          value={digit.trim()}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className="size-12 rounded-xl border border-line bg-panel text-center text-xl font-bold text-ink outline-none transition focus:border-navy-500 focus:ring-2 focus:ring-navy-500/25 disabled:opacity-60"
        />
      ))}
    </div>
  );
}
