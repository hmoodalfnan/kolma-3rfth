import { describe, it, expect } from 'vitest';
import proxy, { config } from '@/proxy';

const call = (url = 'https://tracker.app/login') => proxy(new Request(url));

describe('proxy CSP', () => {
  it('sets a Content-Security-Policy on the response', () => {
    const csp = call().headers.get('content-security-policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  });

  it('forwards the same nonce on the request so Next can stamp its script tags', () => {
    // Regression guard: without the request-side CSP header, Next never learns the
    // nonce, `strict-dynamic` blocks every chunk, and the app renders blank.
    const response = call();
    const forwarded = response.headers.get('x-middleware-override-headers') ?? '';
    expect(forwarded.toLowerCase()).toContain('content-security-policy');
  });

  it('uses a fresh nonce per request', () => {
    const a = call().headers.get('content-security-policy');
    const b = call().headers.get('content-security-policy');
    expect(a).not.toBe(b);
  });

  it('never emits unsafe-inline or unsafe-eval for scripts', () => {
    const scriptSrc = call()
      .headers.get('content-security-policy')
      .split('; ')
      .find((d) => d.startsWith('script-src'));
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });

  it('skips immutable static assets in the matcher', () => {
    // Those responses carry no inline script and must not pay for a per-request nonce.
    const [pattern] = config.matcher;
    const re = new RegExp(pattern.replace(/^\//, '^/'));

    expect(re.test('/_next/static/chunks/main.js')).toBe(false);
    expect(re.test('/sw.js')).toBe(false);
    expect(re.test('/manifest.webmanifest')).toBe(false);
    expect(re.test('/login')).toBe(true);
    expect(re.test('/today')).toBe(true);
  });
});
