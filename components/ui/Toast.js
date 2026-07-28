'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext({ push: () => {} });

const TONES = {
  info: 'bg-accent text-accent-ink',
  success: 'bg-emerald-600 text-white',
  error: 'bg-rose-600 text-white',
};

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((message, tone = 'info') => {
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-sm rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg ${TONES[t.tone]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
