import Link from 'next/link';
import { BrandLogo } from '@/components/ui/BrandLogo';

export const metadata = { title: 'الصفحة غير موجودة — كلّما عرفته' };

// Rendered by Next.js for any unmatched route (and any notFound() call). Kept as
// a plain server component so a broken link always resolves to something on-brand
// instead of a bare framework error page.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <BrandLogo className="h-10" />

      <p className="text-6xl font-extrabold text-brand" aria-hidden="true">
        ٤٠٤
      </p>

      <div className="space-y-2">
        <h1 className="text-xl font-bold text-ink">الصفحة غير موجودة</h1>
        <p className="text-sm text-muted">
          الرابط الذي فتحته غير صحيح أو أن الصفحة لم تعد متاحة.
        </p>
      </div>

      <Link
        href="/today"
        prefetch
        className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition hover:opacity-90"
      >
        العودة إلى الرئيسية
      </Link>
    </main>
  );
}
