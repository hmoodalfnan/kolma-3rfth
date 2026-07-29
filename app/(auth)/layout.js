import { ToastProvider } from '@/components/ui/Toast';

export default function AuthLayout({ children }) {
  return (
    <ToastProvider>
      {/* No background pattern: it competed with the sign-in card and made the
          one thing on the page harder to find. */}
      <div className="flex min-h-dvh items-center justify-center px-4 py-10">
        <main className="w-full max-w-md">
          <header className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-brand">المتابع الإيماني</h1>
            <p className="mt-1 text-sm text-muted">متابعة الأعمال الإيمانية والسلوكية</p>
          </header>
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
