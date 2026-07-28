/**
 * Decide how the service worker should handle a request.
 * Caching an auth response or Supabase data would be a security bug, so those
 * are network-only without exception.
 */
export function chooseStrategy(request) {
  if (request.method !== 'GET') return 'network-only';

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return 'network-only';
  }

  if (url.pathname.startsWith('/api/')) return 'network-only';
  if (url.hostname.endsWith('.supabase.co')) return 'network-only';
  if (url.pathname.startsWith('/_next/static/')) return 'cache-first';
  if (url.pathname.startsWith('/_next/image')) return 'cache-first';

  const accept = request.headers.get('accept') || '';
  if (request.mode === 'navigate' || accept.includes('text/html')) {
    return 'stale-while-revalidate';
  }

  if (/\.(css|js|woff2?|png|svg|jpg|webp|ico)$/.test(url.pathname)) return 'cache-first';

  return 'network-only';
}
