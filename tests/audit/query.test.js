import { describe, it, expect } from 'vitest';
import { fetchAuditLog, describeEntry } from '@/lib/audit/query';

function fakeClient(rows = []) {
  const calls = { eq: [], gte: [], lte: [], lt: [], order: [], limit: [] };
  const builder = {
    select: () => builder,
    eq: (c, v) => {
      calls.eq.push([c, v]);
      return builder;
    },
    gte: (c, v) => {
      calls.gte.push([c, v]);
      return builder;
    },
    lte: (c, v) => {
      calls.lte.push([c, v]);
      return builder;
    },
    lt: (c, v) => {
      calls.lt.push([c, v]);
      return builder;
    },
    order: (c, o) => {
      calls.order.push([c, o?.ascending]);
      return builder;
    },
    limit: (n) => {
      calls.limit.push(n);
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return { client: { from: () => builder }, calls };
}

describe('fetchAuditLog', () => {
  it('constrains by schedule when one is supplied', async () => {
    const { client, calls } = fakeClient([]);
    await fetchAuditLog(client, { scheduleId: 'sch1' });
    expect(calls.eq).toContainEqual(['schedule_id', 'sch1']);
  });

  it('applies no schedule constraint for the super-admin view', async () => {
    const { client, calls } = fakeClient([]);
    await fetchAuditLog(client, { scheduleId: null });
    expect(calls.eq.map(([c]) => c)).not.toContain('schedule_id');
  });

  it('composes actor, action, and date filters', async () => {
    const { client, calls } = fakeClient([]);
    await fetchAuditLog(client, {
      actorId: 'u1',
      action: 'grant',
      entityType: 'point_event',
      from: '2026-08-01',
      to: '2026-08-10',
    });
    expect(calls.eq).toContainEqual(['actor_user_id', 'u1']);
    expect(calls.eq).toContainEqual(['action', 'grant']);
    expect(calls.eq).toContainEqual(['entity_type', 'point_event']);
    expect(calls.gte[0][0]).toBe('created_at');
    expect(calls.lte[0][0]).toBe('created_at');
  });

  it('orders newest first', async () => {
    const { client, calls } = fakeClient([]);
    await fetchAuditLog(client, {});
    expect(calls.order).toEqual([['id', false]]);
  });

  it('returns a cursor only when the page is full', async () => {
    const full = Array.from({ length: 50 }, (_, i) => ({ id: 100 - i }));
    const { client: a } = fakeClient(full);
    expect((await fetchAuditLog(a, { limit: 50 })).nextCursor).toBe(51);

    const { client: b } = fakeClient(full.slice(0, 10));
    expect((await fetchAuditLog(b, { limit: 50 })).nextCursor).toBeNull();
  });
});

describe('describeEntry', () => {
  it('renders a login line', () => {
    expect(describeEntry({ actor_label: 'محمد', entity_type: 'auth', action: 'login' })).toBe(
      'محمد — سجّل الدخول',
    );
  });

  it('names the affected item when the payload carries one', () => {
    const text = describeEntry({
      actor_label: 'مشرف',
      entity_type: 'student',
      action: 'create',
      after: { full_name: 'أحمد' },
    });
    expect(text).toContain('أحمد');
    expect(text).toContain('أنشأ');
  });

  it('falls back to a generic sentence for an unknown pair', () => {
    const text = describeEntry({ actor_label: 'x', entity_type: 'widget', action: 'frobnicate' });
    expect(text).toBe('x frobnicate widget');
    expect(text).not.toContain('undefined');
  });

  it('summarises a bulk create by count', () => {
    expect(
      describeEntry({
        actor_label: 'مشرف',
        entity_type: 'student',
        action: 'create',
        after: { count: 21 },
      }),
    ).toContain('21 عنصراً');
  });
});
