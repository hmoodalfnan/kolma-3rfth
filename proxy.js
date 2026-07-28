import { NextResponse } from 'next/server';
import { buildCsp, securityHeaders } from '@/lib/security/headers';

const SUPABASE_ORIGIN = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');

export default function proxy(request) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, SUPABASE_ORIGIN);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next reads the nonce out of the request's CSP header and stamps it onto the
  // script tags it injects. Without this, `strict-dynamic` blocks every chunk and
  // the page renders skeletons forever.
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const { key, value } of securityHeaders(nonce, SUPABASE_ORIGIN)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    // Static assets are immutable and carry no inline script, so they skip the
    // per-request nonce entirely.
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest).*)',
  ],
};
