'use client';

import { Leaderboard } from '@/components/boards/Leaderboard';
import { useStudentContext } from '@/lib/student/useStudentContext';

export function StudentBoard() {
  const ctx = useStudentContext();
  const showStreak = ctx.schedule?.show_streak !== false;

  return (
    <div className="space-y-4 pt-2">
      <header className="card p-4 text-center">
        <h1 className="text-lg font-bold text-brand">لوحة الصدارة</h1>
      </header>
      <Leaderboard showStreak={showStreak} />
    </div>
  );
}
