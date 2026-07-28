import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, clearMirror } from '@/lib/offline/db';
import { enqueue, pendingCount } from '@/lib/offline/outbox';
import { flush } from '@/lib/offline/sync';

function fakeClient(behaviour) {
  return {
    from: () => ({
      upsert: (rows) => Promise.resolve(behaviour(rows)),
    }),
  };
}

const op = (over = {}) => ({
  studentId: 's1',
  questionId: 'q1',
  entryDate: '2026-08-01',
  value: true,
  clientUpdatedAt: '2026-08-01T10:00:00.000Z',
  deviceId: 'dev',
  ...over,
});

beforeEach(async () => {
  await clearMirror();
});

describe('flush', () => {
  it('pushes every queued op and empties the outbox on success', async () => {
    await enqueue(op({ questionId: 'q1' }));
    await enqueue(op({ questionId: 'q2' }));

    const result = await flush(fakeClient(() => ({ error: null })));

    expect(result.pushed).toBe(2);
    expect(result.rejected).toEqual([]);
    expect(await pendingCount()).toBe(0);
  });

  it('clears the dirty flag on synced rows', async () => {
    await enqueue(op());
    await flush(fakeClient(() => ({ error: null })));
    const row = await db.answers.get(['s1', 'q1', '2026-08-01']);
    expect(row.dirty).toBe(false);
  });

  it('keeps an op queued when the push fails with a network error', async () => {
    await enqueue(op());
    const result = await flush(fakeClient(() => ({ error: { message: 'Failed to fetch' } })));

    expect(result.pushed).toBe(0);
    expect(await pendingCount()).toBe(1);
  });

  it('drops an op the server rejects on business rules and reports it', async () => {
    await enqueue(op());
    const result = await flush(
      fakeClient(() => ({ error: { code: 'P0001', message: 'انتهت مهلة التعديل على هذا اليوم' } })),
    );

    expect(result.pushed).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].error).toMatch(/انتهت مهلة/);
    expect(await pendingCount()).toBe(0);
  });

  it('is a no-op with an empty outbox', async () => {
    const upsert = vi.fn();
    const result = await flush({ from: () => ({ upsert }) });
    expect(result).toEqual({ pushed: 0, rejected: [] });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('never runs two flushes concurrently', async () => {
    await enqueue(op());
    let inflight = 0;
    let overlapped = false;
    const client = fakeClient(() => {
      inflight += 1;
      if (inflight > 1) overlapped = true;
      inflight -= 1;
      return { error: null };
    });

    await Promise.all([flush(client), flush(client)]);
    expect(overlapped).toBe(false);
  });
});
