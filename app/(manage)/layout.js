import { RequireRole } from '@/components/auth/RequireRole';
import { ToastProvider } from '@/components/ui/Toast';
import { ScheduleProvider } from '@/lib/manage/useSchedule';
import { ManageShell } from '@/components/manage/ManageShell';

export default function ManageLayout({ children }) {
  return (
    <RequireRole allow={['manager', 'super_admin']}>
      <ToastProvider>
        <ScheduleProvider>
          <ManageShell>{children}</ManageShell>
        </ScheduleProvider>
      </ToastProvider>
    </RequireRole>
  );
}
