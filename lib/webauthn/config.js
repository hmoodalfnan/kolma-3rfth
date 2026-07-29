/**
 * Relying-party identity for WebAuthn.
 *
 * The RP ID is security-critical: it scopes a credential to a domain. It must
 * never be derived from the request's Host header, which an attacker controls —
 * it comes from configuration only.
 */

function stripPort(host) {
  return String(host).split(':')[0];
}

export function rpConfig() {
  const explicit = process.env.WEBAUTHN_RP_ID;
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const vercelAny = process.env.VERCEL_URL;

  if (explicit) {
    return {
      rpID: stripPort(explicit),
      rpName: 'المتابع الإيماني',
      origins: [`https://${stripPort(explicit)}`],
    };
  }

  const host = vercelProd || vercelAny;
  if (host) {
    return {
      rpID: stripPort(host),
      rpName: 'المتابع الإيماني',
      // Preview deployments get their own hostname; include both so a passkey
      // registered on the production domain still verifies there.
      origins: [...new Set([`https://${stripPort(vercelProd || host)}`, `https://${stripPort(host)}`])],
    };
  }

  return {
    rpID: 'localhost',
    rpName: 'المتابع الإيماني',
    origins: ['http://localhost:3000', 'http://localhost:3111', 'http://localhost:3112'],
  };
}

export const isWebAuthnConfigured = () =>
  Boolean(process.env.WEBAUTHN_RP_ID || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL);
