'use client';

import { useEffect, useState } from 'react';
import { pendingCount } from './outbox';

export function useOnline() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}

export function usePendingCount(pollMs = 3000) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      pendingCount()
        .then((n) => {
          if (alive) setCount(n);
        })
        .catch(() => {});

    tick();
    const timer = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pollMs]);

  return count;
}
