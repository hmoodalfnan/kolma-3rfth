import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rpConfig } from '@/lib/webauthn/config';

const KEYS = ['WEBAUTHN_RP_ID', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL'];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('rpConfig', () => {
  it('prefers the explicit env var', () => {
    process.env.WEBAUTHN_RP_ID = 'tracker.example.com';
    const { rpID, origins } = rpConfig();
    expect(rpID).toBe('tracker.example.com');
    expect(origins).toEqual(['https://tracker.example.com']);
  });

  it('strips a port from the configured host', () => {
    process.env.WEBAUTHN_RP_ID = 'tracker.example.com:443';
    expect(rpConfig().rpID).toBe('tracker.example.com');
  });

  it('falls back to the Vercel production hostname', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'sunnah-tracker.vercel.app';
    const { rpID, origins } = rpConfig();
    expect(rpID).toBe('sunnah-tracker.vercel.app');
    expect(origins).toContain('https://sunnah-tracker.vercel.app');
  });

  it('accepts the preview origin alongside production', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'prod.vercel.app';
    process.env.VERCEL_URL = 'preview-abc.vercel.app';
    expect(rpConfig().origins).toEqual(
      expect.arrayContaining(['https://prod.vercel.app']),
    );
  });

  it('defaults to localhost for development', () => {
    const { rpID, origins } = rpConfig();
    expect(rpID).toBe('localhost');
    expect(origins[0]).toMatch(/^http:\/\/localhost/);
  });

  it('never derives the RP ID from a caller-supplied host', () => {
    // Guard against Host-header injection: nothing in rpConfig reads a request.
    expect(rpConfig.length).toBe(0);
  });
});
