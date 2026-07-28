import { describe, it, expect } from 'vitest';
import { clientIp, sameOrigin, bearerToken } from '@/lib/http/request-context';

const req = (headers, url = 'https://qawafel.app/api/x') =>
  new Request(url, { method: 'POST', headers });

describe('clientIp', () => {
  it('takes the first hop of x-forwarded-for', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' }))).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip and then to empty', () => {
    expect(clientIp(req({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(clientIp(req({}))).toBe('');
  });

  it('rejects a malformed forwarded value rather than trusting it', () => {
    expect(clientIp(req({ 'x-forwarded-for': 'not-an-ip' }))).toBe('');
  });
});

describe('sameOrigin', () => {
  it('accepts a same-origin request', () => {
    expect(sameOrigin(req({ origin: 'https://qawafel.app' }))).toBe(true);
  });

  it('accepts sec-fetch-site same-origin without an Origin header', () => {
    expect(sameOrigin(req({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
  });

  it('rejects a cross-site request', () => {
    expect(sameOrigin(req({ origin: 'https://evil.example' }))).toBe(false);
    expect(sameOrigin(req({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
  });

  it('rejects a request with neither header', () => {
    expect(sameOrigin(req({}))).toBe(false);
  });
});

describe('bearerToken', () => {
  it('extracts the token and ignores a malformed header', () => {
    expect(bearerToken(req({ authorization: 'Bearer abc.def.ghi' }))).toBe('abc.def.ghi');
    expect(bearerToken(req({ authorization: 'Basic abc' }))).toBe(null);
    expect(bearerToken(req({}))).toBe(null);
  });
});
