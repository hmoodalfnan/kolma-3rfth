'use client';

import { AuditView } from '@/components/audit/AuditView';
import { EmptyState } from '@/components/manage/Panel';
import { useSchedule } from '@/lib/manage/useSchedule';

export function ScheduleLog() {
  const { current } = useSchedule();
  if (!current) return <EmptyState>اختر رحلة أولاً.</EmptyState>;

  return <AuditView scheduleId={current.id} title={`سجل العمليات — ${current.name}`} />;
}
