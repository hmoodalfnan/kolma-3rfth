'use client';

import { useMemo } from 'react';
import { addDays, backfillWindow, todayInRiyadh, weekdayShort } from '@/lib/schedule-time/day';

export function DateStrip({ schedule, selected, onSelect, completionFor }) {
  const days = useMemo(() => {
    const today = todayInRiyadh();
    const last = schedule.end_date && schedule.end_date < today ? schedule.end_date : today;
    const out = [];
    for (let i = 13; i >= 0; i -= 1) {
      const key = addDays(last, -i);
      if (key < schedule.start_date) continue;
      out.push(key);
    }
    return out;
  }, [schedule]);

  const { earliest, latest } = backfillWindow(schedule);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="اليوم السابق"
        onClick={() => onSelect(addDays(selected, -1))}
        className="size-10 shrink-0 rounded-lg border border-line text-navy-700"
      >
        ›
      </button>

      <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1">
        {days.map((key) => {
          const active = key === selected;
          const locked = key < earliest || key > latest;
          const pct = completionFor(key);

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-current={active ? 'date' : undefined}
              className={`flex min-w-14 shrink-0 flex-col items-center gap-0.5 rounded-xl border px-2 py-2 transition ${
                active ? 'border-navy-700 bg-navy-700 text-white' : 'border-line bg-panel'
              } ${locked ? 'opacity-45' : ''}`}
            >
              <span className="text-[10px] font-semibold">{weekdayShort(key)}</span>
              <span className="text-base font-bold tabular-nums">{Number(key.slice(8))}</span>
              <span
                className={`h-1 w-8 rounded-full ${active ? 'bg-white/30' : 'bg-line'}`}
                aria-hidden="true"
              >
                <span
                  className="block h-full rounded-full bg-gold-500"
                  style={{ width: `${pct}%` }}
                />
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="اليوم التالي"
        onClick={() => onSelect(addDays(selected, 1))}
        className="size-10 shrink-0 rounded-lg border border-line text-navy-700"
      >
        ‹
      </button>
    </div>
  );
}
