'use client';

import { EMOJI_CHOICES } from '@/lib/identity/emojis';

/**
 * A grid of emoji the user picks as their public identity. The selected one
 * carries a filled chip + ring so the choice never rests on colour alone.
 */
export function EmojiPicker({ value, onChange, name = 'emoji' }) {
  return (
    <div
      role="radiogroup"
      aria-label="اختر رمزك"
      className="grid grid-cols-8 gap-1.5 rounded-xl border border-line bg-panel p-2"
    >
      {EMOJI_CHOICES.map((emoji) => {
        const selected = value === emoji;
        return (
          <button
            key={emoji}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={emoji}
            onClick={() => onChange(emoji)}
            className={`flex aspect-square items-center justify-center rounded-lg text-xl transition ${
              selected
                ? 'bg-accent ring-2 ring-accent'
                : 'bg-chip hover:bg-accent-soft'
            }`}
          >
            <span aria-hidden="true">{emoji}</span>
          </button>
        );
      })}
      <input type="hidden" name={name} value={value || ''} />
    </div>
  );
}
