import { it, expect } from 'vitest';
import { dbTest, serviceClient, anonClient, uniq } from './client';

dbTest('rate limiting and lockout', () => {
  const db = serviceClient();

  it('allows up to the limit then refuses within the window', async () => {
    const key = uniq('rl');
    for (let i = 0; i < 3; i += 1) {
      const { data } = await db.rpc('rl_hit', { p_key: key, p_limit: 3, p_window_seconds: 60 });
      expect(data).toBe(true);
    }
    const { data } = await db.rpc('rl_hit', { p_key: key, p_limit: 3, p_window_seconds: 60 });
    expect(data).toBe(false);
  });

  it('keeps separate counters per key', async () => {
    const a = uniq('rl');
    const b = uniq('rl');
    await db.rpc('rl_hit', { p_key: a, p_limit: 1, p_window_seconds: 60 });
    const { data } = await db.rpc('rl_hit', { p_key: b, p_limit: 1, p_window_seconds: 60 });
    expect(data).toBe(true);
  });

  it('locks an identifier after five failures', async () => {
    const id = uniq('user');
    for (let i = 0; i < 4; i += 1) {
      const { data } = await db.rpc('auth_record_failure', { p_identifier: id });
      expect(data).toBeNull();
    }
    const { data: lockedUntil } = await db.rpc('auth_record_failure', { p_identifier: id });
    expect(lockedUntil).not.toBeNull();

    const { data: check } = await db.rpc('auth_check_lock', { p_identifier: id });
    expect(new Date(check).getTime()).toBeGreaterThan(Date.now());
  });

  it('clears the counter on a successful login', async () => {
    const id = uniq('user');
    await db.rpc('auth_record_failure', { p_identifier: id });
    await db.rpc('auth_reset_failures', { p_identifier: id });
    const { data } = await db.rpc('auth_check_lock', { p_identifier: id });
    expect(data).toBeNull();
  });
});

dbTest('audit log', () => {
  const db = serviceClient();

  it('records an entry with actor, action, and before/after payloads', async () => {
    const { error } = await db.from('audit_log').insert({
      actor_role: 'manager',
      entity_type: 'question',
      entity_id: null,
      action: 'update',
      before: { points: 5 },
      after: { points: 7 },
      ip: '203.0.113.7',
      user_agent: 'vitest',
    });
    expect(error).toBeNull();
  });

  it('refuses updates and deletes even to the service role', async () => {
    const inserted = await db
      .from('audit_log')
      .insert({ actor_role: 'super_admin', entity_type: 'schedule', action: 'create' })
      .select()
      .single();

    const upd = await db.from('audit_log').update({ action: 'tampered' }).eq('id', inserted.data.id);
    expect(upd.error).not.toBeNull();

    const del = await db.from('audit_log').delete().eq('id', inserted.data.id);
    expect(del.error).not.toBeNull();
  });

  it('hides the log from an unauthenticated client', async () => {
    const { data } = await anonClient().from('audit_log').select('*').limit(1);
    expect(data ?? []).toEqual([]);
  });
});
