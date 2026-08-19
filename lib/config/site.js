// The canonical, public origin of the app. Auth confirmation emails must point
// here — never at localhost or a preview URL — so a link opened on any device
// lands on the real site. Set NEXT_PUBLIC_SITE_URL in the environment; the
// production domain is the fallback so a missing var can never send users to
// localhost.
const PRODUCTION_URL = 'https://kolma-3rfth.vercel.app';

export function siteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  return (fromEnv || PRODUCTION_URL).replace(/\/+$/, '');
}
