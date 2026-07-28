'use client';

import { useEffect, useState } from 'react';

export function RegisterSW() {
  const [waiting, setWaiting] = useState(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          if (registration.waiting) setWaiting(registration.waiting);
          registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            installing?.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                setWaiting(installing);
              }
            });
          });
        })
        .catch(() => {});
    };

    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad);

    return () => window.removeEventListener('load', onLoad);
  }, []);

  if (!waiting) return null;

  return (
    <button
      type="button"
      onClick={() => {
        waiting.postMessage('SKIP_WAITING');
        window.location.reload();
      }}
      className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
    >
      تحديث متاح — اضغط للتحديث
    </button>
  );
}
