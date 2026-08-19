'use client';

import { useEffect, useState } from 'react';
import { fetchLeaderboard, fetchUserName } from '@/lib/boards/leaderboard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SkeletonList } from '@/components/ui/Skeleton';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Shared leaderboard. Names are never shown — only emoji + points + rank.
 * When `revealable` (admin), tapping a row asks for confirmation before
 * revealing that user's name.
 */
export function Leaderboard({ revealable = false }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [names, setNames] = useState({}); // user_id -> revealed name
  const [pending, setPending] = useState(null); // user_id awaiting confirm

  useEffect(() => {
    let alive = true;
    fetchLeaderboard()
      .then((data) => alive && setRows(data))
      .catch(() => alive && setError('تعذّر تحميل لوحة الصدارة'));
    return () => {
      alive = false;
    };
  }, []);

  async function confirmReveal() {
    const id = pending;
    setPending(null);
    try {
      const name = await fetchUserName(id);
      setNames((n) => ({ ...n, [id]: name || '—' }));
    } catch {
      setError('تعذّر إظهار الاسم');
    }
  }

  if (error) {
    return <p className="p-4 text-center text-sm text-danger-ink">{error}</p>;
  }
  if (rows === null) {
    return (
      <div className="pt-2">
        <SkeletonList rows={6} />
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="card p-6 text-center text-muted">لا توجد نتائج بعد.</p>;
  }

  return (
    <>
      <ul className="space-y-2">
        {rows.map((row) => {
          const medal = MEDALS[row.rank - 1];
          const revealed = revealable ? names[row.user_id] : undefined;
          const RowTag = revealable ? 'button' : 'div';
          return (
            <li key={`${row.rank}-${row.emoji}-${row.points}`}>
              <RowTag
                {...(revealable
                  ? {
                      type: 'button',
                      onClick: () => !revealed && setPending(row.user_id),
                      'aria-label': `المركز ${row.rank}، إظهار الاسم`,
                    }
                  : {})}
                className={`card flex w-full items-center gap-3 p-3 text-start ${
                  row.rank <= 3 ? 'ring-1 ring-gold-300' : ''
                }`}
              >
                <span className="w-8 shrink-0 text-center text-lg font-extrabold text-brand">
                  {medal || row.rank}
                </span>
                <span className="text-3xl" aria-hidden="true">
                  {row.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  {revealed ? (
                    <span className="block font-semibold text-ink">{revealed}</span>
                  ) : revealable ? (
                    <span className="block text-xs text-muted">اضغط لإظهار الاسم</span>
                  ) : null}
                </span>
                <span className="shrink-0 rounded-full bg-gold-100 px-3 py-1 text-sm font-bold text-gold-700">
                  {row.points} نقطة
                </span>
              </RowTag>
            </li>
          );
        })}
      </ul>

      {revealable && (
        <ConfirmDialog
          open={pending !== null}
          title="إظهار الاسم"
          message="هل أنت متأكد أنك تريد رؤية اسم المستخدم؟"
          confirmLabel="نعم، أظهر الاسم"
          tone="primary"
          onConfirm={confirmReveal}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
