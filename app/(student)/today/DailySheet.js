'use client';

import { useToday } from '@/lib/tasks/useToday';
import { earnedToday, earnedAssignments } from '@/lib/tasks/queries';
import { SkeletonList } from '@/components/ui/Skeleton';

const KIND = {
  read: { label: 'قراءة', icon: '📖' },
  listen: { label: 'استماع', icon: '🎧' },
};

function PointsChip({ points }) {
  return (
    <span className="shrink-0 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-bold text-gold-700">
      {points} نقطة
    </span>
  );
}

function CheckCircle({ done }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition ${
        done ? 'border-accent bg-accent text-accent-ink' : 'border-line text-transparent'
      }`}
    >
      ✓
    </span>
  );
}

export function DailySheet() {
  const {
    status,
    ctxStatus,
    dailyTasks,
    assignments,
    doneTasks,
    doneAssignments,
    error,
    toggleTask,
    toggleAssignment,
  } = useToday();

  if (ctxStatus === 'unauthenticated') {
    return <p className="p-4 text-center text-muted">يرجى تسجيل الدخول.</p>;
  }

  if (status === 'loading') {
    return (
      <div className="space-y-4 pt-2">
        <SkeletonList rows={5} />
      </div>
    );
  }

  const earned = earnedToday(dailyTasks, doneTasks) + earnedAssignments(assignments, doneAssignments);

  return (
    <div className="space-y-6 pt-2">
      <header className="card flex items-center justify-between p-4">
        <div>
          <h1 className="text-lg font-bold text-brand">مهام اليوم</h1>
          <p className="text-xs text-muted">أكمل مهامك واكسب النقاط</p>
        </div>
        <div className="text-center">
          <div className="text-2xl font-extrabold text-gold-500">{earned}</div>
          <div className="text-[10px] font-semibold text-muted">نقاط اليوم</div>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft p-2 text-center text-sm text-danger-ink">
          {error}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-bold text-muted">المهام اليومية</h2>
        {dailyTasks.length === 0 ? (
          <p className="card p-4 text-center text-sm text-muted">لا توجد مهام يومية بعد.</p>
        ) : (
          <ul className="space-y-2">
            {dailyTasks.map((task) => {
              const done = doneTasks.has(task.id);
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => toggleTask(task.id)}
                    aria-pressed={done}
                    className={`card flex w-full items-center gap-3 p-3 text-start transition ${
                      done ? 'bg-accent-soft' : ''
                    }`}
                  >
                    <CheckCircle done={done} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{task.title}</span>
                      {task.description && (
                        <span className="block text-xs text-muted">{task.description}</span>
                      )}
                    </span>
                    <PointsChip points={task.points} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-bold text-muted">مهام مستمرة</h2>
        {assignments.length === 0 ? (
          <p className="card p-4 text-center text-sm text-muted">لا توجد مهام مستمرة حالياً.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => {
              const done = doneAssignments.has(a.id);
              const kind = KIND[a.kind] || KIND.read;
              return (
                <li key={a.id} className={`card space-y-2 p-4 ${done ? 'opacity-70' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-chip px-2 py-0.5 text-xs font-semibold text-chip-ink">
                      <span aria-hidden="true">{kind.icon}</span> {kind.label}
                    </span>
                    <h3 className="min-w-0 flex-1 font-bold text-ink">{a.title}</h3>
                    <PointsChip points={a.points} />
                  </div>
                  {a.body_text && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                      {a.body_text}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleAssignment(a.id)}
                    aria-pressed={done}
                    className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl font-semibold transition ${
                      done
                        ? 'bg-ok text-ok-ink'
                        : 'bg-accent text-accent-ink hover:opacity-90'
                    }`}
                  >
                    <CheckCircle done={done} />
                    {done ? 'تم الإنجاز' : 'وضع علامة تم'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
