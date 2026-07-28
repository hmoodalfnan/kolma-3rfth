import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const signIn = vi.fn();
const from = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ rpc, from, auth: { signInWithPassword: signIn } }),
  createRequestClient: () => ({ rpc, from }),
}));

const { POST } = await import('@/app/api/auth/login/route');

const post = (body, headers = {}) =>
  POST(
    new Request('https://tracker.app/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://tracker.app', ...headers },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  rpc.mockReset();
  signIn.mockReset();
  from.mockReset();
  rpc.mockImplementation((name) => {
    if (name === 'rl_hit') return Promise.resolve({ data: true });
    if (name === 'auth_check_lock') return Promise.resolve({ data: null });
    return Promise.resolve({ data: null, error: null });
  });
});

describe('POST /api/auth/login', () => {
  it('rejects a cross-site request before touching the database', async () => {
    const res = await post(
      { mode: 'staff', username: 'mohammed', password: 'Deeds tracker!2026' },
      { origin: 'https://evil.example' },
    );
    expect(res.status).toBe(403);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('rejects a malformed body with 400 and no sign-in attempt', async () => {
    const res = await post({ mode: 'staff', username: 'x' });
    expect(res.status).toBe(400);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('rejects an unknown mode', async () => {
    expect((await post({ mode: 'root', username: 'aaa', password: 'bbbbbbbb' })).status).toBe(400);
  });

  it('returns 429 when the IP rate limit is exhausted', async () => {
    rpc.mockImplementation((name) =>
      name === 'rl_hit' ? Promise.resolve({ data: false }) : Promise.resolve({ data: null }),
    );
    const res = await post({ mode: 'staff', username: 'mohammed', password: 'Deeds tracker!2026' });
    expect(res.status).toBe(429);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('returns 429 while an identifier is locked out', async () => {
    rpc.mockImplementation((name) => {
      if (name === 'rl_hit') return Promise.resolve({ data: true });
      if (name === 'auth_check_lock') {
        return Promise.resolve({ data: new Date(Date.now() + 600_000).toISOString() });
      }
      return Promise.resolve({ data: null });
    });
    const res = await post({ mode: 'staff', username: 'mohammed', password: 'Deeds tracker!2026' });
    expect(res.status).toBe(429);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('records a failure and returns a generic message on bad credentials', async () => {
    signIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    const res = await post({ mode: 'staff', username: 'mohammed', password: 'WrongPass1' });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('بيانات الدخول غير صحيحة');
    expect(body.error).not.toMatch(/Invalid login/);
    expect(rpc).toHaveBeenCalledWith('auth_record_failure', expect.anything());
  });

  it('returns the same generic message for an unknown username as for a wrong password', async () => {
    signIn.mockResolvedValue({ data: {}, error: { message: 'User not found' } });
    const unknown = await (
      await post({ mode: 'staff', username: 'nobody', password: 'WrongPass1' })
    ).json();

    signIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    const wrong = await (
      await post({ mode: 'staff', username: 'mohammed', password: 'WrongPass1' })
    ).json();

    expect(unknown.error).toBe(wrong.error);
  });

  it('signs a manager in, clears the lockout, and reports their role', async () => {
    signIn.mockResolvedValue({
      data: { session: { access_token: 'tok', refresh_token: 'ref' }, user: { id: 'u1' } },
      error: null,
    });
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { id: 'u1', role: 'manager', display_name: 'مشرف', is_active: true },
            }),
        }),
      }),
    });

    const res = await post({ mode: 'staff', username: 'mohammed', password: 'Deeds tracker!2026' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.role).toBe('manager');
    expect(body.session.access_token).toBe('tok');
    expect(body.redirect).toBe('/schedules');
    expect(rpc).toHaveBeenCalledWith('auth_reset_failures', expect.anything());
    expect(rpc).toHaveBeenCalledWith('write_audit', expect.objectContaining({ p_action: 'login' }));
  });

  it('refuses a deactivated staff account even with the right password', async () => {
    signIn.mockResolvedValue({
      data: { session: { access_token: 'tok' }, user: { id: 'u1' } },
      error: null,
    });
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { id: 'u1', role: 'manager', is_active: false } }),
        }),
      }),
    });
    expect(
      (await post({ mode: 'staff', username: 'mohammed', password: 'Deeds tracker!2026' })).status,
    ).toBe(403);
  });

  it('rejects a student whose id is not in the schedule named by the slug', async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
    });
    const res = await post({
      mode: 'student',
      studentId: '8f1c2a3b-4d5e-6f70-8192-a3b4c5d6e7f8',
      pin: '482913',
      slug: 'abcdefghij',
    });
    expect(res.status).toBe(401);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('flags a student who must still change their PIN', async () => {
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  id: 's1',
                  schedule_id: 'sch1',
                  full_name: 'طالب',
                  must_change_password: true,
                  is_active: true,
                },
              }),
          }),
        }),
      }),
    });
    signIn.mockResolvedValue({
      data: { session: { access_token: 'tok' }, user: { id: 'au1' } },
      error: null,
    });

    const body = await (
      await post({
        mode: 'student',
        studentId: '8f1c2a3b-4d5e-6f70-8192-a3b4c5d6e7f8',
        pin: '482913',
        slug: 'abcdefghij',
      })
    ).json();

    expect(body.role).toBe('student');
    expect(body.mustChangePassword).toBe(true);
    expect(body.redirect).toBe('/change-password');
  });

  it('never leaks the submitted password into the audit payload', async () => {
    signIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    await post({ mode: 'staff', username: 'mohammed', password: 'Deeds tracker!2026' });
    const auditCalls = rpc.mock.calls.filter(([name]) => name === 'write_audit');
    expect(JSON.stringify(auditCalls)).not.toMatch(/Deeds tracker!2026/);
  });
});
