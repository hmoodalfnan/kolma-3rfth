import { AuditView } from '@/components/audit/AuditView';

export const metadata = { title: 'سجل النظام — قوافل' };

export default function GlobalLogPage() {
  return <AuditView scheduleId={null} title="سجل النظام الكامل" showScheduleColumn />;
}
