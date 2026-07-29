import { AuditView } from '@/components/audit/AuditView';

export const metadata = { title: 'سجل النظام — المتابع الإيماني' };

export default function GlobalLogPage() {
  return <AuditView scheduleId={null} title="سجل النظام الكامل" showScheduleColumn />;
}
