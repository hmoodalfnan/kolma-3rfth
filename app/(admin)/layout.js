import { RequireRole } from '@/components/auth/RequireRole';
import { ToastProvider } from '@/components/ui/Toast';
import { ScheduleProvider } from '@/lib/manage/useSchedule';
import { ManageShell } from '@/components/manage/ManageShell';

export default function AdminLayout({ children }) {
  return (
    <RequireRole allow={['super_admin']}>
      <ToastProvider>
        <ScheduleProvider>
          <ManageShell>{children}</ManageShell>
        </ScheduleProvider>
      </ToastProvider>
    </RequireRole>
  );
}
