import { RequireRole } from '@/components/auth/RequireRole';
import { ToastProvider } from '@/components/ui/Toast';
import { OfflineBanner } from '@/components/offline/OfflineBanner';
import { StudentNav } from '@/components/student/StudentNav';

export default function StudentLayout({ children }) {
  return (
    <RequireRole allow={['student', 'super_admin']}>
      <ToastProvider>
        <OfflineBanner />
        <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4">{children}</div>
        <StudentNav />
      </ToastProvider>
    </RequireRole>
  );
}
