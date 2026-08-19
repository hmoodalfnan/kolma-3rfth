import { RequireRole } from '@/components/auth/RequireRole';
import { ToastProvider } from '@/components/ui/Toast';
import { AdminShell } from '@/components/admin/AdminShell';

export default function AdminLayout({ children }) {
  return (
    <RequireRole allow={['super_admin']}>
      <ToastProvider>
        <AdminShell>{children}</AdminShell>
      </ToastProvider>
    </RequireRole>
  );
}
