import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
const getUser = vi.fn();
const admin = { getUserById: vi.fn(), generateLink: vi.fn() };
const verifyOtp = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ rpc, from, auth: { admin, verifyOtp } }),
  createRequestClient: () => ({ rpc, from, auth: { getUser } }),
}));

const verifyAuthenticationResponse = vi.fn();
const verifyRegistrationResponse = vi.fn();

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(async () => ({ challenge: 'reg-challenge' })),
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: 'auth-challenge' })),
  verifyRegistrationResponse: (...a) => verifyRegistrationResponse(...a),
  verifyAuthenticationResponse: (...a) => verifyAuthenticationResponse(...a),
}));

const { POST: loginPOST } = await import('@/app/api/auth/webauthn/login/route');
const { POST: registerPOST } = await import('@/app/api/auth/webauthn/register/route');

const req = (body, headers = {}) =>
  new Request('https://tracker.app/api/auth/webauthn/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://tracker.app', ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockImplementation((name) => {
    if (name === 'rl_hit') return Promise.resolve({ data: true });
    if (name === 'webauthn_take_challenge') return Promise.resolve({ data: 'auth-challenge' });
    return Promise.resolve({ data: null, error: null });
  });
});

describe('POST /api/auth/webauthn/login', () => {
  it('rejects a cross-site request', async () => {
    const res = await loginPOST(req({ action: 'options' }, { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
  });

  it('rejects a malformed body', async () => {
    expect((await loginPOST(req({ action: 'nope' }))).status).toBe(400);
  });

  it('throttles by IP', async () => {
    rpc.mockImplementation((n) =>
      Promise.resolve({ data: n === 'rl_hit' ? false : null }),
    );
    expect((await loginPOST(req({ action: 'options' }))).status).toBe(429);
  });

  it('issues options without revealing whether any account exists', async () => {
    from.mockReturnValue({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'c1' } }) }) }),
    });
    const body = await (await loginPOST(req({ action: 'options' }))).json();

    expect(body.options.challenge).toBe('auth-challenge');
    expect(JSON.stringify(body)).not.toMatch(/username|email|user_id/i);
  });

  it('refuses an expired or reused challenge', async () => {
    rpc.mockImplementation((n) =>
      Promise.resolve({ data: n === 'rl_hit' ? true : null }),
    );
    const res = await loginPOST(
      req({ action: 'verify', challengeId: crypto.randomUUID(), credential: { id: 'abc' } }),
    );
    expect(res.status).toBe(400);
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it('refuses an unknown credential', async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    });
    const res = await loginPOST(
      req({ action: 'verify', challengeId: crypto.randomUUID(), credential: { id: 'ghost' } }),
    );
    expect(res.status).toBe(401);
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it('requires user verification, so presence alone cannot sign in', async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
        data: { id: 'k1', user_id: 'u1', credential_id: 'abc', public_key: 'AAAA', counter: 5 },
      }) }) }),
    });
    verifyAuthenticationResponse.mockResolvedValue({ verified: false });

    const res = await loginPOST(
      req({ action: 'verify', challengeId: crypto.randomUUID(), credential: { id: 'abc' } }),
    );
    expect(res.status).toBe(401);
    expect(verifyAuthenticationResponse.mock.calls[0][0].requireUserVerification).toBe(true);
  });

  it('rejects a counter that fails to advance, the signature of a cloned key', async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
        data: { id: 'k1', user_id: 'u1', credential_id: 'abc', public_key: 'AAAA', counter: 10 },
      }) }) }),
    });
    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 9 },
    });

    const res = await loginPOST(
      req({ action: 'verify', challengeId: crypto.randomUUID(), credential: { id: 'abc' } }),
    );
    expect(res.status).toBe(401);
    expect(admin.generateLink).not.toHaveBeenCalled();
  });

  it('refuses a deactivated staff account even with a valid assertion', async () => {
    from.mockImplementation((table) => {
      if (table === 'webauthn_credentials') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
          data: { id: 'k1', user_id: 'u1', credential_id: 'abc', public_key: 'AAAA', counter: 1 },
        }) }) }) };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
        data: { id: 'u1', username: 'm', role: 'manager', is_active: false },
      }) }) }) };
    });
    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 2 },
    });

    expect(
      (await loginPOST(
        req({ action: 'verify', challengeId: crypto.randomUUID(), credential: { id: 'abc' } }),
      )).status,
    ).toBe(403);
  });

  it('returns a session and never leaks the magiclink token on success', async () => {
    from.mockImplementation((table) => {
      if (table === 'webauthn_credentials') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
            data: { id: 'k1', user_id: 'u1', credential_id: 'abc', public_key: 'AAAA', counter: 1 },
          }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
        data: { id: 'u1', username: 'm', display_name: 'مشرف', role: 'manager', is_active: true },
      }) }) }) };
    });
    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 2 },
    });
    admin.getUserById.mockResolvedValue({ data: { user: { email: 'm@tracker.internal' } } });
    admin.generateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'SECRET_TOKEN' } },
      error: null,
    });
    verifyOtp.mockResolvedValue({
      data: { session: { access_token: 'tok', refresh_token: 'ref' } },
      error: null,
    });

    const res = await loginPOST(
      req({ action: 'verify', challengeId: crypto.randomUUID(), credential: { id: 'abc' } }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.session.access_token).toBe('tok');
    expect(body.role).toBe('manager');
    expect(JSON.stringify(body)).not.toContain('SECRET_TOKEN');
    expect(rpc).toHaveBeenCalledWith('write_audit', expect.objectContaining({
      p_action: 'login_passkey',
    }));
  });
});

describe('POST /api/auth/webauthn/register', () => {
  const regReq = (body, headers = {}) =>
    new Request('https://tracker.app/api/auth/webauthn/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://tracker.app',
        authorization: 'Bearer tok',
        ...headers,
      },
      body: JSON.stringify(body),
    });

  it('rejects an unauthenticated caller', async () => {
    const res = await registerPOST(
      new Request('https://tracker.app/api/auth/webauthn/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://tracker.app' },
        body: JSON.stringify({ action: 'options' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('refuses a student, who has no app_users row', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'stu1' } }, error: null });
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    });

    const res = await registerPOST(regReq({ action: 'options' }));
    expect(res.status).toBe(403);
  });

  it('demands user verification when enrolling', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    from.mockImplementation((table) => {
      if (table === 'app_users') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
          data: { id: 'u1', username: 'm', display_name: 'مشرف', role: 'manager', is_active: true },
        }) }) }) };
      }
      return {
        select: () => ({ eq: () => Promise.resolve({ data: [] }) }),
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'c1' } }) }) }),
      };
    });

    const { generateRegistrationOptions } = await import('@simplewebauthn/server');
    await registerPOST(regReq({ action: 'options' }));

    expect(generateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticatorSelection: expect.objectContaining({ userVerification: 'required' }),
      }),
    );
  });
});
