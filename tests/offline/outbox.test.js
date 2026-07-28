import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearMirror } from '@/lib/offline/db';
import { enqueue, pending, pendingCount, remove } from '@/lib/offline/outbox';

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

describe('outbox', () => {
  it('queues an operation and reports it as pending', async () => {
    await enqueue(op());
    expect(await pendingCount()).toBe(1);
    expect((await pending())[0].value).toBe(true);
  });

  it('replaces rather than stacks when the same item is tapped again', async () => {
    await enqueue(op({ value: true, clientUpdatedAt: '2026-08-01T10:00:00.000Z' }));
    await enqueue(op({ value: false, clientUpdatedAt: '2026-08-01T10:00:05.000Z' }));

    const queued = await pending();
    expect(queued).toHaveLength(1);
    expect(queued[0].value).toBe(false);
    expect(queued[0].clientUpdatedAt).toBe('2026-08-01T10:00:05.000Z');
  });

  it('keeps operations for different days separate', async () => {
    await enqueue(op({ entryDate: '2026-08-01' }));
    await enqueue(op({ entryDate: '2026-08-02' }));
    expect(await pendingCount()).toBe(2);
  });

  it('keeps operations for different questions separate', async () => {
    await enqueue(op({ questionId: 'q1' }));
    await enqueue(op({ questionId: 'q2' }));
    expect(await pendingCount()).toBe(2);
  });

  it('preserves insertion order across distinct keys', async () => {
    await enqueue(op({ questionId: 'q1' }));
    await enqueue(op({ questionId: 'q2' }));
    expect((await pending()).map((o) => o.questionId)).toEqual(['q1', 'q2']);
  });

  it('removes a single operation by sequence number', async () => {
    await enqueue(op({ questionId: 'q1' }));
    await enqueue(op({ questionId: 'q2' }));
    const [first] = await pending();
    await remove(first.seq);
    expect((await pending()).map((o) => o.questionId)).toEqual(['q2']);
  });

  it('writes the value into the local answers mirror immediately', async () => {
    await enqueue(op({ value: true }));
    const local = await db.answers.get(['s1', 'q1', '2026-08-01']);
    expect(local.value).toBe(true);
    expect(local.dirty).toBe(true);
  });
});
