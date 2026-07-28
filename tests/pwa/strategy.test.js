import { describe, it, expect } from 'vitest';
import { chooseStrategy } from '@/lib/pwa/strategy';

describe('chooseStrategy', () => {
  it('never caches API calls', () => {
    expect(chooseStrategy(new Request('https://tracker.app/api/auth/login'))).toBe('network-only');
    expect(chooseStrategy(new Request('https://tracker.app/api/join/abcdefghij'))).toBe(
      'network-only',
    );
  });

  it('never caches Supabase traffic', () => {
    expect(chooseStrategy(new Request('https://xyz.supabase.co/rest/v1/answers'))).toBe(
      'network-only',
    );
  });

  it('caches immutable build assets first', () => {
    expect(chooseStrategy(new Request('https://tracker.app/_next/static/chunks/main.js'))).toBe(
      'cache-first',
    );
  });

  it('revalidates navigations in the background', () => {
    const req = new Request('https://tracker.app/today', { headers: { accept: 'text/html' } });
    expect(chooseStrategy(req)).toBe('stale-while-revalidate');
  });

  it('leaves non-GET requests uncached', () => {
    expect(chooseStrategy(new Request('https://tracker.app/today', { method: 'POST' }))).toBe(
      'network-only',
    );
  });

  it('caches fonts and images', () => {
    expect(chooseStrategy(new Request('https://tracker.app/fonts/a.woff2'))).toBe('cache-first');
    expect(chooseStrategy(new Request('https://tracker.app/icon.png'))).toBe('cache-first');
  });
});
