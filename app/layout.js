import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import { RegisterSW } from '@/components/pwa/RegisterSW';
import { ThemeBoot } from '@/components/ui/ThemeBoot';
import './globals.css';

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

export const metadata = {
  title: 'كلّما عرفته',
  description: 'متابعة الأعمال اليومية والمهام',
  manifest: '/manifest.webmanifest',
  applicationName: 'كلّما عرفته',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    // iOS ignores the web manifest entirely and reads this instead.
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    title: 'كلّما عرفته',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
};

// A per-request CSP nonce cannot be baked into a statically prerendered page, and
// without the nonce `strict-dynamic` blocks every script. Every route here is an
// auth-gated client component that fetches its own data, so there was nothing worth
// static-generating: only the HTML shell becomes dynamic.
export const dynamic = 'force-dynamic';

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1b4332' },
    { media: '(prefers-color-scheme: dark)', color: '#0c1610' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" className={arabic.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-surface text-ink antialiased">
        <ThemeBoot />
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
