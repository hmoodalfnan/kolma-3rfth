import { ToastProvider } from '@/components/ui/Toast';
import { BrandLogo } from '@/components/ui/BrandLogo';

export default function AuthLayout({ children }) {
  return (
    <ToastProvider>
      {/* No background pattern: it competed with the sign-in card and made the
          one thing on the page harder to find. */}
      <div className="flex min-h-dvh items-center justify-center px-4 py-10">
        <main className="w-full max-w-md">
          <header className="mb-6 flex flex-col items-center text-center">
            <BrandLogo className="h-24" priority />
            <p className="mt-3 text-sm text-muted">متابعة الأعمال اليومية والمهام</p>
          </header>
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
