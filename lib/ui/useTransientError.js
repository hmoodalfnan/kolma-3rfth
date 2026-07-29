'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_MS = 12000;

/**
 * An error message that clears itself.
 *
 * A failure banner used to sit at the top of a screen until the component
 * unmounted, so an error from one action was still on screen minutes later
 * while looking at something unrelated — it read as a fresh failure of whatever
 * was being done at the time. Twelve seconds is long enough to read a sentence
 * and short enough that it never outlives the thing it describes.
 *
 * Drop-in for `useState('')`: the setter takes the same values.
 */
export function useTransientError(ms = DEFAULT_MS) {
  const [error, setErrorState] = useState('');
  const timer = useRef(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const setError = useCallback(
    (value) => {
      clear();
      const message = typeof value === 'string' ? value : (value?.message ?? '');
      setErrorState(message);
      // Re-setting the same message restarts the clock, so a repeated failure
      // does not disappear early.
      if (message) timer.current = setTimeout(() => setErrorState(''), ms);
    },
    [clear, ms],
  );

  useEffect(() => clear, [clear]);

  return [error, setError];
}
