import { RequireRole } from '@/components/auth/RequireRole';
import { ToastProvider } from '@/components/ui/Toast';
import { OfflineBanner } from '@/components/offline/OfflineBanner';
import { StudentNav } from '@/components/student/StudentNav';
import { StudentTopBar } from '@/components/student/StudentTopBar';
import { OnboardingBanner } from '@/components/student/OnboardingBanner';

export default function StudentLayout({ children }) {
  return (
    <RequireRole allow={['student', 'super_admin']}>
      <ToastProvider>
        <OfflineBanner />
        <StudentTopBar />
        <OnboardingBanner />
        <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-2">{children}</div>
        <StudentNav />
      </ToastProvider>
    </RequireRole>
  );
}
