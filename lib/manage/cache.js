'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A tiny stale-while-revalidate cache for the manage screens.
 *
 * Each manage tab fetches its schedule's lists on mount, so switching tabs — or
 * re-selecting a schedule from the picker — used to blank the screen to a
 * skeleton and re-hit the database every time. This keeps the last result per
 * (screen, schedule) key in memory: a return visit paints instantly from the
 * cache, then revalidates in the background so the data is never stale for long.
 *
 * It is deliberately not a general data layer. Correctness comes from one rule:
 * every mount revalidates. The cache only decides whether the user stares at a
 * skeleton while that happens. Optimistic writes flow through `setData`, which
 * updates the cache too, so an edit made on one screen survives a trip to
 * another and back.
 */

const store = new Map();

/** The cached entry for a key, or undefined. Exposed for tests and seeding. */
export function cacheGet(key) {
  return key ? store.get(key) : undefined;
}

export function cacheSet(key, data) {
  if (key) store.set(key, { data, ts: Date.now() });
}

/**
 * Drop cached entries. With no argument, everything (used on sign-out). With a
 * string, every key that starts with it. With a function, every key it matches.
 */
export function cacheInvalidate(match) {
  if (match === undefined) {
    store.clear();
    return;
  }
  const test =
    typeof match === 'function' ? match : (key) => key === match || key.startsWith(`${match}:`);
  for (const key of [...store.keys()]) {
    if (test(key)) store.delete(key);
  }
}

/**
 * Read a resource with stale-while-revalidate semantics.
 *
 * `key` may be null while its inputs are still unknown (no schedule selected
 * yet); the hook stays idle until a real key arrives. `fetcher` is read from a
 * ref so an inline arrow does not re-trigger the effect on every render.
 *
 * Returns the same surface the screens already used — `{ data, loading, error,
 * setData, reload }` — so adopting it is a local change, not a rewrite. `setData`
 * accepts a value or an updater and writes through to the cache.
 */
export function useCachedResource(key, fetcher) {
  const [data, setData] = useState(() => cacheGet(key)?.data ?? null);
  const [loading, setLoading] = useState(() => !cacheGet(key));
  const [error, setError] = useState('');

  // Keep the latest fetcher in a ref so an inline arrow does not re-fire the
  // effect every render; updated in an effect rather than during render.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The key the component currently wants. A fetch started for a previous key
  // (the user switched schedules mid-flight) still caches its own result, but
  // must not paint it over the newer key's data.
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const revalidate = useCallback(async () => {
    if (!key) return;
    try {
      const fresh = await fetcherRef.current();
      cacheSet(key, fresh); // cache under its own key regardless of what is current
      if (alive.current && keyRef.current === key) {
        setData(fresh);
        setError('');
      }
    } catch (err) {
      if (alive.current && keyRef.current === key) setError(err?.message || 'تعذّر التحميل');
    } finally {
      if (alive.current && keyRef.current === key) setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (!key) {
      setData(null);
      setLoading(false);
      return;
    }
    const hit = cacheGet(key);
    // Paint the cached copy immediately; only fall back to a skeleton on a miss.
    setData(hit?.data ?? null);
    setLoading(!hit);
    setError('');
    revalidate();
  }, [key, revalidate]);

  // Write-through: optimistic edits update the on-screen state and the cache
  // together, so they are not lost when the screen unmounts.
  const update = useCallback(
    (updater) => {
      setData((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        cacheSet(key, next);
        return next;
      });
    },
    [key],
  );

  return { data, loading, error, setData: update, reload: revalidate };
}
