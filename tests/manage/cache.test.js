import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  cacheGet,
  cacheSet,
  cacheInvalidate,
  useCachedResource,
} from '@/lib/manage/cache';

beforeEach(() => {
  cacheInvalidate(); // clear everything between tests
});

describe('cache store', () => {
  it('round-trips a value', () => {
    cacheSet('students:a', [1, 2, 3]);
    expect(cacheGet('students:a').data).toEqual([1, 2, 3]);
  });

  it('ignores a null key', () => {
    cacheSet(null, [1]);
    expect(cacheGet(null)).toBeUndefined();
  });

  it('invalidates by exact key and by prefix, leaving siblings alone', () => {
    cacheSet('students:a', 1);
    cacheSet('students:b', 2);
    cacheSet('questions:a', 3);

    cacheInvalidate('students'); // prefix
    expect(cacheGet('students:a')).toBeUndefined();
    expect(cacheGet('students:b')).toBeUndefined();
    expect(cacheGet('questions:a').data).toBe(3);

    cacheSet('students:a', 1);
    cacheInvalidate('students:a'); // exact
    expect(cacheGet('students:a')).toBeUndefined();
  });

  it('prefix match does not catch an unrelated longer key', () => {
    cacheSet('studentsX:a', 1); // must not be caught by the "students" prefix
    cacheInvalidate('students');
    expect(cacheGet('studentsX:a').data).toBe(1);
  });

  it('invalidates by predicate', () => {
    cacheSet('students:a', 1);
    cacheSet('questions:a', 2);
    cacheInvalidate((key) => key.startsWith('questions'));
    expect(cacheGet('students:a').data).toBe(1);
    expect(cacheGet('questions:a')).toBeUndefined();
  });
});

describe('useCachedResource', () => {
  it('shows a skeleton on a cold miss, then the fetched data', async () => {
    const fetcher = vi.fn().mockResolvedValue(['x']);
    const { result } = renderHook(() => useCachedResource('students:a', fetcher));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(['x']);
    expect(cacheGet('students:a').data).toEqual(['x']);
  });

  it('paints cached data instantly (no skeleton) and revalidates in the background', async () => {
    cacheSet('students:a', ['old']);
    const fetcher = vi.fn().mockResolvedValue(['new']);

    const { result } = renderHook(() => useCachedResource('students:a', fetcher));

    // Instant: cached value, never a loading state.
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(['old']);

    await waitFor(() => expect(result.current.data).toEqual(['new']));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('surfaces a fetch error without discarding cached data', async () => {
    cacheSet('students:a', ['old']);
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useCachedResource('students:a', fetcher));

    await waitFor(() => expect(result.current.error).toBe('offline'));
    expect(result.current.data).toEqual(['old']); // kept, not blanked
  });

  it('stays idle while the key is null', async () => {
    const fetcher = vi.fn();
    const { result } = renderHook(() => useCachedResource(null, fetcher));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('setData writes through to the cache so optimistic edits survive a remount', async () => {
    cacheSet('students:a', [{ id: 1, active: true }]);
    const fetcher = vi.fn().mockResolvedValue([{ id: 1, active: true }]);

    const { result, unmount } = renderHook(() => useCachedResource('students:a', fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setData((rows) => rows.map((r) => ({ ...r, active: false })));
    });
    expect(cacheGet('students:a').data).toEqual([{ id: 1, active: false }]);

    unmount();
    // A late background resolve must not touch state after unmount (no act warning).
    await Promise.resolve();
  });

  it('a slow fetch for the old key does not paint over the new key', async () => {
    let resolveOld;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r))) // key a: hangs
      .mockResolvedValueOnce(['b-data']); // key b: resolves right away

    const { result, rerender } = renderHook(({ k }) => useCachedResource(k, fetcher), {
      initialProps: { k: 'students:a' },
    });

    rerender({ k: 'students:b' });
    await waitFor(() => expect(result.current.data).toEqual(['b-data']));

    // The stale 'a' fetch finally resolves — it must not clobber the 'b' view.
    await act(async () => {
      resolveOld(['a-data-late']);
      await Promise.resolve();
    });
    expect(result.current.data).toEqual(['b-data']);
    // …but it is still cached under its own key for a later visit.
    expect(cacheGet('students:a').data).toEqual(['a-data-late']);
  });

  it('refetches when the key changes and caches each separately', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(['a-data'])
      .mockResolvedValueOnce(['b-data']);

    const { result, rerender } = renderHook(({ k }) => useCachedResource(k, fetcher), {
      initialProps: { k: 'students:a' },
    });
    await waitFor(() => expect(result.current.data).toEqual(['a-data']));

    rerender({ k: 'students:b' });
    await waitFor(() => expect(result.current.data).toEqual(['b-data']));

    expect(cacheGet('students:a').data).toEqual(['a-data']);
    expect(cacheGet('students:b').data).toEqual(['b-data']);
  });
});
