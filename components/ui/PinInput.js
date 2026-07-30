'use client';

import { useRef } from 'react';
import { toWesternDigits } from '@/lib/auth/digits';

export function PinInput({ value = '', onChange, length = 6, label = 'الرمز', disabled = false }) {
  const refs = useRef([]);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');

  /**
   * The box this component itself just moved to, so the guard below can tell a
   * move it made from a tap somewhere unexpected.
   *
   * Advancing happens synchronously inside the change handler, before React has
   * re-rendered with the digit just typed. Without this, the guard asked "may
   * this box be focused?" of a state where that digit did not exist yet,
   * decided no, and sent focus straight back — so the caret never left the
   * first box and no code longer than one digit could be entered at all.
   */
  const wanted = useRef(null);

  const emit = (next) => onChange(next.join('').trimEnd());

  function focusBox(index) {
    wanted.current = index;
    refs.current[index]?.focus();
  }

  /** Index of the first blank box, or the last box when the code is full. */
  const firstEmpty = () => {
    const index = digits.findIndex((d) => d === ' ');
    return index === -1 ? length - 1 : index;
  };

  function handleChange(index, raw) {
    // Arabic-Indic digits arrive from an Arabic keyboard and are not matched by
    // \d, so they were silently dropped and nothing appeared to be typed.
    let cleaned = toWesternDigits(raw).replace(/\D/g, '');

    // Typing over a box that already holds a digit leaves both in the field,
    // and which side the new one lands on depends on where the caret was. Drop
    // the digit that was already there and whatever remains is the new one —
    // otherwise correcting the second digit of a code needed a Backspace first,
    // which nobody guessed.
    const current = digits[index] === ' ' ? '' : digits[index];
    if (cleaned.length > 1 && current) {
      const at = cleaned.indexOf(current);
      if (at !== -1) cleaned = cleaned.slice(0, at) + cleaned.slice(at + 1);
    }

    const digit = cleaned.slice(-1);
    if (!digit) return;

    // The code is written left to right with no gaps. A digit aimed past the
    // first blank box lands in that box instead of leaving a hole behind it —
    // an iOS keyboard can deliver input to a box the focus rules never let the
    // reader reach, and the result was a code that looked complete and was not.
    const target = Math.min(index, firstEmpty());

    const next = [...digits];
    next[target] = digit;
    emit(next);
    if (target < length - 1) focusBox(target + 1);
  }

  function handleKeyDown(index, event) {
    if (event.key !== 'Backspace') return;
    event.preventDefault();

    const next = [...digits];
    if (next[index] !== ' ') {
      next[index] = ' ';
    } else if (index > 0) {
      next[index - 1] = ' ';
      focusBox(index - 1);
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
    focusBox(Math.min(pasted.length, length - 1));
  }

  /**
   * The code is entered in order: the next box you may reach is the first blank
   * one. Tapping the third box of an empty code used to put the caret there and
   * do nothing useful — the digit typed landed in the middle, leaving a code
   * that looked six long and was not. Boxes at or before the first blank stay
   * reachable, so a digit already typed can still be corrected.
   */
  function handleFocus(index, event) {
    const invited = wanted.current === index;
    wanted.current = null;

    if (!invited && index > firstEmpty()) {
      focusBox(firstEmpty());
      return;
    }
    // A box that already holds a digit is selected on arrival, so the next
    // keystroke replaces it rather than sitting beside it.
    event.target.select();
  }

  /**
   * Taps are turned away before the caret moves at all. Relying on the focus
   * handler alone worked, but the caret flickered through the box that was
   * tapped, which reads as "it let me in and then changed its mind".
   */
  function handlePointerDown(index, event) {
    const target = firstEmpty();
    if (index <= target) return;
    event.preventDefault();
    focusBox(target);
  }

  const nextBox = firstEmpty();

  return (
    <div className="flex justify-center gap-2" dir="ltr" role="group" aria-label={label}>
      {digits.map((digit, index) => {
        // Not `disabled`: a disabled box cannot receive a paste, and pasting the
        // whole code out of a message is how most students enter it.
        const reachable = index <= nextBox;

        return (
          <input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="text"
            role="textbox"
            inputMode="numeric"
            autoComplete="one-time-code"
            disabled={disabled}
            tabIndex={reachable ? 0 : -1}
            aria-label={`${label} - الخانة ${index + 1}`}
            value={digit.trim()}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onFocus={(e) => handleFocus(index, e)}
            onPointerDown={(e) => handlePointerDown(index, e)}
            onPaste={handlePaste}
            // Every box looks the same. Fading the ones that cannot be typed in
            // yet washed a pale border out to nothing on a white screen, and the
            // six boxes read as one — so a code six digits long looked like a
            // field for a single number.
            className="size-12 rounded-xl border border-line bg-panel text-center text-xl font-bold text-ink outline-none transition focus:border-navy-500 focus:ring-2 focus:ring-navy-500/25 disabled:opacity-60"
          />
        );
      })}
    </div>
  );
}
