'use client';

import { useRef } from 'react';
import { toWesternDigits } from '@/lib/auth/digits';

export function PinInput({ value = '', onChange, length = 6, label = 'الرمز', disabled = false }) {
  const refs = useRef([]);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');

  const emit = (next) => onChange(next.join('').trimEnd());

  /** Index of the first blank box, or the last box when the code is full. */
  const firstEmpty = () => {
    const index = digits.findIndex((d) => d === ' ');
    return index === -1 ? length - 1 : index;
  };

  function handleChange(index, raw) {
    // Arabic-Indic digits arrive from an Arabic keyboard and are not matched by
    // \d, so they were silently dropped and nothing appeared to be typed.
    const digit = toWesternDigits(raw).replace(/\D/g, '').slice(-1);
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
    const pasted = toWesternDigits(event.clipboardData.getData('text'))
      .replace(/\D/g, '')
      .slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    emit(pasted.padEnd(length, ' ').split(''));
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  /**
   * Tapping the third box of an empty code used to put the caret there and do
   * nothing useful — the digit typed would land in the middle. An empty code
   * always starts at the first box. Once something is typed, taps land where
   * they were aimed so a single digit can be corrected.
   */
  function handleFocus(index) {
    const target = firstEmpty();
    if (value.length === 0 && index !== 0) {
      refs.current[0]?.focus();
    } else if (index > target && digits[index] === ' ') {
      refs.current[target]?.focus();
    }
  }

  return (
    <div className="flex justify-center gap-2" dir="ltr" role="group" aria-label={label}>
      {digits.map((digit, index) => (
        <input
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
          onFocus={() => handleFocus(index)}
          onPaste={handlePaste}
          className="size-12 rounded-xl border border-line bg-panel text-center text-xl font-bold text-ink outline-none transition focus:border-navy-500 focus:ring-2 focus:ring-navy-500/25 disabled:opacity-60"
        />
      ))}
    </div>
  );
}
