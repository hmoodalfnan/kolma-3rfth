'use client';

import { useEffect } from 'react';

/**
 * Applies a manual theme override. The system preference is handled in CSS via
 * `prefers-color-scheme`, so this only runs for users who chose to differ from
 * their OS setting — done here rather than as an inline boot script, since
 * raw HTML injection is banned repo-wide by the CSP and the ESLint config.
 */
export function ThemeBoot() {
  useEffect(() => {
    try {
      const theme = window.localStorage.getItem('qawafel.theme');
      if (theme && theme !== 'system') {
        document.documentElement.setAttribute('data-theme', theme);
      }
    } catch {
      // Private mode or blocked storage: fall back to the system preference.
    }
  }, []);

  return null;
}
