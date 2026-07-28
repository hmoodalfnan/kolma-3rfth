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
  title: 'قوافل — متابعة الأعمال',
  description: 'متابعة الأعمال الإيمانية والسلوكية',
  manifest: '/manifest.webmanifest',
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2A3563' },
    { media: '(prefers-color-scheme: dark)', color: '#141A33' },
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
