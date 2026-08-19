'use client';

import { useEffect, useState } from 'react';
import { Leaderboard } from '@/components/boards/Leaderboard';
import { getProgram } from '@/lib/admin/program';

export function AdminLeaderboard() {
  const [showStreak, setShowStreak] = useState(true);

  useEffect(() => {
    getProgram()
      .then((p) => setShowStreak(p?.show_streak !== false))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-brand">لوحة الصدارة</h1>
      <p className="text-sm text-muted">
        الترتيب بالرموز والنقاط. اضغط على أي صف لإظهار اسم المستخدم (بعد التأكيد).
      </p>
      <Leaderboard revealable showStreak={showStreak} />
    </div>
  );
}
