'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_EMOJI_CHOICES, fetchEmojiChoices } from '@/lib/identity/emojis';
import { getBrowserClient } from '@/lib/supabase/browser';

/**
 * A grid of emoji the user picks as their public identity. The gallery is the
 * admin-managed set (fetched on mount); the static defaults show first so the
 * grid never flashes empty and still works offline. The selected one carries a
 * filled chip + ring so the choice never rests on colour alone.
 */
export function EmojiPicker({ value, onChange, name = 'emoji' }) {
  const [choices, setChoices] = useState(DEFAULT_EMOJI_CHOICES);

  useEffect(() => {
    let alive = true;
    fetchEmojiChoices(getBrowserClient()).then((list) => {
      if (alive) setChoices(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="اختر رمزك"
      className="grid grid-cols-8 gap-1.5 rounded-xl border border-line bg-panel p-2"
    >
      {choices.map((emoji) => {
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
