const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

function validIp(value) {
  const ip = String(value ?? '').trim();
  if (!ip) return '';
  if (IPV4.test(ip) && ip.split('.').every((o) => Number(o) <= 255)) return ip;
  if (ip.includes(':') && IPV6.test(ip)) return ip;
  return '';
}

export function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = validIp(forwarded.split(',')[0]);
    if (first) return first;
  }
  return validIp(request.headers.get('x-real-ip'));
}

export function userAgent(request) {
  return (request.headers.get('user-agent') || '').slice(0, 400);
}

export function sameOrigin(request) {
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';

  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
