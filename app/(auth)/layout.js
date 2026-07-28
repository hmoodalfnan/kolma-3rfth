import { ToastProvider } from '@/components/ui/Toast';

export default function AuthLayout({ children }) {
  return (
    <ToastProvider>
      <div className="geo-texture flex min-h-dvh items-center justify-center px-4 py-10">
        <main className="w-full max-w-md">
          <header className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-navy-700">قوافل</h1>
            <p className="mt-1 text-sm text-muted">متابعة الأعمال الإيمانية والسلوكية</p>
          </header>
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
