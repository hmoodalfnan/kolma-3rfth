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

// Route reads db.from('app_users')...maybeSingle(), then db.from('students')...maybeSingle().
// This wires each table to a preset row.
function wireTables({ admin = null, profile = null } = {}) {
  from.mockImplementation((table) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({ data: table === 'app_users' ? admin : profile }),
      }),
    }),
  }));
}

const creds = { email: 'user@example.com', password: 'Secret123' };

beforeEach(() => {
  rpc.mockReset();
  signIn.mockReset();
  from.mockReset();
  rpc.mockImplementation((name) => {
    if (name === 'rl_hit') return Promise.resolve({ data: true });
    if (name === 'auth_check_lock') return Promise.resolve({ data: null });
    return Promise.resolve({ data: null, error: null });
  });
  wireTables();
});

describe('POST /api/auth/login', () => {
  it('rejects a cross-site request before touching the database', async () => {
    const res = await post(creds, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('rejects a malformed body with 400 and no sign-in attempt', async () => {
    const res = await post({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('returns 429 when the IP rate limit is exhausted', async () => {
    rpc.mockImplementation((name) =>
      name === 'rl_hit' ? Promise.resolve({ data: false }) : Promise.resolve({ data: null }),
    );
    const res = await post(creds);
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
    const res = await post(creds);
    expect(res.status).toBe(429);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('records a failure and returns a generic message on bad credentials', async () => {
    signIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    const res = await post(creds);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('بيانات الدخول غير صحيحة');
    expect(body.error).not.toMatch(/Invalid login/);
    expect(rpc).toHaveBeenCalledWith('auth_record_failure', expect.anything());
  });

  it('surfaces an unconfirmed email so the UI can offer a resend', async () => {
    signIn.mockResolvedValue({ data: {}, error: { code: 'email_not_confirmed', message: 'Email not confirmed' } });
    const res = await post(creds);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.needsConfirmation).toBe(true);
    expect(body.email).toBe('user@example.com');
  });

  it('signs an admin in, clears the lockout, and reports their role', async () => {
    signIn.mockResolvedValue({
      data: { session: { access_token: 'tok', refresh_token: 'ref' }, user: { id: 'u1' } },
      error: null,
    });
    wireTables({ admin: { id: 'u1', role: 'super_admin', display_name: 'المشرف', is_active: true } });

    const res = await post(creds);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.role).toBe('super_admin');
    expect(body.session.access_token).toBe('tok');
    expect(body.redirect).toBe('/admin/global-board');
    expect(rpc).toHaveBeenCalledWith('auth_reset_failures', expect.anything());
    expect(rpc).toHaveBeenCalledWith('write_audit', expect.objectContaining({ p_action: 'login' }));
  });

  it('refuses a deactivated admin account even with the right password', async () => {
    signIn.mockResolvedValue({
      data: { session: { access_token: 'tok' }, user: { id: 'u1' } },
      error: null,
    });
    wireTables({ admin: { id: 'u1', role: 'super_admin', is_active: false } });
    expect((await post(creds)).status).toBe(403);
  });

  it('signs a normal user in and routes them to today', async () => {
    signIn.mockResolvedValue({
      data: { session: { access_token: 'tok', refresh_token: 'ref' }, user: { id: 'au1' } },
      error: null,
    });
    wireTables({ admin: null, profile: { id: 's1', full_name: 'مستخدم', is_active: true } });

    const res = await post(creds);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.role).toBe('student');
    expect(body.redirect).toBe('/today');
    expect(body.studentId).toBe('s1');
  });

  it('rejects a confirmed login with no profile row', async () => {
    signIn.mockResolvedValue({
      data: { session: { access_token: 'tok' }, user: { id: 'au1' } },
      error: null,
    });
    wireTables({ admin: null, profile: null });
    expect((await post(creds)).status).toBe(401);
  });

  it('never leaks the submitted password into the audit payload', async () => {
    signIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    await post({ email: 'user@example.com', password: 'HushHush9' });
    const auditCalls = rpc.mock.calls.filter(([name]) => name === 'write_audit');
    expect(JSON.stringify(auditCalls)).not.toMatch(/HushHush9/);
  });
});
