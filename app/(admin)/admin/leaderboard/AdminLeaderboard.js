'use client';

import { Leaderboard } from '@/components/boards/Leaderboard';

export function AdminLeaderboard() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-brand">لوحة الصدارة</h1>
      <p className="text-sm text-muted">
        الترتيب بالرموز والنقاط. اضغط على أي صف لإظهار اسم المستخدم (بعد التأكيد).
      </p>
      <Leaderboard revealable />
    </div>
  );
}
