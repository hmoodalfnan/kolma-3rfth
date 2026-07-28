import { describe, it, expect } from 'vitest';
import { buildCsp, securityHeaders } from '@/lib/security/headers';

describe('buildCsp', () => {
  it('locks down defaults and allows only the Supabase origin', () => {
    const csp = buildCsp('abc123', 'https://xyz.supabase.co');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'nonce-abc123'");
    expect(csp).toContain("connect-src 'self' https://xyz.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it('never permits inline or eval script', () => {
    const scriptSrc = buildCsp('abc123', 'https://xyz.supabase.co')
      .split('; ')
      .find((d) => d.startsWith('script-src'));
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });
});

describe('securityHeaders', () => {
  it('emits the full hardening set', () => {
    const keys = securityHeaders('abc123', 'https://xyz.supabase.co').map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'Content-Security-Policy',
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy',
        'Permissions-Policy',
      ]),
    );
  });

  it('denies framing and sniffing', () => {
    const map = Object.fromEntries(
      securityHeaders('n', 'https://x.supabase.co').map((h) => [h.key, h.value]),
    );
    expect(map['X-Frame-Options']).toBe('DENY');
    expect(map['X-Content-Type-Options']).toBe('nosniff');
    expect(map['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });
});
