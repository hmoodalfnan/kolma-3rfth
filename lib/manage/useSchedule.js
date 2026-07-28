'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { listSchedules } from './api';

const KEY = 'qawafel.schedule';
const ScheduleContext = createContext(null);

export function ScheduleProvider({ children }) {
  const [schedules, setSchedules] = useState(null);
  const [currentId, setCurrentId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await listSchedules();
      setSchedules(rows);

      const stored = window.localStorage.getItem(KEY);
      const valid = rows.find((s) => s.id === stored) ?? rows[0];
      setCurrentId(valid?.id ?? null);
    } catch (err) {
      setError(err.message);
      setSchedules([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const select = useCallback((id) => {
    window.localStorage.setItem(KEY, id);
    setCurrentId(id);
  }, []);

  const value = useMemo(
    () => ({
      schedules,
      current: schedules?.find((s) => s.id === currentId) ?? null,
      currentId,
      select,
      reload: load,
      setSchedules,
      error,
    }),
    [schedules, currentId, select, load, error],
  );

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule() {
  const ctx = useContext(ScheduleContext);
  if (!ctx) throw new Error('useSchedule must be used inside ScheduleProvider');
  return ctx;
}
