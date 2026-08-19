'use client';

import { Leaderboard } from '@/components/boards/Leaderboard';

export function StudentBoard() {
  return (
    <div className="space-y-4 pt-2">
      <header className="card p-4 text-center">
        <h1 className="text-lg font-bold text-brand">لوحة الصدارة</h1>
        <p className="text-xs text-muted">التميّز بالرموز — تنافسوا واكسبوا النقاط</p>
      </header>
      <Leaderboard />
    </div>
  );
}
